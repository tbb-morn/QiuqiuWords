@echo off
setlocal
cd /d "%~dp0"
title Qiuqiu Words - Local Server
set "CACHE_BUST=%RANDOM%%RANDOM%"
set "LAUNCH_URL=http://127.0.0.1:17898/?v=%CACHE_BUST%"

if not exist "dist\index.html" (
  echo.
  echo   Build files are missing.
  echo   Run: npm install ^&^& npm run build
  echo.
  pause
  exit /b 1
)

rem If an old local server is running, stop it so the new build is served.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:17898/' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel%==0 (
  echo.
  echo   Closing old local server...
  powershell -NoProfile -Command "$pids = Get-NetTCPConnection -LocalPort 17898 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($procId in $pids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }; for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 100; $left = Get-NetTCPConnection -LocalPort 17898 -State Listen -ErrorAction SilentlyContinue; if (-not $left) { break } }"
  echo   Old server closed.
)

echo.
echo   Opening Qiuqiu Words ...
echo   Address: %LAUNCH_URL%
echo   All data stays in this browser. No internet is needed.
echo.
echo   Keep this window open while you study.
echo   Press Ctrl+C to stop the local server.
echo.

if defined QQ_NO_BROWSER goto runserver
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 900; Start-Process '%LAUNCH_URL%'"

:runserver
if exist "launcher\qqwords-server-windows-amd64.exe" (
  launcher\qqwords-server-windows-amd64.exe --root "%CD%\dist" --port 17898
  set SERVER_EXIT=%errorlevel%
  if not "%SERVER_EXIT%"=="0" pause
  exit /b %SERVER_EXIT%
)

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m http.server 17898 --bind 127.0.0.1 --directory dist
  set SERVER_EXIT=%errorlevel%
  if not "%SERVER_EXIT%"=="0" pause
  exit /b %SERVER_EXIT%
)

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 17898 --bind 127.0.0.1 --directory dist
  set SERVER_EXIT=%errorlevel%
  if not "%SERVER_EXIT%"=="0" pause
  exit /b %SERVER_EXIT%
)

where node >nul 2>nul
if %errorlevel%==0 (
  node launcher\serve.mjs "%CD%\dist" 17898
  set SERVER_EXIT=%errorlevel%
  if not "%SERVER_EXIT%"=="0" pause
  exit /b %SERVER_EXIT%
)

echo.
echo   The bundled server is missing, and Python / Node.js was not found.
echo.
pause
exit /b 1
