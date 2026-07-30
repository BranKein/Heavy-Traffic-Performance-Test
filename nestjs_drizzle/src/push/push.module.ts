import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PushClient } from './push.client';

/**
 * Fake Push Server 연동 모듈 (SR §7).
 */
@Module({
  imports: [ConfigModule],
  providers: [PushClient],
  exports: [PushClient],
})
export class PushModule {}
