import { Global, Module } from '@nestjs/common';
import { ApiLogService } from './api-log.service';
import { ErrorFileLogger } from './error-file.logger';
import { RequestLoggingMiddleware } from './request-logging.middleware';
import { WINSTON_SERVER_LOGGER } from './logging.tokens';
import { createServerLogger } from './winston.config';

/**
 * 로깅 관련 provider 를 묶는 전역 모듈 (SR §8).
 * server.log 로거는 앱 전체에서 공유하므로 전역으로 노출한다.
 */
@Global()
@Module({
  providers: [
    {
      provide: WINSTON_SERVER_LOGGER,
      useFactory: () => createServerLogger(),
    },
    ApiLogService,
    ErrorFileLogger,
    RequestLoggingMiddleware,
  ],
  exports: [
    WINSTON_SERVER_LOGGER,
    ApiLogService,
    ErrorFileLogger,
    RequestLoggingMiddleware,
  ],
})
export class LoggingModule {}
