package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.repository;

import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;

import java.time.LocalDateTime;
import java.util.UUID;

import static me.yeonhyuk.heavy_traffic.spring_webflux_jooq.jooq.Tables.CHAT;

@Repository
public class ChatRepository {

    /**
     * 채팅 레코드를 새로 저장하고 생성된 PK 를 반환한다 (SR §3-2). PK 는 애플리케이션에서 생성한다.
     */
    public Mono<UUID> insert(DSLContext dsl, UUID chatRoomPk, UUID userPk, String chatData) {
        UUID pk = UUID.randomUUID();
        return Mono.from(dsl.insertInto(CHAT)
                        .set(CHAT.PK, pk)
                        .set(CHAT.CHAT_ROOM_FK, chatRoomPk)
                        .set(CHAT.USER_FK, userPk)
                        .set(CHAT.CHAT_DATA, chatData)
                        .set(CHAT.CREATE_DATE, LocalDateTime.now()))
                .thenReturn(pk);
    }
}
