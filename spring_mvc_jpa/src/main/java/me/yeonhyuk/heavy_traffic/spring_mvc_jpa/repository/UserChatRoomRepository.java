package me.yeonhyuk.heavy_traffic.spring_mvc_jpa.repository;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.entity.UserChatRoom;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.entity.UserChatRoomId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface UserChatRoomRepository extends JpaRepository<UserChatRoom, UserChatRoomId> {

    boolean existsByUserFkAndChatRoomFk(UUID userFk, UUID chatRoomFk);

    @Query("select uc.userFk from UserChatRoom uc where uc.chatRoomFk = :chatRoomFk")
    List<UUID> findUserFksByChatRoomFk(UUID chatRoomFk);
}
