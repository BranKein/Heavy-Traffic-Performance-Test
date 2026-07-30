// Package chat 은 채팅 브로드캐스팅 비즈니스 로직과 HTTP 핸들러를 담는다 (SR §3).
package chat

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/yeonhyukkim/go_gin_pgx/internal/apierror"
	"github.com/yeonhyukkim/go_gin_pgx/internal/logging"
	"github.com/yeonhyukkim/go_gin_pgx/internal/repository"
	"github.com/yeonhyukkim/go_gin_pgx/internal/resultcode"
)

// pusher 는 푸시 브로드캐스터의 인터페이스다(테스트 대체 용이).
type pusher interface {
	Broadcast(ctx context.Context, deviceIDs []string)
}

// Service 는 채팅 전송 비즈니스 로직이다.
type Service struct {
	repo         *repository.Repository
	push         pusher
	serverLogger *slog.Logger
	errorLogger  *logging.ErrorLogger
}

// NewService 는 Service 를 만든다.
func NewService(repo *repository.Repository, push pusher, serverLogger *slog.Logger, errorLogger *logging.ErrorLogger) *Service {
	return &Service{repo: repo, push: push, serverLogger: serverLogger, errorLogger: errorLogger}
}

// SendChat 은 채팅을 저장하고 채팅방의 모든 device 로 푸시를 브로드캐스팅한다 (SR §3).
//
// 최적화 포인트: 검증 + 채팅 저장 + 대상 device 조회까지만 트랜잭션으로 처리하고 곧바로 커밋해
// DB 커넥션을 반납한 뒤, 0.5초씩 걸리는 푸시 전송은 트랜잭션 밖에서 동시에 수행한다.
// (Spring MVC 의 Awful 버전은 푸시 내내 트랜잭션/커넥션을 붙잡고 있어 커넥션이 고갈된다.)
func (s *Service) SendChat(ctx context.Context, userPk, chatRoomPk uuid.UUID, chatData string) (uuid.UUID, error) {
	chatPk := uuid.New()
	var deviceIDs []string

	err := s.repo.WithTx(ctx, func(tx repository.DBTX) error {
		// 1. 채팅방 존재 + 사용자 참여 확인 (SR §3-1)
		exists, err := s.repo.ChatRoomExists(ctx, tx, chatRoomPk.String())
		if err != nil {
			return err
		}
		if !exists {
			return apierror.New(resultcode.ChatRoomNotFound)
		}

		inRoom, err := s.repo.UserInRoom(ctx, tx, userPk.String(), chatRoomPk.String())
		if err != nil {
			return err
		}
		if !inRoom {
			return apierror.New(resultcode.UserNotInChatRoom)
		}

		// 2. 채팅 레코드 추가 (SR §3-2)
		if err := s.repo.InsertChat(ctx, tx, chatPk.String(), chatRoomPk.String(), userPk.String(), chatData, time.Now()); err != nil {
			return err
		}

		// 3. 채팅방의 모든 사용자 device 조회 (SR §3-3)
		deviceIDs, err = s.repo.DeviceIDsInRoom(ctx, tx, chatRoomPk.String())
		return err
	})
	if err != nil {
		return uuid.Nil, err
	}

	// 4. 트랜잭션 밖에서 device 로 동시에 푸시 전송 + 시간 측정 (SR §3-4)
	start := time.Now()
	s.push.Broadcast(ctx, deviceIDs)
	s.serverLogger.Info("push broadcast done",
		"chatRoom", chatRoomPk.String(),
		"devices", len(deviceIDs),
		"elapsedMs", time.Since(start).Milliseconds(),
	)

	return chatPk, nil
}
