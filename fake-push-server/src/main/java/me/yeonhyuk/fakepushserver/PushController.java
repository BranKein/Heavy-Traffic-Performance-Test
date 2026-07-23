package me.yeonhyuk.fakepushserver;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.time.Duration;

@Slf4j
@RestController
@RequestMapping("/api/push")
@RequiredArgsConstructor
public class PushController {
    private final PushCounter pushCounter;

    @PostMapping()
    public Mono<PushDto.GlobalResponse<PushDto.Res>> push(@RequestBody PushDto.Req req) {
        // delay 0.5 seconds
        return Mono.delay(Duration.ofMillis(500))
                .map(l -> {
                    // randomly return 100 with 95% of probability
                    if (Math.random() < 0.95) {
                        return 100;
                    } else {
                        return -1;
                    }
                })
                .map(probability -> {
                    this.pushCounter.increase();

                    if (probability == 100) {
                        return new PushDto.GlobalResponse<>(100, new PushDto.Res("Success", req.deviceId()));
                    } else {
                        return new PushDto.GlobalResponse<>(-1, new PushDto.Res("Failed", req.deviceId()));
                    }
                });
    }
}
