package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * JWT 검증 설정 (SR §4). publicKey 는 properties 로 주입받는다 (테스트 시 외부 키 주입 가능).
 *
 * @param publicKey RSA Public Key (Base64 로 인코딩된 X.509 SubjectPublicKeyInfo, PEM 헤더 유무 무관)
 */
@ConfigurationProperties(prefix = "jwt")
public record JwtProperties(String publicKey) {
}
