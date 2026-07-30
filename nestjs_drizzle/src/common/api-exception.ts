/**
 * 비즈니스 예외 (SR §3, §5). resultCode 를 담아 던지며,
 * 전역 예외 필터가 이를 표준 응답(HTTP 200)으로 변환한다.
 */
export class ApiException extends Error {
  constructor(readonly resultCode: number) {
    super(`ApiException(resultCode=${resultCode})`);
    this.name = 'ApiException';
  }
}
