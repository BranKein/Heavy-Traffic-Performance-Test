import { Injectable } from '@nestjs/common';
import type { Logger } from 'winston';
import { createErrorLogger } from './winston.config';

/**
 * 서버 내부 에러 및 푸시 전송 에러의 Call Stack 을 error.log 로 출력한다 (SR §8).
 * spring_mvc_jpa 의 ErrorFileLogger 와 동일한 역할.
 */
@Injectable()
export class ErrorFileLogger {
  private readonly logger: Logger = createErrorLogger();

  log(message: string, error: unknown): void {
    if (error instanceof Error) {
      // Call Stack 을 error.log 에 남긴다 (SR §8).
      this.logger.error(message, { stack: error.stack });
    } else {
      this.logger.error(`${message} ${String(error)}`);
    }
  }
}
