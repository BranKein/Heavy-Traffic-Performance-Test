# 예외 처리 및 에러코드 정리 (spring_mvc_jpa)

SR §5(응답 DTO/에러코드), §4(JWT 인증), §3(비즈니스 로직)에 따라 구현한 예외 처리 방식을 정리한다.

## 1. 공통 응답 규칙

- **모든 응답의 HTTP status 는 항상 `200`** 이다. 오류 여부는 body 의 `resultCode` 로 구분한다.
- 응답은 제네릭 DTO `GlobalResponse<T>` 로 통일한다.

```json
{
  "resultCode": 100,
  "resultData": { "chatPk": "e843839f-..." }
}
```

| 필드 | 설명 |
|------|------|
| `resultCode` | `ResultCodeEnum` 의 정수 code (`@JsonValue` 로 직렬화) |
| `resultData` | 성공 시 데이터, 오류 시 `null` |

- 성공: `GlobalResponse.success(data)` → `resultCode = 100`
- 오류: `GlobalResponse.error(resultCode)` → `resultData = null`

## 2. 에러코드 (`ResultCodeEnum`)

에러코드는 하나의 Enum(`common.ResultCodeEnum`)에서 일괄 관리한다. code 숫자 대역으로 성격을 구분했다.

| 이름 | code | 대역 | 발생 지점 / 의미 |
|------|------|------|------------------|
| `SUCCESS` | `100` | 성공 | 정상 처리 |
| `INVALID_REQUEST` | `4000` | 요청 | request body 파싱 실패 등 잘못된 요청 |
| `TOKEN_MISSING` | `4001` | 인증(40xx) | `Authorization: Bearer` 헤더 없음 |
| `TOKEN_MALFORMED` | `4002` | 인증 | 토큰 형식 오류(세그먼트 수/디코딩/userPk 누락·형식) |
| `TOKEN_INVALID_ALGORITHM` | `4003` | 인증 | 헤더 `alg` 가 `RS256` 이 아님 |
| `TOKEN_INVALID_SIGNATURE` | `4004` | 인증 | RSA 서명 검증 실패 |
| `TOKEN_EXPIRED` | `4005` | 인증 | `exp` 만료 |
| `TOKEN_INVALID_ISSUER` | `4006` | 인증 | `iss` 가 `PUSH_BROADCASTING` 이 아님 |
| `CHATROOM_NOT_FOUND` | `5001` | 비즈니스(50xx) | 존재하지 않는 채팅방 PK |
| `USER_NOT_IN_CHATROOM` | `5002` | 비즈니스 | 해당 사용자가 채팅방에 참여하지 않음 |
| `INTERNAL_ERROR` | `9000` | 서버 | 그 외 처리되지 않은 서버 오류 |

## 3. 처리 경로

예외는 **발생 위치에 따라 두 경로**로 표준 응답으로 변환된다.

### 3.1 인증 오류 — 필터에서 직접 응답

JWT 검증은 MVC(DispatcherServlet) 진입 전 필터 단계에서 수행되므로 `@RestControllerAdvice` 로 잡히지 않는다.
따라서 `JwtAuthenticationFilter` 가 직접 `200 + GlobalResponse` JSON 을 써서 응답을 종료한다.

```
요청 → JwtAuthenticationFilter
        ├─ /api/chat 가 아니면 통과
        ├─ Bearer 헤더 없음               → TOKEN_MISSING(4001) 응답
        ├─ JwtVerifier.verify(token)
        │     └─ 실패 시 JwtVerificationException(resultCode) throw
        │         → 필터가 catch 하여 해당 resultCode 응답 (4002~4006)
        └─ 성공 → SecurityContext 에 userPk(principal) 저장 후 컨트롤러로 진행
```

- `JwtVerifier` 는 RS256 서명/`iss`/`exp` 를 JDK 기능만으로 검증하며, 실패 원인별로 `JwtVerificationException` 에 `ResultCodeEnum` 을 담아 던진다.
- 검증 실패 응답도 HTTP 200 을 유지한다(Spring Security 기본 401/403 을 사용하지 않는 이유).

### 3.2 비즈니스/기타 오류 — @RestControllerAdvice

컨트롤러·서비스에서 발생한 예외는 `common.GlobalExceptionHandler` 가 변환한다.

| 처리 대상 예외 | 변환 결과 |
|----------------|-----------|
| `ApiException` | 예외가 담고 있는 `resultCode` (예: 5001, 5002) |
| `HttpMessageNotReadableException` | `INVALID_REQUEST(4000)` |
| 그 외 `Exception` | `INTERNAL_ERROR(9000)` |

- 비즈니스 검증 실패는 `ChatService` 에서 `ApiException(ResultCodeEnum)` 을 던진다.
  - 채팅방 미존재 → `CHATROOM_NOT_FOUND`
  - 참여하지 않은 사용자 → `USER_NOT_IN_CHATROOM`
- `@Transactional` 안에서 `ApiException` 이 던져지면 트랜잭션은 롤백되어 채팅 레코드가 저장되지 않는다.

## 4. 푸시 전송 실패는 예외로 다루지 않음

SR §7 에 따라 Fake Push Server 요청은 **0.5초가 소요되며 5% 확률로 실패**할 수 있으나,
실패하더라도 채팅 서버 로직은 계속 진행되어야 한다.
따라서 `PushClient.send()` 는 내부에서 예외를 삼키며(swallow), 채팅 저장/응답에는 영향을 주지 않는다.
단, 실패한 경우 그 Call Stack 은 `error.log` 에 기록한다 (아래 §5).

## 5. 에러 로그 (error.log)

SR §8 에 따라 **서버 내부 에러 및 푸시 전송 에러의 Call Stack** 을 `error.log` 로 남긴다.
`ErrorFileLogger`(로거 이름 `ERROR_FILE`)를 통해 출력하며, logback 설정에서 error.log 전용 appender 로 라우팅된다.

| 기록 대상 | 기록 지점 |
|-----------|-----------|
| 비즈니스 에러(`ApiException`, 예: 없는 채팅방) | `GlobalExceptionHandler.handleApiException` |
| 예기치 못한 서버 에러(`Exception`) | `GlobalExceptionHandler.handleException` |
| 푸시 전송 실패 | `PushClient.send` catch |

- JWT 인증 실패(40xx)는 **예상 가능한 클라이언트 오류**이므로 error.log 대상에서 제외한다(표준 응답으로만 처리).
- API 요청 로그(server.log + DB `api_log`)는 별도 문서/구현(`logging` 패키지) 참고. GET 제외, Authorization 헤더 미기록, 저장 실패해도 요청은 정상 진행.

## 5. 관련 파일

| 파일 | 역할 |
|------|------|
| `common/ResultCodeEnum.java` | 에러코드 단일 관리 |
| `common/GlobalResponse.java` | 표준 응답 DTO |
| `common/ApiException.java` | 비즈니스 예외 (resultCode 보유) |
| `common/GlobalExceptionHandler.java` | 컨트롤러/서비스 예외 → 표준 응답 |
| `security/JwtVerifier.java` | RS256 검증, 실패 시 `JwtVerificationException` |
| `security/JwtVerificationException.java` | 인증 예외 (resultCode 보유) |
| `security/JwtAuthenticationFilter.java` | 인증 오류를 200 응답으로 직접 작성 |
| `logging/ErrorFileLogger.java` | error.log 로 Call Stack 출력 |
| `logging/ApiLogService.java` | API 요청 로그를 server.log + DB(api_log)에 기록 |
| `logging/RequestLoggingFilter.java` | 요청 정보 캡처(GET 제외) |
| `resources/logback-spring.xml` | server.log / error.log appender 라우팅 |
