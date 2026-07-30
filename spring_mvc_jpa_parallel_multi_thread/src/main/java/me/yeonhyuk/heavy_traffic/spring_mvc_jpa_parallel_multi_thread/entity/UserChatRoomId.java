package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.entity;

import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.UUID;

/**
 * user_chat_room 복합 PK (user_fk, chat_room_fk).
 */
@EqualsAndHashCode
@NoArgsConstructor
@AllArgsConstructor
public class UserChatRoomId implements Serializable {

    private UUID userFk;
    private UUID chatRoomFk;
}
