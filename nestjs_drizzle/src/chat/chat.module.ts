import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PushModule } from '../push/push.module';

/**
 * 채팅 브로드캐스팅 도메인 모듈 (SR §3).
 */
@Module({
  imports: [PushModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
