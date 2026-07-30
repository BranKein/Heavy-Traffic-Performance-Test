// Package resultcode 는 모든 API 응답의 resultCode 를 한 곳에서 관리한다 (SR §5.4).
// Spring 구현의 ResultCodeEnum 에 대응한다. JSON 으로는 정수 code 로 직렬화된다 (SR §5.1).
package resultcode

// Code 는 응답 resultCode 값이다. 밑단이 int 이므로 JSON 에는 정수로 직렬화된다.
type Code int

const (
	Success Code = 100

	// 요청/공통
	InvalidRequest Code = 4000

	// 인증(JWT) — SR §4
	TokenMissing          Code = 4001
	TokenMalformed        Code = 4002
	TokenInvalidAlgorithm Code = 4003
	TokenInvalidSignature Code = 4004
	TokenExpired          Code = 4005
	TokenInvalidIssuer    Code = 4006

	// 비즈니스 — SR §3
	ChatRoomNotFound  Code = 5001
	UserNotInChatRoom Code = 5002

	// 서버 내부 오류
	InternalError Code = 9000
)

// String 은 로깅용 이름을 돌려준다.
func (c Code) String() string {
	switch c {
	case Success:
		return "SUCCESS"
	case InvalidRequest:
		return "INVALID_REQUEST"
	case TokenMissing:
		return "TOKEN_MISSING"
	case TokenMalformed:
		return "TOKEN_MALFORMED"
	case TokenInvalidAlgorithm:
		return "TOKEN_INVALID_ALGORITHM"
	case TokenInvalidSignature:
		return "TOKEN_INVALID_SIGNATURE"
	case TokenExpired:
		return "TOKEN_EXPIRED"
	case TokenInvalidIssuer:
		return "TOKEN_INVALID_ISSUER"
	case ChatRoomNotFound:
		return "CHATROOM_NOT_FOUND"
	case UserNotInChatRoom:
		return "USER_NOT_IN_CHATROOM"
	case InternalError:
		return "INTERNAL_ERROR"
	default:
		return "UNKNOWN"
	}
}
