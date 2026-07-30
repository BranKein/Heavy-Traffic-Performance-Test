import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiException } from './api-exception';
import { GlobalResponse } from './global-response';
import { ResultCode } from './result-code.enum';
import { ErrorFileLogger } from '../logging/error-file.logger';

/**
 * 컨트롤러/서비스에서 발생한 모든 예외를 표준 응답 DTO(HTTP 200)로 변환한다 (SR §5).
 * 서버 내부에서 발생한 에러는 error.log 에 Call Stack 을 남긴다 (SR §8).
 * spring_mvc_jpa 의 GlobalExceptionHandler 와 동일한 역할.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly errorFileLogger: ErrorFileLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let resultCode: number;

    if (exception instanceof ApiException) {
      // 존재하지 않는 채팅방 등 비즈니스 에러의 발생 위치를 Call Stack 으로 기록 (SR §8)
      this.errorFileLogger.log(`business error: ${exception.resultCode}`, exception);
      resultCode = exception.resultCode;
    } else if (exception instanceof BadRequestException) {
      // request body 파싱/검증 실패 -> INVALID_REQUEST (SR §5)
      resultCode = ResultCode.INVALID_REQUEST;
    } else {
      // 그 외 예기치 못한 서버 오류
      this.errorFileLogger.log('unexpected server error', exception);
      resultCode = ResultCode.INTERNAL_ERROR;
    }

    res.status(200).json(GlobalResponse.error(resultCode));
  }
}
