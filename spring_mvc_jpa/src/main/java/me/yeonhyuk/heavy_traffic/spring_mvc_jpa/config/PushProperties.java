package me.yeonhyuk.heavy_traffic.spring_mvc_jpa.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Fake Push Server 연동 설정 (SR §7).
 *
 * @param serverUrl 푸시 서버 base URL (예: http://localhost:9000)
 */
@ConfigurationProperties(prefix = "push")
public record PushProperties(String serverUrl) {
}
