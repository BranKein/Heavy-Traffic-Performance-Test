package me.yeonhyuk.heavy_traffic.spring_mvc_jpa.repository;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.entity.Chat;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ChatRepository extends JpaRepository<Chat, UUID> {
}
