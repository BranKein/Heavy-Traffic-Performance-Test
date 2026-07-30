package logging

import (
	"bytes"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// maxBodyCache 는 로깅을 위해 캐싱하는 request body 한도(bytes)다.
const maxBodyCache = 1 << 20 // 1 MiB

// RequestLogging 은 들어오는 모든 요청(GET 제외)의 request 로그를 남기는 gin 미들웨어다 (SR §8).
//
//   - 기록 항목: HTTP method, URI, 요청 시각, IP, request body
//   - Authorization 등 헤더는 기록하지 않는다.
//   - 실제 기록은 APILogger 가 비동기로 처리하므로 요청 지연이 거의 없다.
func RequestLogging(apiLogger *APILogger) gin.HandlerFunc {
	return func(c *gin.Context) {
		// GET 은 로깅 대상에서 제외 (SR §8).
		if c.Request.Method == http.MethodGet {
			c.Next()
			return
		}

		requestTime := time.Now()

		// body 를 읽어 로깅용으로 보관하고, 핸들러가 다시 읽을 수 있도록 되돌려 놓는다.
		var body []byte
		if c.Request.Body != nil {
			body, _ = io.ReadAll(io.LimitReader(c.Request.Body, maxBodyCache))
			c.Request.Body = io.NopCloser(bytes.NewReader(body))
		}

		method := c.Request.Method
		uri := c.Request.URL.Path
		ip := c.ClientIP() // gin 이 X-Forwarded-For 등을 고려해 클라이언트 IP 를 판별

		c.Next()

		apiLogger.Enqueue(method, uri, requestTime, ip, string(body))
	}
}
