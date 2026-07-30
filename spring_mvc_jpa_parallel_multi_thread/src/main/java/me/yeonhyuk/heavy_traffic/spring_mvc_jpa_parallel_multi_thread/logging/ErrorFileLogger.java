package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 서버 내부 에러 및 푸시 전송 에러의 Call Stack 을 error.log 로 출력한다 (SR §8).
 * logback 설정에서 "ERROR_FILE" 로거를 error.log 전용 appender 로 라우팅한다.
 */
@Component
public class ErrorFileLogger {

    private static final Logger log = LoggerFactory.getLogger("ERROR_FILE");

    public void log(String message, Throwable throwable) {
        log.error(message, throwable);
    }
}
