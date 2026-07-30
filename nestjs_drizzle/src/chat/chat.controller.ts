import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ChatService } from './chat.service';
import { ChatRequest } from './dto/chat-request.dto';
import { ChatResponse } from './dto/chat-response.dto';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 채팅 전송 API (SR §3). userPk 는 JWT 인증 미들웨어가 req 에 주입한다.
 * 응답 래핑(GlobalResponse.success)과 HTTP 200 고정은 ResponseInterceptor 가 담당한다.
 */
@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(200)
  async sendChat(
    @Req() req: Request & { userPk: string },
    @Body() body: ChatRequest,
  ): Promise<ChatResponse> {
    if (
      !body ||
      typeof body.chatRoomPk !== 'string' ||
      !UUID_REGEX.test(body.chatRoomPk) ||
      typeof body.chatData !== 'string'
    ) {
      // 잘못된 요청 -> GlobalExceptionFilter 가 INVALID_REQUEST(4000) 으로 변환 (SR §5)
      throw new BadRequestException('invalid chat request');
    }

    const chatPk = await this.chatService.sendChat(
      req.userPk,
      body.chatRoomPk,
      body.chatData,
    );
    return { chatPk };
  }
}
