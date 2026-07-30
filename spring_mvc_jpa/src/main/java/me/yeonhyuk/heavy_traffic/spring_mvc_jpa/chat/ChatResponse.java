package me.yeonhyuk.heavy_traffic.spring_mvc_jpa.chat;

import java.util.UUID;

/**
 * 채팅 전송 응답. 저장된 채팅 레코드의 PK 를 반환한다 (SR §2.1).
 */
public record ChatResponse(UUID chatPk) {
}
