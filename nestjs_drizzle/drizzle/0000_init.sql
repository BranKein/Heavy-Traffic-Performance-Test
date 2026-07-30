CREATE TABLE IF NOT EXISTS "api_log" (
	"pk" uuid PRIMARY KEY NOT NULL,
	"http_method" varchar(6),
	"uri" varchar(64),
	"request_time" timestamp,
	"ip" varchar(64),
	"request_body" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat" (
	"pk" uuid PRIMARY KEY NOT NULL,
	"chat_room_fk" uuid NOT NULL,
	"user_fk" uuid NOT NULL,
	"chat_data" text,
	"create_date" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_room" (
	"pk" uuid PRIMARY KEY NOT NULL,
	"create_date" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device" (
	"pk" uuid PRIMARY KEY NOT NULL,
	"user_fk" uuid NOT NULL,
	"device_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_chat_room" (
	"user_fk" uuid NOT NULL,
	"chat_room_fk" uuid NOT NULL,
	CONSTRAINT "user_chat_room_user_fk_chat_room_fk_pk" PRIMARY KEY("user_fk","chat_room_fk")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"pk" uuid PRIMARY KEY NOT NULL,
	"name" varchar(64)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_chat_room" ADD CONSTRAINT "user_chat_room_user_fk_users_pk_fk" FOREIGN KEY ("user_fk") REFERENCES "public"."users"("pk") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_chat_room" ADD CONSTRAINT "user_chat_room_chat_room_fk_chat_room_pk_fk" FOREIGN KEY ("chat_room_fk") REFERENCES "public"."chat_room"("pk") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
