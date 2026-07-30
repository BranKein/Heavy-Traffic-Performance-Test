package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.repository;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.entity.ChatRoom;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, UUID> {
}
