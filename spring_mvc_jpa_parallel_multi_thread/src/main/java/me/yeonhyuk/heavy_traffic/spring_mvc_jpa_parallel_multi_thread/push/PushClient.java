package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.push;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.logging.ErrorFileLogger;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.UUID;

/**
 * Fake Push Server 로 개별 device 에 푸시를 전송한다 (SR §7).
 * 푸시 전송은 반드시 0.5초가 걸리고 5% 확률로 실패할 수 있으나,
 * 실패해도 채팅 서버 로직은 계속 진행되어야 하므로 예외를 삼킨다 (SR §7).
 * 단, 실패 시 error.log 에 Call Stack 을 남긴다 (SR §8).
 */
@Component
public class PushClient {

    private final RestClient pushRestClient;
    private final ErrorFileLogger errorFileLogger;

    public PushClient(RestClient pushRestClient, ErrorFileLogger errorFileLogger) {
        this.pushRestClient = pushRestClient;
        this.errorFileLogger = errorFileLogger;
    }

    public void send(UUID deviceId) {
        try {
            pushRestClient.post()
                    .uri("/api/push")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new PushRequest(deviceId.toString()))
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            // 푸시 실패(5%)나 오류는 무시하고 계속 진행하되, error.log 에 기록 (SR §7, §8)
            errorFileLogger.log("push send failed: deviceId=" + deviceId, e);
        }
    }
}
