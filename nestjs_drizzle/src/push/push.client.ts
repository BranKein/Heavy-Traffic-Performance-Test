import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorFileLogger } from '../logging/error-file.logger';

/**
 * Fake Push Server 로 개별 device 에 푸시를 전송한다 (SR §7).
 * 푸시 전송은 반드시 0.5초가 걸리고 5% 확률로 실패할 수 있으나,
 * 실패해도 채팅 서버 로직은 계속 진행되어야 하므로 예외를 삼킨다 (SR §7).
 * 단, 실패 시 error.log 에 Call Stack 을 남긴다 (SR §8).
 * spring_mvc_jpa 의 PushClient 와 동일한 역할.
 */
@Injectable()
export class PushClient implements OnModuleInit {
  private baseUrl!: string;

  constructor(
    private readonly config: ConfigService,
    private readonly errorFileLogger: ErrorFileLogger,
  ) {}

  onModuleInit(): void {
    this.baseUrl = this.config.getOrThrow<string>('PUSH_SERVER_URL');
  }

  async send(deviceId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      if (!response.ok) {
        throw new Error(`push server responded ${response.status}`);
      }
      // 응답 본문은 사용하지 않지만, 소켓 정리를 위해 소비한다.
      await response.arrayBuffer();
    } catch (e) {
      // 푸시 실패(5%)나 오류는 무시하고 계속 진행하되, error.log 에 기록 (SR §7, §8)
      this.errorFileLogger.log(`push send failed: deviceId=${deviceId}`, e);
    }
  }
}
