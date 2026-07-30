package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.web;

import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.common.ApiException;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.common.GlobalResponse;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.common.ResultCodeEnum;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.codec.DecodingException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ServerWebInputException;

/**
 * 컨트롤러/서비스에서 발생한 예외를 표준 응답 DTO(HTTP 200)로 변환한다 (SR §5).
 * 서버 내부 오류/비즈니스 예외의 콜스택은 error.log 로 남긴다 (SR §8).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public GlobalResponse<Void> handleApiException(ApiException e) {
        log.error("API 예외 resultCode={}", e.getResultCode(), e);
        return GlobalResponse.error(e.getResultCode());
    }

    @ExceptionHandler({ServerWebInputException.class, DecodingException.class})
    public GlobalResponse<Void> handleInvalidRequest(Exception e) {
        log.warn("잘못된 요청: {}", e.getMessage());
        return GlobalResponse.error(ResultCodeEnum.INVALID_REQUEST);
    }

    @ExceptionHandler(Exception.class)
    public GlobalResponse<Void> handleException(Exception e) {
        log.error("서버 내부 오류", e);
        return GlobalResponse.error(ResultCodeEnum.INTERNAL_ERROR);
    }
}
