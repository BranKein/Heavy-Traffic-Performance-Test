package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * JWT 검증 설정 (SR §4). 공개키는 프로퍼티로 외부 주입한다.
 *
 * @param publicKey Base64(DER, X.509 SubjectPublicKeyInfo) 로 인코딩된 RSA 공개키
 * @param issuer    허용되는 iss 값 (정확히 일치해야 함) — {@code PUSH_BROADCASTING}
 */
@ConfigurationProperties(prefix = "jwt")
public record JwtProperties(String publicKey, String issuer) {
}
