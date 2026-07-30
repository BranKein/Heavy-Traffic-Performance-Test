import 'reflect-metadata';
import 'dotenv/config';
import { Agent, setGlobalDispatcher } from 'undici';
import { NestFactory } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { AppModule } from './app.module';
import { createServerLogger } from './logging/winston.config';

/**
 * 부팅 시 drizzle 마이그레이션을 적용한다 (SR §6, Flyway on-boot 와 동일한 동작).
 * RUN_MIGRATIONS=false 로 끌 수 있다.
 */
async function runMigrations(): Promise<void> {
  if (process.env.RUN_MIGRATIONS === 'false') {
    return;
  }
  const url =
    process.env.DATABASE_URL ??
    'postgres://chat:chat1234@localhost:5432/chat_server';
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  } finally {
    await client.end();
  }
}

/**
 * 푸시 서버(fake-push)로 나가는 전역 fetch 커넥션 풀을 확대한다.
 * 전역 fetch 는 undici 기본 디스패처를 쓰는데, origin 당 커넥션이 사실상 무제한이긴 하나
 * 버전에 따라 달라질 수 있어 명시적으로 상한을 지정한다. 각 푸시가 0.5초 걸리므로 목표
 * push/s 를 내려면 (목표 push/s × 0.5s)만큼 동시 커넥션이 필요하다(기본 12000).
 * pipelining=1: 커넥션당 1요청(fake-push 는 파이프라이닝 미지원 가정, 안전한 기본값).
 */
function configurePushDispatcher(): void {
  const connections = Number(process.env.PUSH_MAX_CONNECTIONS ?? 12000);
  setGlobalDispatcher(new Agent({ connections, pipelining: 1 }));
}

async function bootstrap(): Promise<void> {
  configurePushDispatcher();
  await runMigrations();

  const logger = WinstonModule.createLogger({ instance: createServerLogger() });
  const app = await NestFactory.create(AppModule, { logger });

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port);
  logger.log(`nestjs_drizzle chat push server listening on ${port}`, 'Bootstrap');
}

void bootstrap();
