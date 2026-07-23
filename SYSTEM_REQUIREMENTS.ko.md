# 시스템 요구사항 — 채팅 푸시 알림 서버 (성능개선 프로젝트)

## 1. 개요 및 목적

이 프로젝트는 인프라(스케일업 / 스케일아웃)가 아니라 **한 서버 내에서의 성능 개선**을 목표로 한다.

- **스케일아웃은 전혀 고려하지 않는다.** 운영되는 서버는 단 하나로 가정한다.
- 서버 **내부**에서는 어떤 기술을 사용하든 상관없지만, **외부는 건드릴 수 없다** (예: Redis 등 추가 불가).
  - Redis가 도입되면 더 좋겠다고 판단되는 부분이 있다면 **구현하지 말고**, 어느 부분인지 그리고 왜 성능이 개선될 것 같은지 문서로 남긴다.
- **데이터베이스 테이블은 고정**이다. 쿼리는 자유롭게 작성해도 되지만 **index hint는 제외**한다.
- **적은 메모리 사용량이 요구된다.** 하나의 서버에서 여러 백엔드 서버를 도커로 띄워 사용하다 보면 서버 리소스가 다 차서 서버 자체가 죽는 경우가 생기기 때문이다.
  - **목표: 메모리 사용량 100MB 이하.** 정 모르겠으면 물어볼 것.

## 2. 제작할 서버

### 2.1 채팅 푸시 알림 서버 (테스트 대상 서버)

채팅 푸시 알림 브로드캐스팅 서버.

- **WebSocket 연결은 없고**, 오로지 HTTP REST 요청만 있다.
- 사용자가 채팅을 치면 채팅을 저장하고, 해당 채팅방에 있는 **모든 사용자에게 푸시 알림**을 보낸다.
- 푸시 알림을 실질적으로 보내는 서버는 따로 있다고 가정한다 (**Fake Push Server**). 결국 이 서버는 **브로드캐스팅**을 해주는 서버다.
- 클라이언트에게는 저장한 **채팅 레코드의 PK 값**을 반환한다.

비교를 위해 두 가지 구현을 만든다:

1. **Awful Chatting Push Server** — 순진한(naive) 기준 버전.
   - **Spring MVC + JPA** 기반 **동기** 서버.
2. **Better Chatting Push Server** — 가능한 기술을 모두 사용한 최적화 버전.
   - **Spring WebFlux + jOOQ** 기반 **비동기** 서버.

> **구현 현황:** 현재 **Fake Push Server**만 구현 완료 상태다 (§7 참고). 위 두 채팅 푸시 서버는 이 프로젝트에서 새로 제작한다.

### 2.2 Fake Push Server (구현 완료)

다운스트림 푸시 전송 서버. 자세한 내용은 §7 참고. 이미 코딩되어 Docker 이미지로 배포되어 있다.

## 3. 비즈니스 로직

들어오는 각 채팅 요청에 대해:

1. payload로 넘어온 채팅방 PK가 정말 존재하는 채팅방인지, **그리고** 해당 사용자가 그 채팅방에 **들어가 있는지** 확인한다.
2. 해당 채팅방에 **채팅 레코드를 추가**한다.
3. 해당 채팅방에 있는 **사용자 모두를 조회**한다.
4. 조회된 사용자들의 **device에 모두 push 요청**을 보낸다.
   - push 요청을 보내기 시작하는 시점부터 모든 사용자의 device에게 요청을 다 보낼 때까지의 **시간을 측정**한다.

## 4. 사용자 인증

- 사용자는 채팅을 보낼 때 **JWT 토큰**으로 서버에 인증한다.
- JWT 토큰의 payload에는 다음 정보가 담긴다:
  - `iss`: `PUSH_BROADCASTING` (동일 문자열인지 확인 필요)
  - `userPk`: 사용자의 PK
- **JWT 검증용 키는 RSA 키쌍으로 한다 (키 길이 1024).**
  - 개발 시에는 임의로 생성한 키쌍으로 테스트해도 되지만, **테스트 시에는 외부에서 키쌍 주입이 가능해야 한다.**
  - 따라서 **RSA Public Key는 properties 파일로 주입**받도록 한다.
- **JWT 알고리즘: RS256.**
- JWT 인증 로직 자체가 목적인 프로젝트가 아니므로, JWT 토큰 발급 및 생성을 위한 라이브러리는 **김연혁에게 제공받아도 무관**하다.
  - 이미 제작된 라이브러리가 있으며, 필요 시 Gradle import가 가능하게끔 하고 class diagram과 예시 코드를 제공할 예정이다.
- **사용자 인증 실패 시**(JWT 검증 실패 시)에도 표준 응답 DTO 형식(§5)을 지키면서 **별도로 정의한 `resultCode`**를 반환해야 한다.
  - 예외 상황별로 대략 **5~6개** 정도의 에러코드가 정의되어야 한다 (토큰 만료, issuer 다름 등).

## 5. 응답 DTO 및 에러코드

- **모든 요청에 대한 응답 HTTP status code는 `200`으로 한다.** 에러 여부는 response body의 `resultCode` 필드로 반환한다.
- `resultData` 필드는 **제네릭 타입**으로 정의하여 모든 API가 동일한 형태의 response를 가지게 한다.
- **성공 시 `resultCode` = `100`.** 나머지 예외 상황은 알아서 `resultCode`를 할당하여 클라이언트에게 반환한다.

### 5.1 응답 JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "resultCode": { "type": "integer" },
    "resultData": { "type": "object" }
  },
  "required": ["resultCode", "resultData"]
}
```

### 5.2 예시 응답

```json
{
  "resultCode": 200,
  "resultData": {
    "userId": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "isActive": true
  }
}
```

### 5.3 응답 DTO (예시)

```java
public class GlobalResponse<T> {
    private ResultCodeEnum resultCode;
    private T resultData;
}
```

### 5.4 에러코드 규칙

- `resultCode`에 해당하는 에러코드의 숫자 할당 규칙은 **알아서 정한다** (안 정해도 된다).
- 대신 그 에러코드는 모두 **하나의 Enum Type으로 한번에 관리**되어야 한다 (`ResultCodeEnum`이라는 이름의 Enum을 만드는 것을 추천).

## 6. 데이터베이스

- **PostgreSQL로 고정** (MySQL, MariaDB와 문법 차이 거의 없음).
- DB 커넥션 구현은 무엇을 사용하든 상관없지만, **QueryDSL은 JDBC와의 호환이 잘 되어 있다** (r2dbc connector의 구현체는 아니라는 의미).
  - JPA 유무, JDBC, R2DBC, jOOQ, QueryDSL, MyBatis 등 취사선택할 수 있는 것들이 많으니 각각 찾아보고 적절한 것을 고른다 (저 중에 하나를 반드시 골라야 한다는 의미는 아님).
- **테이블 하나에 레코드를 저장하는 로직이더라도 Transaction은 반드시 생성한다.**
- **ERD:** https://www.erdcloud.com/d/JEtX9vNNsDzuLF37t

### 6.1 PostgreSQL DDL

```sql
CREATE DATABASE "chat_server"


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
```

## 7. Fake Push Server

다운스트림 푸시 전송 서버로, **이미 구현되어 Docker 이미지로 배포되어 있다.**

- 푸시 알림을 보내는 데에는 **0.5초가 반드시 소요**된다 (response가 0.5초 후에 온다는 의미).
- **에러 발생 가능성(5%)이 있다.** 실패하더라도 상관없이 채팅 푸시 서버는 로직을 계속 수행한다.

### 7.1 Docker

- **Docker Hub:** https://hub.docker.com/r/yeonhyukkim/fake-push-server

```shell
docker pull yeonhyukkim/fake-push-server:latest
```

- **내부 서버 포트: 8090.** 다른 Docker network 상에서 서버에 요청을 보내는 경우 컨테이너 내부의 `8090` 포트에 대한 포트포워딩이 필요하다.
- 해당 이미지는 **멀티플랫폼 이미지**로 빌드 및 배포된다 (GitHub Actions의 `matrix` 빌드 + `docker manifest` 사용). 따라서 사용하는 쪽은 동일한 이미지 이름/태그로 pull 하면 자신의 아키텍처에 맞는 이미지가 자동으로 가져와진다 (macOS Intel 칩, Apple Silicon 모두 호환. Windows는 미검증).

### 7.2 API 명세

**Request**

- **URI:** `/api/push`
- **Method:** `POST`
- **Header:** 필요 없음
- **Body (`application/json`):**

| Field      | Type         | Required | Description             |
|------------|--------------|----------|-------------------------|
| `deviceId` | String(UUID) | Y        | UUID 형식의 Device ID    |

**Response (`application/json`)**

| Field        | Type       | Required | Description        |
|--------------|------------|----------|--------------------|
| `resultCode` | Int        | Y        | 응답 결과 코드      |
| `resultData` | ResultData | Y        | 응답 결과 데이터    |

**ResultData**

| Field      | Type         | Required | Description                          |
|------------|--------------|----------|--------------------------------------|
| `message`  | BooleanEnum  | Y        | 성공 시 `"Success"`, 실패 시 `"Failed"` |
| `deviceId` | String(UUID) | Y        | UUID 형식의 Device ID                 |

**예시 — Request**

```json
{
  "deviceId": "756bf62c-12ac-4285-8f53-33c35815552a"
}
```

**예시 — Response**

```json
{
  "resultCode": 100,
  "resultData": {
    "message": "Success",
    "deviceId": "756bf62c-12ac-4285-8f53-33c35815552a"
  }
}
```

**Result Code**

- `100`: Success
- `-1`: Failed

## 8. 로깅

들어오는 모든 요청에 대해 로그를 남겨야 한다.

- response 없이 **request 요청에 대한 로그만** 남긴다.
  - request header의 `Authorization` 헤더는 **제외**한다.
  - **HTTP method, URI, 요청 온 시간, 요청 IP, request body**를 로깅한다 (`GET` 요청은 무시).
- 로그는 **DB와 파일 양쪽에** 남겨야 한다.
- DB 그리고 파일로의 로그 저장에 **실패하더라도 사용자의 요청은 정상적으로 진행**된다.
- 푸시 알림 서버로의 요청 중 에러가 발생하는 경우, 그리고 서버 자체에서 에러가 발생하는 경우 **별도의 파일에 에러 Call Stack을 출력**한다.
  - 서버 자체에서 에러가 발생하는 경우: 예를 들어 존재하지 않는 채팅방 PK를 담아 요청하는 경우 에러가 발생하며, 에러 로깅용 파일에 에러가 발생한 위치를 단순히 **Call Stack**으로 출력한다.
    - 에러 발생 시 Class 이름, Method 이름을 직접 가져와서 출력하라는 의미가 아니다.
- **결국 만들어지는 로그 파일은 두 개다:**
  - `server.log` — Spring Boot 서버 자체의 로그와 API 로그가 남는다.
  - `error.log` — 서버 내에서 에러가 발생한 경우.
- **예상할 수 있는 에러 발생 지점은 코딩 전에 미리 다 생각해둔다.**

## 9. 서버 부팅 및 업데이트

- 스케일아웃을 고려하지 않으므로 운영되는 서버는 **단 하나**로 가정한다.
- 기능 추가 등을 이유로 Docker 이미지가 업데이트되어야 하는 상황이 있을 수 있으며, 이는 **서버의 부팅 시간의 영향**을 받는다.
- **2분의 테스트 시간** 동안 **1분이 지나갈 때쯤 서버를 껐다 켜는 작업**을 진행하여 **요청 에러율**을 볼 예정이다.
- Awful vs Better 비교와는 별개로, **서버 부팅 시간은 5초를 넘기지 않아야 한다.**
  - 부팅 시간을 최대한 줄여본다.

## 10. 성능 테스트

- 테스트는 **리소스를 제한한 Docker 컨테이너**를 대상으로, **k6**로 부하 테스트한다.
  - **예상 테스트용 서버 리소스: vCPU 1, RAM 2GB.**
- **메모리 사용량 목표: 100MB 이하** (§1 참고).
- **부팅 시간 목표: 5초 이하** (§9 참고).

---

## 부록: 요구사항 요약

| 영역              | 요구사항 |
|-------------------|----------|
| 범위              | 단일 인스턴스, 애플리케이션 내부 성능 개선만; 스케일아웃 없음 |
| 외부 의존성       | 새로운 외부 컴포넌트 추가 불가 (Redis 등) |
| DB                | PostgreSQL, 테이블 고정, index hint 불가, 항상 Transaction 사용 |
| 인증              | JWT, RS256, RSA-1024, properties로 public key 주입, `iss=PUSH_BROADCASTING`, `userPk` |
| 응답              | 항상 HTTP 200; 에러는 `resultCode`로; 성공 = `100`; 제네릭 `resultData`; `ResultCodeEnum` |
| 로깅              | request만, DB + 파일, 실패해도 요청 진행; `server.log` + `error.log` |
| 부팅 시간         | 5초 이하 |
| 메모리            | 100MB 이하 목표 |
| 테스트 도구       | **k6** |
| 테스트 리소스     | vCPU 1, RAM 2GB (Docker) |
| 동기 서버         | **Awful Chatting Push Server** — Spring MVC + JPA |
| 비동기 서버       | **Better Chatting Push Server** — Spring WebFlux + jOOQ |
| Fake Push Server  | 구현 완료; `POST /api/push`, 포트 8090, 0.5초 지연, 5% 실패 |