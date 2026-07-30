import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { DrizzleModule } from './db/drizzle.module';
import { LoggingModule } from './logging/logging.module';
import { RequestLoggingMiddleware } from './logging/request-logging.middleware';
import { SecurityModule } from './security/security.module';
import { JwtAuthMiddleware } from './security/jwt-auth.middleware';
import { ChatModule } from './chat/chat.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { ResponseInterceptor } from './common/response.interceptor';

/**
 * 애플리케이션 루트 모듈.
 * 미들웨어 실행 순서: 요청 로깅(전 경로) -> JWT 인증(/api/chat) 순.
 * (spring 의 RequestLoggingFilter HIGHEST_PRECEDENCE -> JwtAuthenticationFilter 와 동일)
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    LoggingModule,
    SecurityModule,
    ChatModule,
  ],
  providers: [
    // 모든 응답을 표준 DTO(HTTP 200)로 통일한다 (SR §5).
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 요청 로깅은 GET 을 제외한 모든 경로에 적용된다(내부에서 GET 필터링, SR §8).
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
    // JWT 인증은 보호 대상 경로에만 적용된다 (SR §4).
    consumer.apply(JwtAuthMiddleware).forRoutes('api/chat');
  }
}
