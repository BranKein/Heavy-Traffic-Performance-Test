package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.config;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.security.JwtProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Configuration
public class AppConfig {

    /**
     * 푸시 fan-out 용 executor. 각 푸시가 0.5초간 블로킹되므로 device 수만큼
     * 스레드가 필요하다 — 가상 스레드로 스레드당 비용을 없애 device 수에
     * 비례해 자유롭게 확장한다. (Parallel 버전 핵심)
     */
    @Bean(destroyMethod = "shutdown")
    public ExecutorService pushExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }

    /**
     * Fake Push Server 호출용 RestClient.
     * 다수 device 로의 동시 푸시를 처리해야 하므로 커넥션당 제약이 없는 JDK HttpClient
     * (가상 스레드 실행기 기반)를 사용해 병렬 요청이 직렬화되지 않게 한다.
     */
    @Bean
    public RestClient pushRestClient(PushProperties pushProperties) {
        HttpClient httpClient = HttpClient.newBuilder()
                .executor(Executors.newVirtualThreadPerTaskExecutor())
                .build();
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
