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