#!/bin/bash
# 丘丘背单词 · macOS 一键启动
# 只在本机启动一个静态文件服务，不联网、不上传任何数据。

set -u

cd "$(dirname "$0")" || exit 1

PORT=17898
URL="http://127.0.0.1:${PORT}/"
# 每次启动都带一个唯一的查询参数，绕过旧页面缓存；IndexedDB 的数据归属不受影响。
LAUNCH_URL="${URL}?v=$(/bin/date +%s)-$$"
LOG_FILE="/tmp/qiuqiu-words-server.log"
SERVER_PID=""
SERVER_KIND=""

show_message() {
  /usr/bin/osascript -e "display dialog \"$1\" buttons {\"好\"} with title \"丘丘背单词\" with icon note" >/dev/null 2>&1 \
    || echo "$1"
}

open_readme() {
  if [ -f "使用说明.md" ]; then
    /usr/bin/open "使用说明.md"
  elif [ -f "README.md" ]; then
    /usr/bin/open "README.md"
  fi
}

if [ ! -f "dist/index.html" ]; then
  show_message "没有找到构建好的网页文件（dist/index.html）。请先把完整的 丘丘背单词 文件夹放在一起，不要只移动启动脚本。"
  exit 1
fi

# 如果旧版正在运行，先自动关闭旧服务，确保加载当前文件夹里的新版。
if /usr/bin/curl -fsS --max-time 2 "$URL" 2>/dev/null | /usr/bin/grep -q "丘丘背单词"; then
  echo "检测到旧版服务正在运行，正在自动关闭旧版..."
  OLD_PIDS="$(/usr/sbin/lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t 2>/dev/null || true)"
  for pid in $OLD_PIDS; do
    kill "$pid" 2>/dev/null || true
  done
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    if ! /usr/sbin/lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
    attempt=$((attempt + 1))
  done
  REMAINING="$(/usr/sbin/lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t 2>/dev/null || true)"
  if [ -n "$REMAINING" ]; then
    for pid in $REMAINING; do
      kill -9 "$pid" 2>/dev/null || true
    done
    sleep 0.2
  fi
  if /usr/sbin/lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
    show_message "旧版服务没有成功关闭，端口 ${PORT} 仍被占用。请在活动监视器中结束旧的 丘丘背单词 服务后重试。"
    exit 1
  fi
fi

# 让非交互式 shell 也能找到 Homebrew / nvm 里的命令。
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
if [ -d "$HOME/.nvm/versions/node" ]; then
  for node_bin in "$HOME"/.nvm/versions/node/*/bin; do
    [ -d "$node_bin" ] && export PATH="$node_bin:$PATH"
  done
fi

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

: > "$LOG_FILE"

stop_candidate() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=""
}

wait_for_server() {
  attempt=0
  while [ "$attempt" -lt 40 ]; do
    if /usr/bin/curl -fsS --max-time 1 "$URL" 2>/dev/null | /usr/bin/grep -q "丘丘背单词"; then
      return 0
    fi
    sleep 0.1
    attempt=$((attempt + 1))
  done
  return 1
}

# 1) 优先使用随 App 一起放好的本地小服务，不依赖系统运行时。
ARCH="$(/usr/bin/uname -m)"
case "$ARCH" in
  arm64) BUNDLED_SERVER="launcher/qqwords-server-darwin-arm64" ;;
  x86_64) BUNDLED_SERVER="launcher/qqwords-server-darwin-amd64" ;;
  *) BUNDLED_SERVER="" ;;
esac
if [ -n "$BUNDLED_SERVER" ] && [ -f "$BUNDLED_SERVER" ]; then
  # 随包附带的本地服务不是从 App Store 下载的，主动去掉下载隔离标记，
  # 避免 macOS 因为“无法验证开发者”而阻止它启动。
  /usr/bin/xattr -dr com.apple.quarantine "$PWD/launcher" 2>/dev/null || true
  chmod +x "$BUNDLED_SERVER" 2>/dev/null || true
  SERVER_KIND="内置本地服务"
  "$BUNDLED_SERVER" --root "$PWD/dist" --port "$PORT" >>"$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  if wait_for_server; then
    :
  else
    stop_candidate
  fi
fi

# 2) 自带服务没能启动时，依次尝试 Python 3、Ruby、Node.js。
if [ -z "$SERVER_PID" ] && command -v python3 >/dev/null 2>&1; then
  SERVER_KIND="Python 3"
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$PWD/dist" >>"$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  if wait_for_server; then
    :
  else
    stop_candidate
  fi
fi

if [ -z "$SERVER_PID" ] && command -v ruby >/dev/null 2>&1; then
  SERVER_KIND="Ruby"
  (cd dist && exec ruby -run -e httpd . -p "$PORT" -b 127.0.0.1) >>"$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  if wait_for_server; then
    :
  else
    stop_candidate
  fi
fi

if [ -z "$SERVER_PID" ] && command -v node >/dev/null 2>&1; then
  SERVER_KIND="Node.js"
  node "launcher/serve.mjs" "$PWD/dist" "$PORT" >>"$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  if wait_for_server; then
    :
  else
    stop_candidate
  fi
fi

if [ -z "$SERVER_PID" ]; then
  show_message "本地服务没有启动成功。可能是 macOS 拦截了未签名的启动文件，或端口 ${PORT} 被占用。请右键点击 start-mac.command 选择「打开」，或阅读使用说明。"
  echo ""
  echo "  启动失败。可以试试在终端中执行："
  echo "  xattr -dr com.apple.quarantine \"$PWD\""
  echo ""
  echo "  ------ 最近日志 ------"
  tail -n 25 "$LOG_FILE" 2>/dev/null
  open_readme
  exit 1
fi

/usr/bin/open "$LAUNCH_URL"

clear
echo ""
echo "  🐣  丘丘背单词已经打开啦"
echo ""
echo "  地址：$LAUNCH_URL"
echo "  本地服务：${SERVER_KIND}（仅监听本机，不联网）"
echo ""
echo "  所有单词与学习记录都保存在浏览器本地。"
echo "  这个终端窗口就是本地服务，把它最小化就好。"
echo "  想停止时，关闭这个窗口，或按 Control + C。"
echo ""
echo "  记得定期在词库里导出 JSON 备份单词内容。"
echo ""

wait "$SERVER_PID"
