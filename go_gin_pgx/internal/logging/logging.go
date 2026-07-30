// Package logging 은 server.log / error.log 두 개의 로그 파일을 관리한다 (SR §8).
//
//   - server.log : 서버 자체 로그 + API 요청 로그
//   - error.log  : 서버 내부 에러 / 푸시 전송 에러의 Call Stack
package logging

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"runtime/debug"
	"sync"
	"time"
)

// Logs 는 열려 있는 로그 파일과 로거들을 묶는다.
type Logs struct {
	Server *slog.Logger // server.log 로 나가는 구조화 로거
	Error  *ErrorLogger // error.log 전용

	serverFile *os.File
	errorFile  *os.File
}

// Open 은 dir 아래에 server.log / error.log 를 열고 로거를 구성한다.
func Open(dir string) (*Logs, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	serverFile, err := openAppend(filepath.Join(dir, "server.log"))
	if err != nil {
		return nil, err
	}
	errorFile, err := openAppend(filepath.Join(dir, "error.log"))
	if err != nil {
		serverFile.Close()
		return nil, err
	}

	serverLogger := slog.New(slog.NewTextHandler(serverFile, &slog.HandlerOptions{Level: slog.LevelInfo}))

	return &Logs{
		Server:     serverLogger,
		Error:      &ErrorLogger{file: errorFile},
		serverFile: serverFile,
		errorFile:  errorFile,
	}, nil
}

// Close 는 로그 파일들을 닫는다.
func (l *Logs) Close() error {
	err1 := l.serverFile.Close()
	err2 := l.errorFile.Close()
	if err1 != nil {
		return err1
	}
	return err2
}

func openAppend(path string) (*os.File, error) {
	return os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
}

// ErrorLogger 는 에러 메시지와 Call Stack 을 error.log 에 남긴다 (SR §8).
// Spring 구현의 ErrorFileLogger 에 대응한다.
type ErrorLogger struct {
	mu   sync.Mutex
	file *os.File
}

// Log 는 메시지, 에러, 그리고 현재 goroutine 의 Call Stack 을 기록한다.
func (e *ErrorLogger) Log(message string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	fmt.Fprintf(e.file,
		"%s ERROR %s: %v\n%s\n",
		time.Now().Format(time.RFC3339),
		message,
		err,
		debug.Stack(),
	)
}
