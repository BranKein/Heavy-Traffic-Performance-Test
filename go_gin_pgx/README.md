# go_gin_pgx — 채팅 푸시 브로드캐스팅 서버 (Go 구현)

Spring 두 구현(`spring_mvc_jpa`, `spring_webflux_jooq`)과 동일한 요구사항([SYSTEM_REQUIREMENTS.ko.md](../SYSTEM_REQUIREMENTS.ko.md))을
**Go 로 구현한 최적화 단일 버전**이다. heavy traffic 처리 성능을 목표로 한다.

## 스택

| 레이어 | 선택 | 비고 |
|--------|------|------|
| HTTP | **Gin** | 검증된 고성능 라우터 |
| DB 드라이버 | **pgx / pgxpool** | PostgreSQL 네이티브 프로토콜 + 커넥션 풀 |
| 쿼리 | **손으로 짠 pgx** (`internal/repository`) | 성능은 sqlc 와 동일. sqlc 전환 경로는 아래 참고 |
| JWT | **golang-jwt/jwt/v5** | RS256 + RSA-2048 |
| 동시성 | **errgroup + 튜닝된 http.Client** | 푸시 fan-out |

## 성능 관점 설계 포인트

1. **푸시를 트랜잭션 밖에서 fan-out** — 검증·채팅 저장·device 조회까지만 트랜잭션으로 처리하고
   **커밋 후 DB 커넥션을 반납**한 뒤, 0.5초씩 걸리는 푸시를 goroutine 으로 동시에 보낸다.
   (Spring MVC 의 Awful 버전은 푸시 내내 트랜잭션/커넥션을 붙잡아 커넥션이 고갈된다.)
   → `internal/chat/service.go`
2. **API 로그를 비동기 처리** — 요청 스레드는 채널에 넣기만 하고 백그라운드 워커가 파일/DB 에 쓴다.
   버퍼가 차면 로그를 버려서라도 요청 지연을 막는다. → `internal/logging/api_logger.go`
3. **http.Client keep-alive 튜닝** — 푸시 커넥션을 재사용하도록 idle 커넥션 풀을 넉넉히 잡는다.
   → `internal/push/client.go`
4. **동시 푸시 상한**(`PUSH_MAX_CONCURRENCY`) — 큰 채팅방 하나가 자원을 독점하지 않게 세마포어로 제한.
5. **DB 커넥션 풀 상한**(`DB_MAX_CONNS`) — 1 vCPU 환경에서 PostgreSQL 을 보호.

## 디렉터리

```
cmd/server/main.go        # 부팅, graceful shutdown
internal/
  config/                 # 환경변수 주입
  server/                 # gin 라우터 + 미들웨어 등록
  chat/                   # 핸들러 + 비즈니스 로직(트랜잭션 + 푸시 fan-out)
  auth/                   # RS256 JWT 검증 + 미들웨어
  push/                   # Fake Push Server 클라이언트 (errgroup fan-out)
  repository/             # pgx 직접 쿼리
  logging/                # server.log/error.log + 비동기 API 로거 + 요청 로깅 미들웨어
  response/, resultcode/, apierror/   # 표준 응답 DTO / 코드 / 에러
db/migration/             # DDL (Spring 과 동일 스키마)
sqlc/                     # (선택) sqlc 설정 — 아래 참고
```

## 실행 방법

### 1) 사전 준비 — DB + Fake Push Server

리포지토리 루트의 `local_dev/docker-compose.yml` 로 PostgreSQL(5432)과 Fake Push Server(9000)를 띄운다.

```bash
cd ../local_dev && docker compose up -d
```

> 스키마: Spring 쪽 Flyway 가 이미 테이블을 만들어 두면 그대로 사용한다.
> Go 서버는 별도 마이그레이션을 돌리지 않는다(Flyway 이력 테이블 충돌 방지). 스키마는 `db/migration/V1__init_schema.sql` 참고.

### 2) 의존성 정리 & 실행

Go(1.23+) 설치 후:

```bash
go mod tidy      # go.sum 생성 + 간접 의존성 정리 (최초 1회, 네트워크 필요)
go run ./cmd/server
```

설정은 환경변수로 주입한다(`.env.example` 참고). 아무것도 지정하지 않으면 로컬 기본값으로 뜬다.

### 3) 요청 예시

```bash
curl -s http://localhost:8080/api/chat \
  -H "Authorization: Bearer <RS256 JWT>" \
  -H "Content-Type: application/json" \
  -d '{"chatRoomPk":"<uuid>","chatData":"hello"}'
# => {"resultCode":100,"resultData":{"chatPk":"<uuid>"}}
```

JWT 는 `local_dev/jwt/` 의 개인키로 발급한다(payload: `iss=PUSH_BROADCASTING`, `userPk=<uuid>`).

### Docker

```bash
docker build -t go-chat-push .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL=postgres://chat:chat1234@host.docker.internal:5432/chat_server \
  -e PUSH_SERVER_URL=http://host.docker.internal:9000 \
  go-chat-push
```

## sqlc 로 전환하기 (선택)

손으로 짠 `internal/repository` 대신 타입 안전 생성 코드를 쓰고 싶다면:

```bash
# sqlc 설치: https://docs.sqlc.dev
cd sqlc && sqlc generate      # ../internal/db 에 타입 안전 코드 생성
```

이후 `repository` 계층을 `db.New(pool)` 기반으로 교체한다. 런타임 성능은 동일하며(둘 다 pgx 호출),
차이는 "SQL 을 컴파일 타임에 검증받느냐"뿐이다.

## 참고

- 응답은 항상 HTTP 200, 에러는 `resultCode` 로 전달한다 (SR §5). 코드는 `internal/resultcode`.
- 인증 실패도 표준 응답 + 전용 `resultCode` 로 반환한다 (SR §4).
- 로그: `server.log`(서버+API), `error.log`(에러 Call Stack). GET 요청과 Authorization 헤더는 로깅에서 제외 (SR §8).
- **Go 미설치 환경에서 작성되어 컴파일 검증은 하지 못했다.** `go vet ./... && go build ./...` 로 먼저 확인 권장.
