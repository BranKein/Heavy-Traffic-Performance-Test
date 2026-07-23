package me.yeonhyuk.fakepushserver;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/counter")
@RequiredArgsConstructor
public class CounterController {
    private final PushCounter pushCounter;

    @GetMapping()
    public int getCounter() {
        return this.pushCounter.getCount();
    }
}
