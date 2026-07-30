import { ResultCode } from './result-code.enum';

/**
 * 모든 API 가 동일한 형태로 반환하는 표준 응답 DTO (SR §5).
 * resultData 는 제네릭 타입이며, 오류 시 null 이다.
 */
export class GlobalResponse<T> {
  constructor(
    readonly resultCode: number,
    readonly resultData: T | null,
  ) {}

  static success<T>(resultData: T): GlobalResponse<T> {
    return new GlobalResponse<T>(ResultCode.SUCCESS, resultData);
  }

  static error(resultCode: number): GlobalResponse<null> {
    return new GlobalResponse<null>(resultCode, null);
  }
}
