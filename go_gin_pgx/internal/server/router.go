// Package server 는 gin 라우터를 구성한다.
package server

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/yeonhyukkim/go_gin_pgx/internal/auth"
	"github.com/yeonhyukkim/go_gin_pgx/internal/chat"
	"github.com/yeonhyukkim/go_gin_pgx/internal/logging"
	"github.com/yeonhyukkim/go_gin_pgx/internal/response"
	"github.com/yeonhyukkim/go_gin_pgx/internal/resultcode"
)

// NewRouter 는 미들웨어와 라우트를 등록한 gin 엔진을 만든다.
func NewRouter(
	chatHandler *chat.Handler,
	jwtMiddleware *auth.Middleware,
	apiLogger *logging.APILogger,
	errorLogger *logging.ErrorLogger,
) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	// panic 복구: error.log 에 Call Stack 을 남기고 표준 응답(HTTP 200)을 반환한다 (SR §8).
	r.Use(gin.CustomRecovery(func(c *gin.Context, recovered any) {
		errorLogger.Log("panic recovered", fmt.Errorf("%v", recovered))
		c.JSON(http.StatusOK, response.Error(resultcode.InternalError))
	}))

	// 모든 요청(GET 제외) request 로깅 (SR §8).
	r.Use(logging.RequestLogging(apiLogger))

	// /api/chat 은 JWT 검증 후 접근 (SR §4).
	protected := r.Group("/api/chat")
	protected.Use(jwtMiddleware.Handle)
	protected.POST("", chatHandler.SendChat)

	return r
}
