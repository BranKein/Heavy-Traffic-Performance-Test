package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "chat")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class Chat {

    @Id
    @Column(name = "pk")
    private UUID pk;

    @Column(name = "chat_room_fk")
    private UUID chatRoomFk;

    @Column(name = "user_fk")
    private UUID userFk;

    @Column(name = "chat_data")
    private String chatData;

    @Column(name = "create_date")
    private LocalDateTime createDate;

    public static Chat create(UUID chatRoomFk, UUID userFk, String chatData) {
        return new Chat(UUID.randomUUID(), chatRoomFk, userFk, chatData, LocalDateTime.now());
    }
}
