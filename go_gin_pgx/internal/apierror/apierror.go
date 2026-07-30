// Package apierror 는 비즈니스 로직 중 발생하는, resultCode 로 변환 가능한 에러를 정의한다.
// Spring 구현의 ApiException 에 대응한다.
package apierror

import "github.com/yeonhyukkim/go_gin_pgx/internal/resultcode"

// APIError 는 특정 resultCode 를 담은 에러다.
type APIError struct {
	Code resultcode.Code
}

func (e *APIError) Error() string {
	return e.Code.String()
}

// New 는 주어진 코드를 담은 APIError 를 만든다.
func New(code resultcode.Code) *APIError {
	return &APIError{Code: code}
}
