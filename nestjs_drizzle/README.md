# nestjs_drizzle — 채팅 푸시 알림 서버

`SYSTEM_REQUIREMENTS.md` 를 **NestJS + Drizzle + Winston** 으로 구현한 채팅 푸시 브로드캐스팅 서버.
`spring_mvc_jpa` / `spring_webflux_jooq` 구현체와 동일한 스펙(동일 DB 스키마, 동일 응답 규격, 동일 에러코드)을 따른다.

## 기술 스택

| 영역 | 선택 |
|------|------|
| 프레임워크 | NestJS (Express) |
| DB 접근 | Drizzle ORM + postgres-js (PostgreSQL) |
| 마이그레이션 | drizzle-kit (Flyway 와 동일한 on-boot 마이그레이션) |
| 로깅 | Winston (`server.log` / `error.log` 분리) |
| JWT | Node 내장 `crypto` 로 RS256 직접 검증 (외부 라이브러리 없음) |

## 요구사항 대응 (SR 매핑)

- **§3 비즈니스 로직**: `chat/chat.service.ts` — 검증→저장→조회는 트랜잭션(SR §6), 푸시는 트랜잭션 밖에서 병렬 브로드캐스팅 + 시간 측정.
- **§4 JWT**: `security/` — RS256, RSA-2048, public key 는 `JWT_PUBLIC_KEY` env 주입, `iss=PUSH_BROADCASTING`, `userPk`. 실패 원인별 resultCode(4001~4006).
- **§5 응답 규격**: 모든 응답 HTTP 200 + `{resultCode, resultData}`. `common/response.interceptor.ts`(성공 래핑) + `common/global-exception.filter.ts`(오류 200 변환). 성공=100.
- **§6 DB**: `db/schema.ts` 가 SR §6.1 DDL 과 1:1. 항상 트랜잭션 사용, index hint 없음.
- **§8 로깅**: `logging/` — 요청만(GET 제외, Authorization 미기록), `server.log`(파일) + `api_log`(DB) 병행 기록, 실패해도 요청 진행. 서버/푸시 에러 Call Stack 은 `error.log`.
- **§7 Push**: `push/push.client.ts` — Fake Push Server 로 POST, 5% 실패는 삼키고 `error.log` 기록.
- **§9 부팅**: 로컬 실측 ~0.8초 (목표 5초 이하).

## 실행

```bash
npm install
cp .env.example .env          # 필요 시 값 수정

# 1) 마이그레이션 생성(스키마 변경 시에만)
npm run db:generate

# 2) 마이그레이션 적용 (Flyway migrate 와 동일 역할)
npm run db:migrate            # 또는 서버 부팅 시 자동 적용(RUN_MIGRATIONS!=false)

# 3) 서버 실행
npm run build && npm run start:prod
# 개발 모드
npm run start:dev
```

전제: `local_dev/docker-compose.yml` 의 PostgreSQL(`chat_server`) 과 Fake Push Server 가 떠 있어야 한다.

## 환경변수 (`.env.example` 참고)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | 8080 | 서버 포트 |
| `DATABASE_URL` | `postgres://chat:chat1234@localhost:5432/chat_server` | PostgreSQL 접속 |
| `PUSH_SERVER_URL` | `http://localhost:9000` | Fake Push Server |
| `LOG_DIR` | `logs` | 로그 파일 디렉토리 |
| `JWT_PUBLIC_KEY` | (예시 키) | RSA-2048 Public Key (Base64 SPKI). 외부 주입 가능(SR §4) |
| `RUN_MIGRATIONS` | (미설정=적용) | `false` 로 부팅 시 자동 마이그레이션 비활성화 |

## API

`POST /api/chat` — `Authorization: Bearer <JWT>` 필요.

```jsonc
// Request
{ "chatRoomPk": "<uuid>", "chatData": "메시지" }
// Response (항상 HTTP 200)
{ "resultCode": 100, "resultData": { "chatPk": "<uuid>" } }
```

에러코드는 `common/result-code.enum.ts` 에서 일괄 관리한다.
