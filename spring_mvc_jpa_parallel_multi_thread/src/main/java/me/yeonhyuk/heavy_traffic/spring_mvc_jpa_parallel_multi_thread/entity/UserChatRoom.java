package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Entity
@Table(name = "user_chat_room")
@IdClass(UserChatRoomId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class UserChatRoom {

    @Id
    @Column(name = "user_fk")
    private UUID userFk;

    @Id
    @Column(name = "chat_room_fk")
    private UUID chatRoomFk;
}
