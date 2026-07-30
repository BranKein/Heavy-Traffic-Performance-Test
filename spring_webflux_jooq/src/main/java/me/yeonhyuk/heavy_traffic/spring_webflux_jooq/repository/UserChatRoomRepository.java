package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.repository;

import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;

import java.util.UUID;

import static me.yeonhyuk.heavy_traffic.spring_webflux_jooq.jooq.Tables.USER_CHAT_ROOM;

@Repository
public class UserChatRoomRepository {

    /**
     * 사용자가 해당 채팅방에 속해 있는지 여부 (SR §3-1).
     */
    public Mono<Boolean> exists(DSLContext dsl, UUID userPk, UUID chatRoomPk) {
        return Mono.from(dsl.selectOne()
                        .from(USER_CHAT_ROOM)
                        .where(USER_CHAT_ROOM.USER_FK.eq(userPk))
                        .and(USER_CHAT_ROOM.CHAT_ROOM_FK.eq(chatRoomPk)))
                .hasElement();
    }
}
