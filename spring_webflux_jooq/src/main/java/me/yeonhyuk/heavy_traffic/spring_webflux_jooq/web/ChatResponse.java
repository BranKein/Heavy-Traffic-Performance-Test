package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.web;

import java.util.UUID;

/**
 * 채팅 전송 응답 resultData. 저장된 채팅 PK 를 반환한다 (SR §2.1).
 *
 * @param chatPk             저장된 채팅 레코드 PK
 * @param broadcastElapsedMs 푸시 브로드캐스트 소요시간(ms) — 관측용
 */
public record ChatResponse(UUID chatPk, long broadcastElapsedMs) {
}
