package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.repository;

import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;

import java.time.LocalDateTime;
import java.util.UUID;

import static me.yeonhyuk.heavy_traffic.spring_webflux_jooq.jooq.Tables.API_LOG;

@Repository
public class ApiLogRepository {

    /**
     * API 요청 로그를 DB(api_log)에 저장한다 (SR §8).
     */
    public Mono<Void> insert(DSLContext dsl,
                             String httpMethod,
                             String uri,
                             LocalDateTime requestTime,
                             String ip,
                             String requestBody) {
        return Mono.from(dsl.insertInto(API_LOG)
                        .set(API_LOG.PK, UUID.randomUUID())
                        .set(API_LOG.HTTP_METHOD, httpMethod)
                        .set(API_LOG.URI, uri)
                        .set(API_LOG.REQUEST_TIME, requestTime)
                        .set(API_LOG.IP, ip)
                        .set(API_LOG.REQUEST_BODY, requestBody))
                .then();
    }
}
