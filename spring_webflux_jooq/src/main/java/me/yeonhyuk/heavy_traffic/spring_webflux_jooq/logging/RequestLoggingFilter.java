package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.logging;

import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.repository.ApiLogRepository;
import org.jooq.DSLContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import org.springframework.http.HttpMethod;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpRequestDecorator;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

/**
 * 모든 요청을 로깅한다 (SR §8).
 * <ul>
 *   <li>GET 요청은 무시하고, 그 외 요청만 기록한다.</li>
 *   <li>기록 항목: HTTP method, URI, 요청 시각, 요청 IP, 요청 body (Authorization 헤더는 제외).</li>
 *   <li>DB(api_log)와 파일(server.log) 양쪽에 기록하되, 로깅 실패는 요청 처리에 영향을 주지 않는다.</li>
 * </ul>
 * body 는 한 번만 소비 가능하므로, 캐싱 후 다운스트림(핸들러)이 다시 읽을 수 있도록 요청을 감싼다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter implements WebFilter {

    private static final Logger log = LoggerFactory.getLogger("API_LOG");
    private static final Logger errorLog = LoggerFactory.getLogger(RequestLoggingFilter.class);

    /** api_log.uri 컬럼 길이(varchar 64) 제한. */
    private static final int MAX_URI_LENGTH = 64;

    private final DSLContext dsl;
    private final ApiLogRepository apiLogRepository;

    public RequestLoggingFilter(DSLContext dsl, ApiLogRepository apiLogRepository) {
        this.dsl = dsl;
        this.apiLogRepository = apiLogRepository;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();

        // GET 요청은 로깅하지 않는다 (SR §8).
        if (HttpMethod.GET.equals(request.getMethod())) {
            return chain.filter(exchange);
        }

        return DataBufferUtils.join(request.getBody())
                .map(buffer -> {
                    byte[] bytes = new byte[buffer.readableByteCount()];
                    buffer.read(bytes);
                    DataBufferUtils.release(buffer);
                    return bytes;
                })
                .defaultIfEmpty(new byte[0])
                .flatMap(bodyBytes -> {
                    writeLog(request, bodyBytes);
                    ServerHttpRequest decorated = decorate(request, bodyBytes);
                    return chain.filter(exchange.mutate().request(decorated).build());
                });
    }

    /** 파일(server.log)과 DB(api_log)에 요청을 기록한다. 실패는 흡수한다. */
    private void writeLog(ServerHttpRequest request, byte[] bodyBytes) {
        String method = request.getMethod().name();
        String uri = truncate(request.getURI().getRawPath(), MAX_URI_LENGTH);
        String ip = clientIp(request);
        String body = new String(bodyBytes, StandardCharsets.UTF_8);
        LocalDateTime now = LocalDateTime.now();

        // 파일 로깅 (server.log)
        log.info("method={} uri={} ip={} body={}", method, uri, ip, body);

        // DB 로깅 (api_log) — 비차단 fire-and-forget, 실패해도 요청은 정상 진행
        apiLogRepository.insert(dsl, method, uri, now, ip, body)
                .subscribe(
                        ignored -> {},
                        e -> errorLog.error("api_log DB 기록 실패", e));
    }

    private static ServerHttpRequest decorate(ServerHttpRequest request, byte[] bodyBytes) {
        return new ServerHttpRequestDecorator(request) {
            @Override
            public Flux<DataBuffer> getBody() {
                return Flux.defer(() ->
                        Flux.just(new DefaultDataBufferFactory().wrap(bodyBytes)));
            }
        };
    }

    private static String clientIp(ServerHttpRequest request) {
        InetSocketAddress remote = request.getRemoteAddress();
        if (remote != null && remote.getAddress() != null) {
            return truncate(remote.getAddress().getHostAddress(), 64);
        }
        return null;
    }

    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }
}
