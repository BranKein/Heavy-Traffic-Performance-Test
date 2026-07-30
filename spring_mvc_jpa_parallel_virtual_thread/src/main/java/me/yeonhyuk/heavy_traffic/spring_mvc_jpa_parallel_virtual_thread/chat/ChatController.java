package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.chat;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.common.GlobalResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 채팅 전송 API (SR §3). userPk 는 JWT 검증 후 principal 로 주입된다.
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @PostMapping
    public GlobalResponse<ChatResponse> sendChat(@AuthenticationPrincipal UUID userPk,
                                                 @RequestBody ChatRequest request) {
        UUID chatPk = chatService.sendChat(userPk, request.chatRoomPk(), request.chatData());
        return GlobalResponse.success(new ChatResponse(chatPk));
    }
}
