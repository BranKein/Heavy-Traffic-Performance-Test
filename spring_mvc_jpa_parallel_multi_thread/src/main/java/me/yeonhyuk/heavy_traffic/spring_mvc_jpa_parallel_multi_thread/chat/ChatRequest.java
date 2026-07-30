package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.chat;

import java.util.UUID;

/**
 * 채팅 전송 요청. 사용자(userPk)는 JWT 에서 얻으므로 body 에 포함하지 않는다.
 */
public record ChatRequest(UUID chatRoomPk, String chatData) {
}
