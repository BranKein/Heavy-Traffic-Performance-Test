package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.push;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Fake Push Server 접속 설정 (SR §7).
 *
 * @param baseUrl        푸시 서버 base URL (예: {@code http://localhost:9000})
 * @param maxConcurrency 한 요청에서 동시에 전송할 최대 푸시 수
 * @param maxConnections 푸시 서버로의 전체 동시 커넥션 상한(Reactor Netty 풀 크기).
 *                       기본 Netty 풀은 500이라 0.5초 지연 × 500 = 최대 1,000 push/s 로 막힌다.
 *                       fake-push 스케일아웃 시 서버 전체 인플라이트(≈목표 push/s × 0.5s)만큼 키운다.
 */
@ConfigurationProperties(prefix = "push")
public record PushProperties(String baseUrl, int maxConcurrency, int maxConnections) {

    public PushProperties {
        if (maxConcurrency <= 0) {
            maxConcurrency = 256;
        }
        if (maxConnections <= 0) {
            maxConnections = 12000;
        }
    }
}
