import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtVerifier } from './jwt-verifier';
import { JwtAuthMiddleware } from './jwt-auth.middleware';

/**
 * JWT 인증 관련 provider 를 묶는 모듈 (SR §4).
 */
@Module({
  imports: [ConfigModule],
  providers: [JwtVerifier, JwtAuthMiddleware],
  exports: [JwtVerifier, JwtAuthMiddleware],
})
export class SecurityModule {}
