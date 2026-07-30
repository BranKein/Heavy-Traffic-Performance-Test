package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.repository;

import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;

import java.util.UUID;

import static me.yeonhyuk.heavy_traffic.spring_webflux_jooq.jooq.Tables.DEVICE;
import static me.yeonhyuk.heavy_traffic.spring_webflux_jooq.jooq.Tables.USER_CHAT_ROOM;

@Repository
public class DeviceRepository {

    /**
     * 채팅방에 속한 모든 사용자의 모든 디바이스 ID 를 조회한다 (SR §3-3,4).
     */
    public Flux<UUID> findDeviceIdsInChatRoom(DSLContext dsl, UUID chatRoomPk) {
        return Flux.from(dsl.select(DEVICE.DEVICE_ID)
                        .from(DEVICE)
                        .join(USER_CHAT_ROOM).on(DEVICE.USER_FK.eq(USER_CHAT_ROOM.USER_FK))
                        .where(USER_CHAT_ROOM.CHAT_ROOM_FK.eq(chatRoomPk))
                        .and(DEVICE.DEVICE_ID.isNotNull()))
                .map(record -> record.value1());
    }
}
