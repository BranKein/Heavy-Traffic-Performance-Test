package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.config;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.security.JwtProperties;
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
import java.util.concurrent.atomic.AtomicInteger;

@Configuration
public class AppConfig {

    /**
     * 푸시 fan-out 용 executor. (Platform-thread 버전)
     * 가상 스레드 대신 고정 크기 <b>플랫폼 스레드</b> 풀을 쓴다. 각 푸시가 0.5초간
     * 블로킹되므로 이 풀 크기가 곧 동시 푸시 수의 상한이 된다 — device 수가 풀 크기를
     * 넘으면 초과분은 큐에서 대기하므로, 스레드당 비용이 큰 플랫폼 스레드의 한계를
     * 그대로 드러내는 비교군이다. 풀 크기는 push.pool-size 로 조정한다(기본 200).
     */
    @Bean(destroyMethod = "shutdown")
    public ExecutorService pushExecutor(PushProperties pushProperties) {
        AtomicInteger seq = new AtomicInteger();
        return Executors.newFixedThreadPool(pushProperties.poolSize(), r -> {
            Thread t = new Thread(r, "push-" + seq.incrementAndGet());
            t.setDaemon(true);
            return t;
        });
    }

    /**
     * Fake Push Server 호출용 RestClient.
     * 플랫폼 스레드 버전이므로 JDK HttpClient 도 기본(플랫폼 스레드) executor 를 쓴다.
     * 커넥션당 제약이 없어 풀 크기만큼의 동시 요청이 직렬화되지 않는다.
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
