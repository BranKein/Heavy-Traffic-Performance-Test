package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.chat;

import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.common.ApiException;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.common.ResultCodeEnum;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.entity.Chat;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.entity.Device;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.push.PushClient;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.repository.ChatRepository;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.repository.ChatRoomRepository;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.repository.DeviceRepository;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.repository.UserChatRoomRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;

/**
 * 채팅 브로드캐스팅 비즈니스 로직 (SR §3).
 *
 * <p>Parallel 버전: 각 device 에 대한 푸시(device 당 0.5초 소요)를 순차 호출하지 않고
 * 가상 스레드 풀 위에서 동시에 fan-out 한다. 브로드캐스트 지연이 device 수에
 * 비례하지 않고 사실상 가장 느린 단일 푸시(≈0.5초)에 수렴한다.
 * 동기 순차 버전(spring_mvc_jpa)이 성능 비교의 기준선이다.
 *
 * <p>DB 조회/저장 구간만 {@link TransactionTemplate} 으로 트랜잭션을 걸고 커밋 후 push
 * 팬아웃을 시작한다 — 메서드 전체를 {@code @Transactional} 로 감쌌더니 커넥션 하나가 팬아웃
 * 대기(≈0.5초+) 동안 반납되지 않아, HikariCP 기본 풀(10)이 곧 동시 처리량 상한이 되는
 * 문제가 stress 테스트로 확인되어 이렇게 분리했다.
 */
@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final ChatRoomRepository chatRoomRepository;
    private final UserChatRoomRepository userChatRoomRepository;
    private final ChatRepository chatRepository;
    private final DeviceRepository deviceRepository;
    private final PushClient pushClient;
    private final ExecutorService pushExecutor;
    private final TransactionTemplate transactionTemplate;

    public ChatService(ChatRoomRepository chatRoomRepository,
                       UserChatRoomRepository userChatRoomRepository,
                       ChatRepository chatRepository,
                       DeviceRepository deviceRepository,
                       PushClient pushClient,
                       ExecutorService pushExecutor,
                       PlatformTransactionManager transactionManager) {
        this.chatRoomRepository = chatRoomRepository;
        this.userChatRoomRepository = userChatRoomRepository;
        this.chatRepository = chatRepository;
        this.deviceRepository = deviceRepository;
        this.pushClient = pushClient;
        this.pushExecutor = pushExecutor;
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

        // 4. 사용자들의 모든 device 로 푸시 병렬 전송 + 시간 측정 (SR §3-4)
        //    트랜잭션은 이미 커밋·반납됐으므로 이 구간은 DB 커넥션을 붙잡지 않는다.
        //    device 마다 CompletableFuture 를 가상 스레드 풀에 fan-out 하고 전부 완료될 때까지 대기한다.
        //    pushClient.send 는 내부에서 예외를 삼키므로(SR §7) join 이 실패로 끊기지 않는다.
        long start = System.nanoTime();
        CompletableFuture<?>[] futures = write.devices().stream()
                .map(device -> CompletableFuture.runAsync(
                        () -> pushClient.send(device.getDeviceId()), pushExecutor))
                .toArray(CompletableFuture[]::new);
        CompletableFuture.allOf(futures).join();
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;
        log.info("push broadcast done: chatRoom={}, devices={}, elapsedMs={}", chatRoomPk, write.devices().size(), elapsedMs);

        return write.chatPk();
    }

    private record ChatWrite(UUID chatPk, List<Device> devices) {}
}
