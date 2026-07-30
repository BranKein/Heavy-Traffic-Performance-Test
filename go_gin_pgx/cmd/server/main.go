// Command server 는 채팅 푸시 브로드캐스팅 서버를 띄운다 (Go/Gin/pgx 구현).
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/yeonhyukkim/go_gin_pgx/internal/auth"
	"github.com/yeonhyukkim/go_gin_pgx/internal/chat"
	"github.com/yeonhyukkim/go_gin_pgx/internal/config"
	"github.com/yeonhyukkim/go_gin_pgx/internal/logging"
	"github.com/yeonhyukkim/go_gin_pgx/internal/push"
	"github.com/yeonhyukkim/go_gin_pgx/internal/repository"
	"github.com/yeonhyukkim/go_gin_pgx/internal/server"
)

func main() {
	cfg := config.Load()

	// SIGINT/SIGTERM 에 반응하는 컨텍스트 (graceful shutdown).
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// 로그 파일 (server.log / error.log)
	logs, err := logging.Open(cfg.LogDir)
	if err != nil {
		log.Fatalf("failed to open log files: %v", err)
	}
	defer logs.Close()

	// DB 커넥션 풀
	pool, err := repository.NewPool(ctx, cfg.DatabaseURL, cfg.DBMaxConns)
	if err != nil {
		log.Fatalf("failed to create db pool: %v", err)
	}
	defer pool.Close()
	repo := repository.New(pool)

	// JWT 검증기 (RSA public key 주입)
	verifier := auth.NewVerifier(auth.MustParsePublicKey(cfg.JWTPublicKey))
	jwtMiddleware := auth.NewMiddleware(verifier)

	// 푸시 클라이언트
	pushClient := push.NewClient(cfg.PushServerURL, cfg.PushMaxConcurrency, cfg.PushMaxIdleConns, logs.Error)

	// 비동기 API 로거
	apiLogger := logging.NewAPILogger(repo, logs.Server, 4096, 4)
	apiLogger.Start()
	defer apiLogger.Stop()

	// 비즈니스 로직 + 핸들러 + 라우터
	chatService := chat.NewService(repo, pushClient, logs.Server, logs.Error)
	chatHandler := chat.NewHandler(chatService, logs.Error)
	router := server.NewRouter(chatHandler, jwtMiddleware, apiLogger, logs.Error)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	// 서버 기동
	go func() {
		log.Printf("server listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	// 종료 신호 대기 후 graceful shutdown
	<-ctx.Done()
	log.Println("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}
