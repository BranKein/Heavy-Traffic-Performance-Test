package me.yeonhyuk.fakepushserver;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PushCounter {
    private int count = 0;

    public int getCount() {
        return count;
    }

    public synchronized void increase() {
        count++;
    }
}
