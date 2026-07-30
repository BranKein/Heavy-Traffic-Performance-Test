package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.web;

import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.auth.JwtAuthenticator;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.common.GlobalResponse;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.service.ChatService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * 채팅 전송 API. JWT 인증(SR §4) → 채팅 저장 + 푸시 브로드캐스트(SR §3).
 */
@RestController
public class ChatController {

    private final JwtAuthenticator jwtAuthenticator;
    private final ChatService chatService;

    public ChatController(JwtAuthenticator jwtAuthenticator, ChatService chatService) {
        this.jwtAuthenticator = jwtAuthenticator;
        this.chatService = chatService;
    }

    @PostMapping("/api/chat")
    public Mono<GlobalResponse<ChatResponse>> sendChat(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestBody SendChatRequest request) {

        return Mono.fromCallable(() -> jwtAuthenticator.authenticate(authorization))
                .flatMap(userPk -> chatService.sendChat(userPk, request.chatRoomPk(), request.chatData()))
                .map(result -> GlobalResponse.success(
                        new ChatResponse(result.chatPk(), result.broadcastElapsedMs())));
    }
}
