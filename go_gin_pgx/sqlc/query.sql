-- sqlc 쿼리 정의 (선택). repository/repository.go 의 손으로 짠 SQL 과 동일한 내용이다.

-- name: ChatRoomExists :one
SELECT EXISTS(SELECT 1 FROM chat_room WHERE pk = $1);

-- name: UserInRoom :one
SELECT EXISTS(SELECT 1 FROM user_chat_room WHERE user_fk = $1 AND chat_room_fk = $2);

-- name: InsertChat :exec
INSERT INTO chat (pk, chat_room_fk, user_fk, chat_data, create_date)
VALUES ($1, $2, $3, $4, $5);

-- name: DeviceIDsInRoom :many
SELECT d.device_id
FROM user_chat_room ucr
JOIN device d ON d.user_fk = ucr.user_fk
WHERE ucr.chat_room_fk = $1 AND d.device_id IS NOT NULL;

-- name: InsertAPILog :exec
INSERT INTO api_log (pk, http_method, uri, request_time, ip, request_body)
VALUES ($1, $2, $3, $4, $5, $6);
