package me.yeonhyuk.heavy_traffic.spring_mvc_jpa.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.common.GlobalResponse;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa.common.ResultCodeEnum;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * 보호 대상 요청(/api/chat)에 대해 JWT 를 검증하는 필터 (SR §4).
 * 검증 실패 시에도 HTTP 200 + 표준 응답 DTO(resultCode)를 반환한다 (SR §5).
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String PROTECTED_PREFIX = "/api/chat";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtVerifier jwtVerifier;
    private final ObjectMapper objectMapper;

    public JwtAuthenticationFilter(JwtVerifier jwtVerifier, ObjectMapper objectMapper) {
        this.jwtVerifier = jwtVerifier;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (!request.getRequestURI().startsWith(PROTECTED_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authorization == null || !authorization.startsWith(BEARER_PREFIX)) {
            writeError(response, ResultCodeEnum.TOKEN_MISSING);
            return;
        }

        try {
            UUID userPk = jwtVerifier.verify(authorization.substring(BEARER_PREFIX.length()).trim());
            var authentication = new UsernamePasswordAuthenticationToken(userPk, null, List.of());
            SecurityContextHolder.getContext().setAuthentication(authentication);
            filterChain.doFilter(request, response);
        } catch (JwtVerificationException e) {
            writeError(response, e.getResultCode());
        }
    }

    private void writeError(HttpServletResponse response, ResultCodeEnum resultCode) throws IOException {
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(GlobalResponse.error(resultCode)));
    }
}
