package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.repository;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.entity.Chat;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ChatRepository extends JpaRepository<Chat, UUID> {
}
