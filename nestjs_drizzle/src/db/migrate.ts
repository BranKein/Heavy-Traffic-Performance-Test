import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * drizzle/ 에 생성된 마이그레이션을 DB 에 적용한다 (SR §6, Flyway 와 동일한 역할).
 * `npm run db:migrate` 로 실행.
 */
async function main(): Promise<void> {
  const url =
    process.env.DATABASE_URL ??
    'postgres://chat:chat1234@localhost:5432/chat_server';

  // 마이그레이션은 단일 커넥션으로 수행한다.
  const client = postgres(url, { max: 1 });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: './drizzle' });
    // eslint-disable-next-line no-console
    console.log('migration completed');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('migration failed', err);
  process.exit(1);
});
