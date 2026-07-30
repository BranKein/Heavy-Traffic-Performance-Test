import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Logger } from 'winston';
import { DRIZZLE, Database } from '../db/drizzle.module';
import { apiLog } from '../db/schema';
import { WINSTON_SERVER_LOGGER } from './logging.tokens';

/**
 * API 요청 로그를 파일(server.log)과 DB(api_log) 양쪽에 남긴다 (SR §8).
 * 파일/DB 저장이 각각 실패하더라도 사용자 요청 흐름에는 영향을 주지 않는다.
 * spring_mvc_jpa 의 ApiLogService 와 동일한 역할.
 */
@Injectable()
export class ApiLogService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(WINSTON_SERVER_LOGGER) private readonly fileLog: Logger,
  ) {}

  async record(
    httpMethod: string,
    uri: string,
    requestTime: Date,
    ip: string | null,
    requestBody: string | null,
  ): Promise<void> {
    // 1) 파일 로그 (server.log)
    try {
      this.fileLog.info(
        `[api] method=${httpMethod} uri=${uri} time=${requestTime.toISOString()} ip=${ip ?? ''} body=${requestBody ?? ''}`,
      );
    } catch {
      // 파일 로깅 실패는 요청 진행에 영향 없음 (SR §8)
    }

    // 2) DB 로그 (api_log) — 실패해도 무시
    try {
      await this.db.insert(apiLog).values({
        pk: randomUUID(),
        httpMethod: truncate(httpMethod, 6),
        uri: truncate(uri, 64),
        requestTime,
        ip: truncate(ip, 64),
        requestBody,
      });
    } catch {
      // DB 로깅 실패는 요청 진행에 영향 없음 (SR §8)
    }
  }
}

function truncate(value: string | null, maxLength: number): string | null {
  if (value === null) {
    return null;
  }
  return value.length <= maxLength ? value : value.substring(0, maxLength);
}
