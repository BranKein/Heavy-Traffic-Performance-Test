package me.yeonhyuk.fakepushserver;

import java.util.UUID;

public class PushDto {
    public record Req(
            UUID deviceId
    ) {
    }

    public record GlobalResponse<T>(
            Integer resultCode,
            T resultData
    ) {
    }

    public record Res(
            String message,
            UUID deviceId
    ) {
    }
}
