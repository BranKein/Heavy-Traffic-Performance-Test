package me.yeonhyuk.heavy_traffic.spring_mvc_jpa.push;

/**
 * Fake Push Server 요청 body (SR §7.2).
 */
public record PushRequest(String deviceId) {
}
