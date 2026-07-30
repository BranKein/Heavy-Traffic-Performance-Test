// Package response 는 모든 API 가 동일한 형태로 반환하는 응답 DTO 를 정의한다 (SR §5).
// Spring 구현의 GlobalResponse<T> 에 대응한다.
package response

import "github.com/yeonhyukkim/go_gin_pgx/internal/resultcode"

// GlobalResponse 는 표준 응답 포맷이다. resultData 는 임의 타입(제네릭 대응)이다.
type GlobalResponse struct {
	ResultCode resultcode.Code `json:"resultCode"`
	ResultData any             `json:"resultData"`
}

// Success 는 성공 응답(resultCode=100)을 만든다.
func Success(data any) GlobalResponse {
	return GlobalResponse{ResultCode: resultcode.Success, ResultData: data}
}

// Error 는 실패 응답을 만든다. resultData 는 null 이다.
func Error(code resultcode.Code) GlobalResponse {
	return GlobalResponse{ResultCode: code, ResultData: nil}
}
