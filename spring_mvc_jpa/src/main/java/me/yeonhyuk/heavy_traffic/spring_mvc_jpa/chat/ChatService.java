package me.yeonhyuk.heavy_traffic.spring_mvc_jpa.chat;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.common.ApiException;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.common.ResultCodeEnum;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.entity.Chat;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.entity.Device;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.push.PushClient;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.repository.ChatRepository;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.repository.ChatRoomRepository;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.repository.DeviceRepository;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.repository.UserChatRoomRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

/**
 * 채팅 브로드캐스팅 비즈니스 로직 (SR §3).
 *
 * <p>Awful(naive) 동기 버전이므로 각 device 에 대한 푸시를 순차적으로 호출한다
 * (device 당 0.5초 소요). 성능 비교의 기준선 역할을 한다.
 *
 * <p>DB 조회/저장 구간만 {@link TransactionTemplate} 으로 트랜잭션을 걸고 커밋 후 push
 * 전송을 시작한다(다른 두 parallel 변형과 동일한 수정) — 메서드 전체를 {@code @Transactional}
 * 로 감싸면 커넥션 하나가 순차 push 대기(device 수 × 0.5초) 동안 반납되지 않는다. 다만 이
 * 서버의 근본 병목은 순차 설계 자체(각 요청이 device 수만큼 500ms 를 직렬로 기다림)라
 * 커넥션 반납을 앞당겨도 처리량 자체는 거의 개선되지 않는다 — 그래도 커넥션을 불필요하게
 * 오래 붙잡지 않는 게 맞아서 일관되게 적용한다.
 */
@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final ChatRoomRepository chatRoomRepository;
    private final UserChatRoomRepository userChatRoomRepository;
    private final ChatRepository chatRepository;
    private final DeviceRepository deviceRepository;
    private final PushClient pushClient;
    private final TransactionTemplate transactionTemplate;

    public ChatService(ChatRoomRepository chatRoomRepository,
                       UserChatRoomRepository userChatRoomRepository,
                       ChatRepository chatRepository,
                       DeviceRepository deviceRepository,
                       PushClient pushClient,
                       PlatformTransactionManager transactionManager) {
        this.chatRoomRepository = chatRoomRepository;
        this.userChatRoomRepository = userChatRoomRepository;
        this.chatRepository = chatRepository;
        this.deviceRepository = deviceRepository;
        this.pushClient = pushClient;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public UUID sendChat(UUID userPk, UUID chatRoomPk, String chatData) {
        // 1~3: 존재 확인 + 채팅 저장 + 대상 device 조회 (SR §3-1~3-3) — 이 구간만 트랜잭션을
        // 걸어 커밋과 동시에 DB 커넥션을 반납한다.
        ChatWrite write = transactionTemplate.execute(status -> {
            if (!chatRoomRepository.existsById(chatRoomPk)) {
                throw new ApiException(ResultCodeEnum.CHATROOM_NOT_FOUND);
            }
            if (!userChatRoomRepository.existsByUserFkAndChatRoomFk(userPk, chatRoomPk)) {
                throw new ApiException(ResultCodeEnum.USER_NOT_IN_CHATROOM);
            }
            Chat chat = chatRepository.save(Chat.create(chatRoomPk, userPk, chatData));
            List<UUID> userPks = userChatRoomRepository.findUserFksByChatRoomFk(chatRoomPk);
            List<Device> devices = deviceRepository.findByUserFkIn(userPks);
            return new ChatWrite(chat.getPk(), devices);
        });

        // 4. 사용자들의 모든 device 로 푸시 전송 + 시간 측정 (SR §3-4)
        //    트랜잭션은 이미 커밋·반납됐으므로 이 구간은 DB 커넥션을 붙잡지 않는다.
        long start = System.nanoTime();
        for (Device device : write.devices()) {
            pushClient.send(device.getDeviceId());
        }
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;
        log.info("push broadcast done: chatRoom={}, devices={}, elapsedMs={}", chatRoomPk, write.devices().size(), elapsedMs);

        return write.chatPk();
    }

    private record ChatWrite(UUID chatPk, List<Device> devices) {}
}
