-- sqlc 가 타입 추론에 사용하는 스키마 (SR §6.1 DDL 과 동일). 실제 마이그레이션은 db/migration 참고.
CREATE TABLE "chat_room" (
    "pk"          uuid NOT NULL PRIMARY KEY,
    "create_date" timestamp NULL
);

CREATE TABLE "chat" (
    "pk"           uuid NOT NULL PRIMARY KEY,
    "chat_room_fk" uuid NOT NULL,
    "user_fk"      uuid NOT NULL,
    "chat_data"    text NULL,
    "create_date"  timestamp NULL
);

CREATE TABLE "api_log" (
    "pk"           uuid NOT NULL PRIMARY KEY,
    "http_method"  varchar(6) NULL,
    "uri"          varchar(64) NULL,
    "request_time" timestamp NULL,
    "ip"           varchar(64) NULL,
    "request_body" text NULL
);

CREATE TABLE "users" (
    "pk"   uuid NOT NULL PRIMARY KEY,
    "name" varchar(64) NULL
);

CREATE TABLE "user_chat_room" (
    "user_fk"      uuid NOT NULL,
    "chat_room_fk" uuid NOT NULL,
    PRIMARY KEY ("user_fk", "chat_room_fk")
);

CREATE TABLE "device" (
    "pk"        uuid NOT NULL PRIMARY KEY,
    "user_fk"   uuid NOT NULL,
    "device_id" uuid NULL
);
