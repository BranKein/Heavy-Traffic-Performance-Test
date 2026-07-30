// Package push 는 Fake Push Server 로 device 별 푸시를 전송한다 (SR §7).
//
// 푸시는 반드시 0.5초가 걸리고 5% 확률로 실패하지만, 실패해도 채팅 로직은 계속되어야 하므로
// 에러를 삼킨다(단, error.log 에 기록). 여러 device 로의 전송은 goroutine 으로 동시에 발사하고,
// 세마포어(errgroup.SetLimit)로 동시 요청 수를 제한한다.
package push

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/yeonhyukkim/go_gin_pgx/internal/logging"
	"golang.org/x/sync/errgroup"
)

// pushRequest 는 Fake Push Server 요청 body 다 (SR §7.2).
type pushRequest struct {
	DeviceID string `json:"deviceId"`
}

// Client 는 튜닝된 http.Client 로 푸시를 보낸다.
type Client struct {
	url            string
	maxConcurrency int
	httpClient     *http.Client
	errorLogger    *logging.ErrorLogger
}

// NewClient 는 푸시 클라이언트를 만든다.
//
// 트래픽이 몰릴 때 성능을 좌우하는 것은 http.Client 의 커넥션 재사용이다:
// 매 요청마다 TCP/TLS 를 새로 맺으면 커넥션이 폭증한다. 그래서 클라이언트를 하나만 두고
// keep-alive idle 커넥션 풀을 넉넉히 잡는다.
//
// maxConcurrency 는 "방 하나당" 동시 푸시 상한(errgroup 세마포어)이고,
// maxIdleConns 는 "서버 전체"가 fake-push 로 유지·재사용하는 커넥션 풀 크기다. 이 둘은 척도가
// 다르므로 분리한다 — idle 풀을 방당 상한에 묶으면(예전: maxConcurrency*4=256) 전체 인플라이트가
// 그 수를 넘는 순간부터 매 요청이 새 커넥션을 맺고 버려(idle 풀 초과분은 반환되지 않음) 커넥션이
// 폭증한다. fake-push 스케일아웃 시 목표 push/s × 0.5s 만큼(기본 12000) 재사용 풀을 확보한다.
// MaxConnsPerHost 는 0(무제한)으로 두어 커넥션 획득이 블로킹되지 않게 한다.
func NewClient(url string, maxConcurrency, maxIdleConns int, errorLogger *logging.ErrorLogger) *Client {
	if maxConcurrency < 1 {
		maxConcurrency = 1
	}
	if maxIdleConns < 1 {
		maxIdleConns = maxConcurrency * 4
	}
	transport := &http.Transport{
		MaxIdleConns:        maxIdleConns,
		MaxIdleConnsPerHost: maxIdleConns,
		MaxConnsPerHost:     0, // 무제한: 커넥션 획득이 대기(블로킹)되지 않도록
		IdleConnTimeout:     90 * time.Second,
	}
	return &Client{
		url:            url,
		maxConcurrency: maxConcurrency,
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   5 * time.Second, // 0.5초 지연 + 여유
		},
		errorLogger: errorLogger,
	}
}

// Broadcast 는 여러 device 로 동시에 푸시를 전송하고, 전부 끝날 때까지 기다린다 (SR §3-4).
// 개별 실패는 무시하므로 그룹 전체를 취소하지 않는다(항상 nil 반환).
func (c *Client) Broadcast(ctx context.Context, deviceIDs []string) {
	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(c.maxConcurrency) // 방당 동시 푸시 상한
	for _, id := range deviceIDs {
		id := id
		g.Go(func() error {
			c.send(ctx, id)
			return nil
		})
	}
	_ = g.Wait()
}

func (c *Client) send(ctx context.Context, deviceID string) {
	body, err := json.Marshal(pushRequest{DeviceID: deviceID})
	if err != nil {
		c.errorLogger.Log("push request marshal failed: deviceId="+deviceID, err)
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url+"/api/push", bytes.NewReader(body))
	if err != nil {
		c.errorLogger.Log("push request build failed: deviceId="+deviceID, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		// 네트워크/타임아웃 오류 — 무시하고 계속 진행하되 error.log 에 기록 (SR §7, §8).
		c.errorLogger.Log("push send failed: deviceId="+deviceID, err)
		return
	}
	defer resp.Body.Close()
	// keep-alive 커넥션 재사용을 위해 body 를 끝까지 비운다.
	_, _ = io.Copy(io.Discard, resp.Body)
}
