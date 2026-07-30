package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.common;

import lombok.Getter;

/**
 * 비즈니스 로직/인증 수행 중 발생하는, resultCode 로 변환 가능한 예외.
 */
@Getter
public class ApiException extends RuntimeException {

    private final ResultCodeEnum resultCode;

    public ApiException(ResultCodeEnum resultCode) {
        super(resultCode.name());
        this.resultCode = resultCode;
    }

    public ApiException(ResultCodeEnum resultCode, Throwable cause) {
        super(resultCode.name(), cause);
        this.resultCode = resultCode;
    }
}
