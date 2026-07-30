import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit 설정 (SR §6).
 * - schema: src/db/schema.ts 의 테이블 정의를 기준으로 마이그레이션 생성
 * - out: 생성된 SQL 마이그레이션 및 메타데이터 위치 (drizzle/)
 * - dialect: PostgreSQL 고정
 *
 * 사용:
 *   npm run db:generate   # schema 변경 -> drizzle/ 에 마이그레이션 SQL 생성
 *   npm run db:migrate    # drizzle/ 마이그레이션을 DB 에 적용 (Flyway 와 동일한 역할)
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://chat:chat1234@localhost:5432/chat_server',
  },
});
