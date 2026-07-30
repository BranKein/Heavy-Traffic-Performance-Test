import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { Logger } from 'winston';
import { DRIZZLE, Database } from '../db/drizzle.module';
import { chat, chatRoom, device, userChatRoom } from '../db/schema';
import { ApiException } from '../common/api-exception';
import { ResultCode } from '../common/result-code.enum';
import { PushClient } from '../push/push.client';
import { WINSTON_SERVER_LOGGER } from '../logging/logging.tokens';

/**
 * 채팅 브로드캐스팅 비즈니스 로직 (SR §3).
 *
 * <p>DB 검증/저장/조회는 하나의 트랜잭션으로 처리하고(SR §6 — 단일 테이블 저장이라도
 * 트랜잭션 필수), 외부 푸시 전송은 트랜잭션 밖에서 병렬로 브로드캐스팅한다.
 */
@Injectable()
export class ChatService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly pushClient: PushClient,
    @Inject(WINSTON_SERVER_LOGGER) private readonly log: Logger,
  ) {}

  async sendChat(
    userPk: string,
    chatRoomPk: string,
    chatData: string,
  ): Promise<string> {
    // --- 트랜잭션: 검증 -> 저장 -> 조회 (SR §3-1 ~ §3-3, §6) ---
    const { chatPk, deviceIds } = await this.db.transaction(async (tx) => {
      // 1. 채팅방 존재 여부 및 사용자 참여 여부 확인 (SR §3-1)
      const room = await tx
        .select({ pk: chatRoom.pk })
        .from(chatRoom)
        .where(eq(chatRoom.pk, chatRoomPk))
        .limit(1);
      if (room.length === 0) {
        throw new ApiException(ResultCode.CHATROOM_NOT_FOUND);
      }

      const membership = await tx
        .select({ userFk: userChatRoom.userFk })
        .from(userChatRoom)
        .where(
          and(
            eq(userChatRoom.userFk, userPk),
            eq(userChatRoom.chatRoomFk, chatRoomPk),
          ),
        )
        .limit(1);
      if (membership.length === 0) {
        throw new ApiException(ResultCode.USER_NOT_IN_CHATROOM);
      }

      // 2. 채팅 레코드 추가 (SR §3-2)
      const newChatPk = randomUUID();
      await tx.insert(chat).values({
        pk: newChatPk,
        chatRoomFk: chatRoomPk,
        userFk: userPk,
        chatData,
        createDate: new Date(),
      });

      // 3. 채팅방의 모든 사용자 조회 (SR §3-3)
      const members = await tx
        .select({ userFk: userChatRoom.userFk })
        .from(userChatRoom)
        .where(eq(userChatRoom.chatRoomFk, chatRoomPk));
      const userPks = members.map((m) => m.userFk);

      // 사용자들의 device 조회
      const devices =
        userPks.length === 0
          ? []
          : await tx
              .select({ deviceId: device.deviceId })
              .from(device)
              .where(inArray(device.userFk, userPks));
      const ids = devices
        .map((d) => d.deviceId)
        .filter((id): id is string => id !== null);

      return { chatPk: newChatPk, deviceIds: ids };
    });

    // 4. 사용자들의 모든 device 로 푸시 전송 + 시간 측정 (SR §3-4)
    const start = performance.now();
    await Promise.all(this.deviceIdsToPushes(deviceIds));
    const elapsedMs = Math.round(performance.now() - start);
    this.log.info(
      `push broadcast done: chatRoom=${chatRoomPk} devices=${deviceIds.length} elapsedMs=${elapsedMs}`,
    );

    return chatPk;
  }

  private deviceIdsToPushes(deviceIds: string[]): Promise<void>[] {
    return deviceIds.map((deviceId) => this.pushClient.send(deviceId));
  }
}
