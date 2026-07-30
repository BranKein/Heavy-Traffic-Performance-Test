package me.yeonhyuk.heavy_traffic.spring_mvc_jpa.config;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.security.JwtProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

@Configuration
public class AppConfig {

    /**
     * Fake Push Server 호출용 RestClient. (Awful 버전이므로 순차·동기 호출)
     * <p>
     * 기본 {@code SimpleClientHttpRequestFactory}(JDK {@code HttpURLConnection})는 호스트당
     * keep-alive 커넥션을 기본 5개(system property {@code http.maxConnections})로만 재사용해,
     * 순차 fan-out 자체 외에 커넥션 재수립이라는 부수적 병목을 만든다. 아키텍처(순차 처리)만
     * 측정되도록 커넥션 재사용 상한이 없는 JDK {@code HttpClient} 로 교체한다. (동기 호출은 그대로)
     */
    @Bean
    public RestClient pushRestClient(PushProperties pushProperties) {
        HttpClient httpClient = HttpClient.newBuilder().build();
        return RestClient.builder()
                .baseUrl(pushProperties.serverUrl())
                .requestFactory(new JdkClientHttpRequestFactory(httpClient))
                .build();
    }

    /**
     * properties 로 주입받은 RSA Public Key 로 검증용 키를 구성한다 (SR §4).
     */
    @Bean
    public RSAPublicKey jwtPublicKey(JwtProperties jwtProperties) {
        try {
            String sanitized = jwtProperties.publicKey()
                    .replaceAll("-----BEGIN[^-]*-----", "")
                    .replaceAll("-----END[^-]*-----", "")
                    .replaceAll("\\s", "");
            byte[] der = Base64.getDecoder().decode(sanitized);
            X509EncodedKeySpec keySpec = new X509EncodedKeySpec(der);
            return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(keySpec);
        } catch (Exception e) {
            throw new IllegalStateException("Invalid RSA public key in 'jwt.public-key' property", e);
        }
    }
}
