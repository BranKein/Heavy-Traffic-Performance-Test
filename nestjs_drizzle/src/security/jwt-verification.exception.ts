/**
 * JWT 검증 실패 예외 (SR §4). 실패 원인별 resultCode 를 담는다.
 * 인증 미들웨어가 이를 catch 하여 HTTP 200 표준 응답으로 변환한다.
 */
export class JwtVerificationException extends Error {
  constructor(readonly resultCode: number) {
    super(`JwtVerificationException(resultCode=${resultCode})`);
    this.name = 'JwtVerificationException';
  }
}
