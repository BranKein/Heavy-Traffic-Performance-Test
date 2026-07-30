-- 채팅 서버 스키마 DDL (Flyway 폐기 → 시드가 스키마 소유).
-- generate.mjs 가 out/seed.sql 맨 앞에 이 내용을 끼워 넣어, seed-job / run-local 이
-- 스키마 생성 + 데이터 적재를 한 트랜잭션으로 함께 실행한다.
-- Spring 앱은 flyway.enabled=false + ddl-auto=validate 이므로, 앱 기동 전에
-- 이 스키마가 존재해야 한다(부트스트랩/로컬 순서가 시드 → 앱 으로 맞춰져 있음).
--
-- 재실행 안전: 시드는 어차피 전체 데이터를 재적재하므로 DROP ... CASCADE 후 재생성한다.
-- 컬럼/타입은 각 서버의 JPA 엔티티(ddl-auto=validate)와 정확히 일치해야 한다.
-- (원본: spring_*/src/main/resources/db/migration/V1__init_schema.sql — mvc/webflux 동일)

DROP TABLE IF EXISTS "chat", "user_chat_room", "device", "api_log", "chat_room", "users" CASCADE;

CREATE TABLE "chat_room"
(
    "pk"          uuid NOT NULL,
    "create_date" timestamp NULL
);

CREATE TABLE "chat"
(
    "pk"           uuid NOT NULL,
    "chat_room_fk" uuid NOT NULL,
    "user_fk"      uuid NOT NULL,
    "chat_data"    text NULL,
    "create_date"  timestamp NULL
);

CREATE TABLE "api_log"
(
    "pk"           uuid NOT NULL,
    "http_method"  varchar(6) NULL,
    "uri"          varchar(64) NULL,
    "request_time" timestamp NULL,
    "ip"           varchar(64) NULL,
    "request_body" text NULL
);

CREATE TABLE "users"
(
    "pk"   uuid NOT NULL,
    "name" varchar(64) NULL
);

CREATE TABLE "user_chat_room"
(
    "user_fk"      uuid NOT NULL,
    "chat_room_fk" uuid NOT NULL
);

CREATE TABLE "device"
(
    "pk"        uuid NOT NULL,
    "user_fk"   uuid NOT NULL,
    "device_id" uuid NULL
);

ALTER TABLE "chat_room"
    ADD CONSTRAINT "PK_CHAT_ROOM" PRIMARY KEY ("pk");

ALTER TABLE "chat"
    ADD CONSTRAINT "PK_CHAT" PRIMARY KEY ("pk");

ALTER TABLE "api_log"
    ADD CONSTRAINT "PK_API_LOG" PRIMARY KEY ("pk");

ALTER TABLE "users"
    ADD CONSTRAINT "PK_USERS" PRIMARY KEY ("pk");

ALTER TABLE "user_chat_room"
    ADD CONSTRAINT "PK_USER_CHAT_ROOM" PRIMARY KEY ("user_fk", "chat_room_fk");

ALTER TABLE "device"
    ADD CONSTRAINT "PK_DEVICE" PRIMARY KEY ("pk");

ALTER TABLE "user_chat_room"
    ADD CONSTRAINT "FK_users_TO_user_chat_room_1" FOREIGN KEY ("user_fk") REFERENCES "users" ("pk");

ALTER TABLE "user_chat_room"
    ADD CONSTRAINT "FK_chat_room_TO_user_chat_room_1" FOREIGN KEY ("chat_room_fk") REFERENCES "chat_room" ("pk");
