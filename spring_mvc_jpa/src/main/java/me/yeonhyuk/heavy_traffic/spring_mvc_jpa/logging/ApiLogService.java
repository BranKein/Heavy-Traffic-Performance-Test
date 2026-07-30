package me.yeonhyuk.heavy_traffic.spring_mvc_jpa.logging;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.entity.ApiLog;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.repository.ApiLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * API 요청 로그를 파일(server.log)과 DB(api_log) 양쪽에 남긴다 (SR §8).
 * 파일/DB 저장이 각각 실패하더라도 사용자 요청 흐름에는 영향을 주지 않는다.
 */
@Service
public class ApiLogService {

    /** logback 에서 server.log 로 라우팅되는 API 전용 로거. */
    private static final Logger fileLog = LoggerFactory.getLogger("api");

    private final ApiLogRepository apiLogRepository;

    public ApiLogService(ApiLogRepository apiLogRepository) {
        this.apiLogRepository = apiLogRepository;
    }

    public void record(String httpMethod, String uri, LocalDateTime requestTime, String ip, String requestBody) {
        // 1) 파일 로그 (server.log)
        try {
            fileLog.info("method={} uri={} time={} ip={} body={}", httpMethod, uri, requestTime, ip, requestBody);
        } catch (Exception ignored) {
            // 파일 로깅 실패는 요청 진행에 영향 없음 (SR §8)
        }

        // 2) DB 로그 (api_log) — 자체 트랜잭션으로 저장, 실패해도 무시
        try {
            apiLogRepository.save(new ApiLog(
                    UUID.randomUUID(),
                    truncate(httpMethod, 6),
                    truncate(uri, 64),
                    requestTime,
                    truncate(ip, 64),
                    requestBody
            ));
        } catch (Exception ignored) {
            // DB 로깅 실패는 요청 진행에 영향 없음 (SR §8)
        }
    }

    private String truncate(String value, int maxLength) {
        if (value == null) {
            return null;
        }
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }
}
