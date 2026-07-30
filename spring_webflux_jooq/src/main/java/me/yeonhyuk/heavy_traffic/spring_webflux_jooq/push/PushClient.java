package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.push;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;
import reactor.netty.resources.ConnectionProvider;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * Fake Push Server({@code POST /api/push}) 로 디바이스별 푸시를 전송한다 (SR §7).
 * <p>
 * 푸시 성공/실패와 무관하게 비즈니스 로직은 계속 진행돼야 하므로(SR §7),
 * 어떤 오류가 나도 {@link Mono#empty()} 로 흡수하고 error.log 에만 스택을 남긴다.
 */
@Component
public class PushClient {

    private static final Logger log = LoggerFactory.getLogger(PushClient.class);

    private final WebClient webClient;

    public PushClient(WebClient.Builder builder, PushProperties properties) {
        // 기본 Reactor Netty 풀(500)은 0.5초 지연 × 500 = 1,000 push/s 에서 막힌다.
        // fake-push 스케일아웃이 의미를 가지려면 서버 전체 인플라이트만큼 커넥션을 열 수 있어야 한다.
        ConnectionProvider provider = ConnectionProvider.builder("push")
                .maxConnections(properties.maxConnections())
                .pendingAcquireMaxCount(-1)                       // 커넥션 대기 큐 무제한(획득 실패 대신 대기)
                .pendingAcquireTimeout(Duration.ofSeconds(60))
                .build();
        HttpClient httpClient = HttpClient.create(provider);
        this.webClient = builder
                .baseUrl(properties.baseUrl())
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    /**
     * 단일 디바이스로 푸시를 전송한다. 실패는 흡수되어 스트림을 중단시키지 않는다.
     */
    public Mono<Void> send(UUID deviceId) {
        return webClient.post()
                .uri("/api/push")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("deviceId", deviceId.toString()))
                .retrieve()
                .toBodilessEntity()
                .then()
                .onErrorResume(e -> {
                    log.error("푸시 전송 실패 deviceId={}", deviceId, e);
                    return Mono.empty();
                });
    }
}
