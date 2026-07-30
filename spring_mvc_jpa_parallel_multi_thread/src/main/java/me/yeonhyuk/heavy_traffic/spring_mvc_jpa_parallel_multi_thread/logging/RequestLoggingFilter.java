package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

/**
 * 들어오는 모든 요청(GET 제외)에 대해 request 로그를 남긴다 (SR §8).
 * - 기록 항목: HTTP method, URI, 요청 시각, 요청 IP, request body
 * - Authorization 등 헤더는 기록하지 않는다.
 * - request body 를 읽기 위해 {@link ContentCachingRequestWrapper} 로 감싸며,
 *   본문이 컨트롤러에서 읽힌 뒤(체인 완료 후) 캐시된 내용을 로깅한다.
 * - 가장 먼저 실행되도록 최우선 순위로 등록한다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter extends OncePerRequestFilter {

    /** request body 캐싱 한도 (bytes). 이 크기를 초과한 본문은 초과분이 캐시되지 않는다. */
    private static final int CONTENT_CACHE_LIMIT = 1024 * 1024;

    private final ApiLogService apiLogService;

    public RequestLoggingFilter(ApiLogService apiLogService) {
        this.apiLogService = apiLogService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        // GET 요청은 로깅 대상에서 제외 (SR §8)
        if (HttpMethod.GET.matches(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        LocalDateTime requestTime = LocalDateTime.now();
        ContentCachingRequestWrapper cachingRequest = new ContentCachingRequestWrapper(request, CONTENT_CACHE_LIMIT);
        try {
            filterChain.doFilter(cachingRequest, response);
        } finally {
            try {
                apiLogService.record(
                        request.getMethod(),
                        request.getRequestURI(),
                        requestTime,
                        resolveClientIp(request),
                        extractBody(cachingRequest)
                );
            } catch (Exception ignored) {
                // 로깅 자체의 실패는 요청 처리에 영향을 주지 않는다 (SR §8)
            }
        }
    }

    private String extractBody(ContentCachingRequestWrapper request) {
        byte[] content = request.getContentAsByteArray();
        if (content.length == 0) {
            return null;
        }
        String encoding = request.getCharacterEncoding();
        return new String(content, encoding != null ? java.nio.charset.Charset.forName(encoding) : StandardCharsets.UTF_8);
    }

    private String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(forwarded)) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
