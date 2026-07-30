package logging

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/yeonhyukkim/go_gin_pgx/internal/repository"
)

// apiEntry 는 한 건의 API 요청 로그다 (SR §8: method, uri, 요청 시각, IP, body).
type apiEntry struct {
	method      string
	uri         string
	requestTime time.Time
	ip          string
	body        string
}

// APILogger 는 API 요청 로그를 파일(server.log)과 DB(api_log) 양쪽에 남긴다 (SR §8).
//
// 성능을 위해 로그 기록을 요청 스레드에서 분리한다: 미들웨어는 채널에 넣기만 하고(non-blocking),
// 백그라운드 워커가 파일/DB 에 실제로 쓴다. 버퍼가 가득 차면 로그를 버려서라도 요청 지연을 막는다
// (SR §8: 로그 저장 실패는 요청 처리에 영향을 주지 않는다).
type APILogger struct {
	repo    *repository.Repository
	fileLog *slog.Logger
	ch      chan apiEntry
	workers int
	wg      sync.WaitGroup
}

// NewAPILogger 는 buffer 크기의 채널과 workers 개의 워커를 준비한다.
func NewAPILogger(repo *repository.Repository, fileLog *slog.Logger, buffer, workers int) *APILogger {
	if workers < 1 {
		workers = 1
	}
	return &APILogger{
		repo:    repo,
		fileLog: fileLog,
		ch:      make(chan apiEntry, buffer),
		workers: workers,
	}
}

// Start 는 백그라운드 워커들을 띄운다.
func (a *APILogger) Start() {
	for i := 0; i < a.workers; i++ {
		a.wg.Add(1)
		go a.worker()
	}
}

// Stop 은 채널을 닫고 남은 로그를 다 쓸 때까지 기다린다.
func (a *APILogger) Stop() {
	close(a.ch)
	a.wg.Wait()
}

// Enqueue 는 로그를 큐에 넣는다. 큐가 가득 차면 즉시 버린다(요청 지연 방지).
func (a *APILogger) Enqueue(method, uri string, requestTime time.Time, ip, body string) {
	select {
	case a.ch <- apiEntry{method: method, uri: uri, requestTime: requestTime, ip: ip, body: body}:
	default:
		// 버퍼 초과 — 드롭
	}
}

func (a *APILogger) worker() {
	defer a.wg.Done()
	for e := range a.ch {
		a.write(e)
	}
}

func (a *APILogger) write(e apiEntry) {
	// 1) 파일 로그 (server.log)
	a.fileLog.Info("api request",
		"method", e.method,
		"uri", e.uri,
		"time", e.requestTime.Format(time.RFC3339),
		"ip", e.ip,
		"body", e.body,
	)

	// 2) DB 로그 (api_log). 실패해도 무시 (SR §8).
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = a.repo.InsertAPILog(
		ctx,
		uuid.NewString(),
		truncate(e.method, 6),
		truncate(e.uri, 64),
		e.requestTime,
		truncate(e.ip, 64),
		e.body,
	)
}

// truncate 는 DDL 의 varchar 길이에 맞춰 문자열을 자른다.
func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
