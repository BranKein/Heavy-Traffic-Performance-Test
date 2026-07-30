package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.web;

import java.util.UUID;

/**
 * 채팅 전송 요청 바디.
 *
 * @param chatRoomPk 채팅을 보낼 채팅방 PK
 * @param chatData   채팅 내용
 */
public record SendChatRequest(UUID chatRoomPk, String chatData) {
}
