/**
 * 모든 API 응답의 resultCode 를 한 곳에서 관리한다 (SR §5.4).
 * 응답 JSON 의 resultCode 는 정수로 직렬화된다 (SR §5.1).
 */
export const ResultCode = {
  SUCCESS: 100,

  // 요청/공통
  INVALID_REQUEST: 4000,

  // 인증 (JWT) — SR §4
  TOKEN_MISSING: 4001,
  TOKEN_MALFORMED: 4002,
  TOKEN_INVALID_ALGORITHM: 4003,
  TOKEN_INVALID_SIGNATURE: 4004,
  TOKEN_EXPIRED: 4005,
  TOKEN_INVALID_ISSUER: 4006,

  // 비즈니스 — SR §3
  CHATROOM_NOT_FOUND: 5001,
  USER_NOT_IN_CHATROOM: 5002,

  // 서버 내부 오류
  INTERNAL_ERROR: 9000,
} as const;

export type ResultCode = (typeof ResultCode)[keyof typeof ResultCode];
