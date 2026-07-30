// Package repository 는 pgx 로 PostgreSQL 에 직접 접근한다.
//
// sqlc 대신 손으로 SQL 을 작성했다. 런타임 성능은 sqlc 생성 코드와 동일하며(둘 다 pgx 호출),
// 코드가 모두 눈에 보여 학습에 유리하고 코드 생성 단계 없이 바로 빌드된다.
// sqlc 로 전환하고 싶다면 sqlc/ 폴더의 설정을 참고한다.
//
// UUID 는 문자열로 넘기고 SQL 안에서 ::uuid 로 캐스팅한다. 이렇게 하면 pgx 의
// uuid 코덱 등록 없이도 안전하게 동작한다. device_id 도 ::text 로 뽑아 그대로 푸시에 쓴다.
package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DBTX 는 pgxpool.Pool 과 pgx.Tx 가 모두 만족하는 인터페이스다.
// 덕분에 같은 쿼리 함수를 커넥션 풀에서도, 트랜잭션 안에서도 재사용할 수 있다.
type DBTX interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Repository 는 커넥션 풀을 감싼다.
type Repository struct {
	pool *pgxpool.Pool
}

// NewPool 은 pgxpool 커넥션 풀을 만든다. maxConns 로 동시 커넥션 수를 제한한다
// (1 vCPU 환경에서 PostgreSQL 을 보호하고 컨텍스트 스위칭을 줄이기 위함).
func NewPool(ctx context.Context, url string, maxConns int) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	if maxConns > 0 {
		cfg.MaxConns = int32(maxConns)
	}
	return pgxpool.NewWithConfig(ctx, cfg)
}

// New 는 Repository 를 만든다.
func New(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// WithTx 는 fn 을 하나의 트랜잭션으로 실행한다 (SR §6: 항상 트랜잭션 사용).
// fn 이 에러를 반환하면 롤백하고, 성공하면 커밋한다.
func (r *Repository) WithTx(ctx context.Context, fn func(tx DBTX) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	// fn 성공 시엔 이미 Commit 되어 Rollback 은 no-op 이 된다.
	defer tx.Rollback(ctx)

	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

const chatRoomExistsSQL = `SELECT EXISTS(SELECT 1 FROM chat_room WHERE pk = $1::uuid)`

// ChatRoomExists 는 채팅방 존재 여부를 확인한다 (SR §3-1).
func (r *Repository) ChatRoomExists(ctx context.Context, db DBTX, chatRoomPk string) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx, chatRoomExistsSQL, chatRoomPk).Scan(&exists)
	return exists, err
}

const userInRoomSQL = `SELECT EXISTS(SELECT 1 FROM user_chat_room WHERE user_fk = $1::uuid AND chat_room_fk = $2::uuid)`

// UserInRoom 은 사용자가 해당 채팅방에 속해 있는지 확인한다 (SR §3-1).
func (r *Repository) UserInRoom(ctx context.Context, db DBTX, userPk, chatRoomPk string) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx, userInRoomSQL, userPk, chatRoomPk).Scan(&exists)
	return exists, err
}

const insertChatSQL = `INSERT INTO chat (pk, chat_room_fk, user_fk, chat_data, create_date)
VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)`

// InsertChat 은 채팅 레코드를 추가한다 (SR §3-2).
func (r *Repository) InsertChat(ctx context.Context, db DBTX, chatPk, chatRoomPk, userPk, chatData string, createDate time.Time) error {
	_, err := db.Exec(ctx, insertChatSQL, chatPk, chatRoomPk, userPk, chatData, createDate)
	return err
}

// 채팅방에 속한 모든 사용자의 device_id 를 한 번의 조인으로 조회한다 (SR §3-3, §3-4).
// 사용자 조회 → device 조회를 별도 쿼리 2번 대신 조인 1번으로 처리한다.
const deviceIDsInRoomSQL = `SELECT d.device_id::text
FROM user_chat_room ucr
JOIN device d ON d.user_fk = ucr.user_fk
WHERE ucr.chat_room_fk = $1::uuid AND d.device_id IS NOT NULL`

// DeviceIDsInRoom 은 채팅방 내 모든 사용자의 device_id 목록을 반환한다.
func (r *Repository) DeviceIDsInRoom(ctx context.Context, db DBTX, chatRoomPk string) ([]string, error) {
	rows, err := db.Query(ctx, deviceIDsInRoomSQL, chatRoomPk)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

const insertAPILogSQL = `INSERT INTO api_log (pk, http_method, uri, request_time, ip, request_body)
VALUES ($1::uuid, $2, $3, $4, $5, $6)`

// InsertAPILog 는 API 요청 로그를 api_log 에 남긴다 (SR §8).
// 단일 statement 는 PostgreSQL 에서 암묵적 트랜잭션으로 처리된다.
func (r *Repository) InsertAPILog(ctx context.Context, pk, httpMethod, uri string, requestTime time.Time, ip, requestBody string) error {
	_, err := r.pool.Exec(ctx, insertAPILogSQL, pk, httpMethod, uri, requestTime, ip, requestBody)
	return err
}
