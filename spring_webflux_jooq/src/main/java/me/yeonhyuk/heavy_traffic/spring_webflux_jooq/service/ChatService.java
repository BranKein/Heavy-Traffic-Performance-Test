package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.service;

import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.common.ApiException;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.common.ResultCodeEnum;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.push.PushClient;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.push.PushProperties;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.repository.ChatRepository;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.repository.ChatRoomRepository;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.repository.DeviceRepository;
import me.yeonhyuk.heavy_traffic.spring_webflux_jooq.repository.UserChatRoomRepository;
import org.jooq.DSLContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * 채팅 저장 + 푸시 브로드캐스트 비즈니스 로직 (SR §3).
 * <p>
 * 방 존재/멤버십 확인과 채팅 저장은 하나의 트랜잭션으로 처리하고(SR §6 — 항상 트랜잭션),
 * 0.5s 지연이 있는 푸시 전송은 DB 커넥션을 잡지 않도록 트랜잭션 밖에서 수행한다.
 */
@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final DSLContext dsl;
    private final ChatRoomRepository chatRoomRepository;
    private final UserChatRoomRepository userChatRoomRepository;
    private final ChatRepository chatRepository;
    private final DeviceRepository deviceRepository;
    private final PushClient pushClient;
    private final PushProperties pushProperties;

    public ChatService(DSLContext dsl,
                       ChatRoomRepository chatRoomRepository,
                       UserChatRoomRepository userChatRoomRepository,
                       ChatRepository chatRepository,
                       DeviceRepository deviceRepository,
                       PushClient pushClient,
                       PushProperties pushProperties) {
        this.dsl = dsl;
        this.chatRoomRepository = chatRoomRepository;
        this.userChatRoomRepository = userChatRoomRepository;
        this.chatRepository = chatRepository;
        this.deviceRepository = deviceRepository;
        this.pushClient = pushClient;
        this.pushProperties = pushProperties;
    }

    /**
     * 채팅을 저장하고 방의 모든 디바이스로 푸시를 브로드캐스트한다.
     *
     * @return 저장된 채팅 PK 와 브로드캐스트 소요시간(ms)
     */
    public Mono<ChatResult> sendChat(UUID userPk, UUID chatRoomPk, String chatData) {
        Mono<UUID> chatPk = Mono.from(dsl.transactionPublisher(cfg -> {
            DSLContext tx = cfg.dsl();
            return chatRoomRepository.existsById(tx, chatRoomPk)
                    .flatMap(roomExists -> roomExists
                            ? userChatRoomRepository.exists(tx, userPk, chatRoomPk)
                            : Mono.error(new ApiException(ResultCodeEnum.CHATROOM_NOT_FOUND)))
                    .flatMap(isMember -> isMember
                            ? chatRepository.insert(tx, chatRoomPk, userPk, chatData)
                            : Mono.error(new ApiException(ResultCodeEnum.USER_NOT_IN_CHATROOM)));
        }));

        return chatPk.flatMap(pk ->
                broadcast(chatRoomPk).map(elapsedMs -> new ChatResult(pk, elapsedMs)));
    }

    /**
     * 방의 모든 디바이스로 푸시를 전송하고, 시작~전체 완료까지의 소요시간을 측정한다 (SR §3-4).
     */
    private Mono<Long> broadcast(UUID chatRoomPk) {
        return Mono.defer(() -> {
            long startNanos = System.nanoTime();
            return deviceRepository.findDeviceIdsInChatRoom(dsl, chatRoomPk)
                    .flatMap(pushClient::send, pushProperties.maxConcurrency())
                    .then(Mono.fromSupplier(() -> {
                        long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000L;
                        log.info("푸시 브로드캐스트 완료 chatRoom={} elapsedMs={}", chatRoomPk, elapsedMs);
                        return elapsedMs;
                    }));
        });
    }

    /**
     * @param chatPk            저장된 채팅 레코드 PK
     * @param broadcastElapsedMs 브로드캐스트 소요시간(ms)
     */
    public record ChatResult(UUID chatPk, long broadcastElapsedMs) {
    }
}
