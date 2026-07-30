package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.security;

import lombok.Getter;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.common.ResultCodeEnum;

/**
 * JWT 검증 실패 시 발생. 어떤 실패인지에 해당하는 resultCode 를 담는다 (SR §4).
 */
@Getter
public class JwtVerificationException extends RuntimeException {

    private final ResultCodeEnum resultCode;

    public JwtVerificationException(ResultCodeEnum resultCode) {
        super(resultCode.name());
        this.resultCode = resultCode;
    }
}
