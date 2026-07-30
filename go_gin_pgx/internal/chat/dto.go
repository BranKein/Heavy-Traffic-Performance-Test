package chat

import "github.com/google/uuid"

// ChatRequest 는 채팅 전송 요청이다. userPk 는 JWT 에서 얻으므로 body 에 없다.
type ChatRequest struct {
	ChatRoomPk uuid.UUID `json:"chatRoomPk"`
	ChatData   string    `json:"chatData"`
}

// ChatResponse 는 저장된 채팅 레코드의 PK 를 반환한다 (SR §2.1).
type ChatResponse struct {
	ChatPk uuid.UUID `json:"chatPk"`
}
