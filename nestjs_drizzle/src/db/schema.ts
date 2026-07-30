import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  primaryKey,
} from 'drizzle-orm/pg-core';

/**
 * SR §6.1 PostgreSQL DDL 과 1:1로 대응하는 Drizzle 스키마 정의.
 * 테이블 구조는 고정이며(SR §6), 컬럼/제약을 DDL 그대로 옮긴다.
 */

export const chatRoom = pgTable('chat_room', {
  pk: uuid('pk').primaryKey(),
  createDate: timestamp('create_date'),
});

export const chat = pgTable('chat', {
  pk: uuid('pk').primaryKey(),
  chatRoomFk: uuid('chat_room_fk').notNull(),
  userFk: uuid('user_fk').notNull(),
  chatData: text('chat_data'),
  createDate: timestamp('create_date'),
});

export const apiLog = pgTable('api_log', {
  pk: uuid('pk').primaryKey(),
  httpMethod: varchar('http_method', { length: 6 }),
  uri: varchar('uri', { length: 64 }),
  requestTime: timestamp('request_time'),
  ip: varchar('ip', { length: 64 }),
  requestBody: text('request_body'),
});

export const users = pgTable('users', {
  pk: uuid('pk').primaryKey(),
  name: varchar('name', { length: 64 }),
});

export const userChatRoom = pgTable(
  'user_chat_room',
  {
    userFk: uuid('user_fk')
      .notNull()
      .references(() => users.pk),
    chatRoomFk: uuid('chat_room_fk')
      .notNull()
      .references(() => chatRoom.pk),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userFk, table.chatRoomFk] }),
  }),
);

export const device = pgTable('device', {
  pk: uuid('pk').primaryKey(),
  userFk: uuid('user_fk').notNull(),
  deviceId: uuid('device_id'),
});
