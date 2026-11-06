// 丘丘背单词 · tiny local static server
// 只监听 127.0.0.1，不访问网络，不收集数据。
package main

import (
	"flag"
	"fmt"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func main() {
	rootFlag := flag.String("root", "dist", "directory containing the built web app")
	portFlag := flag.Int("port", 17898, "local port to listen on")
	flag.Parse()

	root, err := filepath.Abs(*rootFlag)
	if err != nil {
		log.Fatalf("无法定位网页文件夹: %v", err)
	}
	indexPath := filepath.Join(root, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		log.Fatalf("没有找到网页文件: %s", indexPath)
	}

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *portFlag))
	if err != nil {
		fmt.Fprintf(os.Stderr, "端口 %d 没有启动成功: %v\n", *portFlag, err)
		os.Exit(1)
	}

	handler := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet && request.Method != http.MethodHead {
			http.Error(response, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		urlPath := path.Clean("/" + request.URL.Path)
		target := filepath.Join(root, filepath.FromSlash(strings.TrimPrefix(urlPath, "/")))
		if target != root && !strings.HasPrefix(target, root+string(os.PathSeparator)) {
			http.Error(response, "Not found", http.StatusNotFound)
			return
		}

		info, statErr := os.Stat(target)
		if statErr != nil || info.IsDir() {
			target = indexPath
		}

		extension := strings.ToLower(filepath.Ext(target))
		contentType := mime.TypeByExtension(extension)
		switch extension {
		case ".html":
			contentType = "text/html; charset=utf-8"
		case ".js", ".mjs":
			contentType = "text/javascript; charset=utf-8"
		case ".css":
			contentType = "text/css; charset=utf-8"
		case ".json":
			contentType = "application/json; charset=utf-8"
		case ".svg":
			contentType = "image/svg+xml"
		case ".png":
			contentType = "image/png"
		case ".jpg", ".jpeg":
			contentType = "image/jpeg"
		case ".webp":
			contentType = "image/webp"
		case ".gif":
			contentType = "image/gif"
		case ".woff":
			contentType = "font/woff"
		case ".woff2":
			contentType = "font/woff2"
		case ".ico":
			contentType = "image/x-icon"
		}
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		response.Header().Set("Content-Type", contentType)
		response.Header().Set("X-Content-Type-Options", "nosniff")
		response.Header().Set("Referrer-Policy", "no-referrer")
		if extension == ".html" {
			response.Header().Set("Cache-Control", "no-cache")
		} else {
			response.Header().Set("Cache-Control", "public, max-age=3600, must-revalidate")
		}
		http.ServeFile(response, request, target)
	})

	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	fmt.Printf("READY http://127.0.0.1:%d/\n", *portFlag)
	server.SetKeepAlivesEnabled(true)

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-shutdown
		_ = server.Close()
	}()

	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
