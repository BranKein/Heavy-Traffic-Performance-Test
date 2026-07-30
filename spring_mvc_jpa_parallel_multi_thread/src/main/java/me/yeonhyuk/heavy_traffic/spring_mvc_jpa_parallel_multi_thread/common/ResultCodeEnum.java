package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.common;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 모든 API 응답의 resultCode를 한 곳에서 관리하는 Enum (SR §5.4).
 * JSON 직렬화 시 {@link JsonValue} 를 통해 정수 code 로 표현된다 (SR §5.1 schema).
 */
public enum ResultCodeEnum {

    SUCCESS(100),

    // 요청/공통
    INVALID_REQUEST(4000),

    // 인증 (JWT) — SR §4
    TOKEN_MISSING(4001),
    TOKEN_MALFORMED(4002),
    TOKEN_INVALID_ALGORITHM(4003),
    TOKEN_INVALID_SIGNATURE(4004),
    TOKEN_EXPIRED(4005),
    TOKEN_INVALID_ISSUER(4006),

    // 비즈니스 — SR §3
    CHATROOM_NOT_FOUND(5001),
    USER_NOT_IN_CHATROOM(5002),

    // 서버 내부 오류
    INTERNAL_ERROR(9000);

    private final int code;

    ResultCodeEnum(int code) {
        this.code = code;
    }

    @JsonValue
    public int getCode() {
        return code;
    }
}
