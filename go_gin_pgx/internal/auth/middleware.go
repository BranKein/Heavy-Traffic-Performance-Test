package auth

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/yeonhyukkim/go_gin_pgx/internal/response"
	"github.com/yeonhyukkim/go_gin_pgx/internal/resultcode"
)

const (
	bearerPrefix = "Bearer "
	userPkKey    = "userPk"
)

// Middleware 는 보호 대상 요청의 JWT 를 검증하는 gin 미들웨어다 (SR §4).
// 검증 실패 시에도 HTTP 200 + 표준 응답(resultCode)을 반환한다 (SR §5).
type Middleware struct {
	verifier *Verifier
}

// NewMiddleware 는 Middleware 를 만든다.
func NewMiddleware(verifier *Verifier) *Middleware {
	return &Middleware{verifier: verifier}
}

// Handle 은 Authorization 헤더의 Bearer 토큰을 검증하고 userPk 를 컨텍스트에 넣는다.
func (m *Middleware) Handle(c *gin.Context) {
	authz := c.GetHeader("Authorization")
	if !strings.HasPrefix(authz, bearerPrefix) {
		abort(c, resultcode.TokenMissing)
		return
	}

	userPk, err := m.verifier.Verify(strings.TrimSpace(authz[len(bearerPrefix):]))
	if err != nil {
		code := resultcode.TokenMalformed
		var ve *VerifyError
		if errors.As(err, &ve) {
			code = ve.Code
		}
		abort(c, code)
		return
	}

	c.Set(userPkKey, userPk)
	c.Next()
}

// UserPkFrom 은 미들웨어가 컨텍스트에 넣어둔 userPk 를 꺼낸다.
func UserPkFrom(c *gin.Context) uuid.UUID {
	if v, ok := c.Get(userPkKey); ok {
		if id, ok := v.(uuid.UUID); ok {
			return id
		}
	}
	return uuid.Nil
}

func abort(c *gin.Context, code resultcode.Code) {
	c.JSON(http.StatusOK, response.Error(code))
	c.Abort()
}
