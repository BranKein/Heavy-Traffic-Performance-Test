package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.common;

/**
 * 모든 API 가 동일한 형태로 반환하는 응답 DTO (SR §5).
 * resultData 는 제네릭 타입으로 정의한다.
 */
public record GlobalResponse<T>(ResultCodeEnum resultCode, T resultData) {

    public static <T> GlobalResponse<T> success(T resultData) {
        return new GlobalResponse<>(ResultCodeEnum.SUCCESS, resultData);
    }

    public static <T> GlobalResponse<T> error(ResultCodeEnum resultCode) {
        return new GlobalResponse<>(resultCode, null);
    }
}
