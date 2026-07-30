package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Fake Push Server 연동 설정 (SR §7).
 *
 * @param serverUrl 푸시 서버 base URL (예: http://localhost:9000)
 * @param poolSize  푸시 fan-out 플랫폼 스레드 풀 크기 (동시 푸시 상한). 미지정 시 200
 */
@ConfigurationProperties(prefix = "push")
public record PushProperties(String serverUrl, Integer poolSize) {

    public PushProperties {
        if (poolSize == null) {
            poolSize = 200;
        }
    }
}
