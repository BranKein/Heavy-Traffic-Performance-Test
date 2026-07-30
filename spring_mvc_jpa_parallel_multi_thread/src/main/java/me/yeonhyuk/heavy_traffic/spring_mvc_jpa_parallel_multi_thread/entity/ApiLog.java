package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * API 요청 로그 (SR §8). DB 저장용 엔티티.
 * http_method(6), uri(64), ip(64) 는 DDL 의 컬럼 길이에 맞춘다.
 */
@Entity
@Table(name = "api_log")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class ApiLog {

    @Id
    @Column(name = "pk")
    private UUID pk;

    @Column(name = "http_method", length = 6)
    private String httpMethod;

    @Column(name = "uri", length = 64)
    private String uri;

    @Column(name = "request_time")
    private LocalDateTime requestTime;

    @Column(name = "ip", length = 64)
    private String ip;

    @Column(name = "request_body")
    private String requestBody;
}
