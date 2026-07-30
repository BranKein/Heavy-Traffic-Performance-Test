package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.common;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.logging.ErrorFileLogger;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 컨트롤러/서비스에서 발생한 예외를 표준 응답 DTO(HTTP 200)로 변환한다 (SR §5).
 * 서버 내부에서 발생한 에러는 error.log 에 Call Stack 을 남긴다 (SR §8).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private final ErrorFileLogger errorFileLogger;

    public GlobalExceptionHandler(ErrorFileLogger errorFileLogger) {
        this.errorFileLogger = errorFileLogger;
    }

    @ExceptionHandler(ApiException.class)
    public GlobalResponse<Void> handleApiException(ApiException e) {
        // 존재하지 않는 채팅방 등 서버 내부에서 발생한 에러의 발생 위치를 Call Stack 으로 기록 (SR §8)
        errorFileLogger.log("business error: " + e.getResultCode(), e);
        return GlobalResponse.error(e.getResultCode());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public GlobalResponse<Void> handleUnreadable(HttpMessageNotReadableException e) {
        return GlobalResponse.error(ResultCodeEnum.INVALID_REQUEST);
    }

    @ExceptionHandler(Exception.class)
    public GlobalResponse<Void> handleException(Exception e) {
        errorFileLogger.log("unexpected server error", e);
        return GlobalResponse.error(ResultCodeEnum.INTERNAL_ERROR);
    }
}
