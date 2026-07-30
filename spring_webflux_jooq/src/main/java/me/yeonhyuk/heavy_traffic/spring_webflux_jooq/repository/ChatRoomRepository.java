package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.repository;

import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;

import java.util.UUID;

import static me.yeonhyuk.heavy_traffic.spring_webflux_jooq.jooq.Tables.CHAT_ROOM;

@Repository
public class ChatRoomRepository {

    /**
     * 채팅방 존재 여부. 트랜잭션 컨텍스트를 쓰려면 {@code dsl} 로 tx 의 DSLContext 를 넘긴다.
     */
    public Mono<Boolean> existsById(DSLContext dsl, UUID chatRoomPk) {
        return Mono.from(dsl.selectOne()
                        .from(CHAT_ROOM)
                        .where(CHAT_ROOM.PK.eq(chatRoomPk)))
                .hasElement();
    }
}
