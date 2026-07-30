package chat

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/yeonhyukkim/go_gin_pgx/internal/apierror"
	"github.com/yeonhyukkim/go_gin_pgx/internal/auth"
	"github.com/yeonhyukkim/go_gin_pgx/internal/logging"
	"github.com/yeonhyukkim/go_gin_pgx/internal/response"
	"github.com/yeonhyukkim/go_gin_pgx/internal/resultcode"
)

// Handler 는 채팅 전송 API 핸들러다 (SR §3). Spring 구현의 ChatController 에 대응한다.
type Handler struct {
	service     *Service
	errorLogger *logging.ErrorLogger
}

// NewHandler 는 Handler 를 만든다.
func NewHandler(service *Service, errorLogger *logging.ErrorLogger) *Handler {
	return &Handler{service: service, errorLogger: errorLogger}
}

// SendChat 은 POST /api/chat 을 처리한다.
// 모든 응답은 HTTP 200 이며 에러 여부는 resultCode 로 전달한다 (SR §5).
func (h *Handler) SendChat(c *gin.Context) {
	userPk := auth.UserPkFrom(c) // JWT 미들웨어가 넣어둔 principal

	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, response.Error(resultcode.InvalidRequest))
		return
	}

	chatPk, err := h.service.SendChat(c.Request.Context(), userPk, req.ChatRoomPk, req.ChatData)
	if err != nil {
		var apiErr *apierror.APIError
		if errors.As(err, &apiErr) {
			// 비즈니스 에러(예: 존재하지 않는 채팅방)의 발생 위치를 Call Stack 으로 기록 (SR §8)
			h.errorLogger.Log("business error: "+apiErr.Code.String(), err)
			c.JSON(http.StatusOK, response.Error(apiErr.Code))
			return
		}
		// 예기치 못한 서버 내부 오류 (SR §8)
		h.errorLogger.Log("unexpected server error", err)
		c.JSON(http.StatusOK, response.Error(resultcode.InternalError))
		return
	}

	c.JSON(http.StatusOK, response.Success(ChatResponse{ChatPk: chatPk}))
}
