package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;

/**
 * 인증은 {@link me.yeonhyuk.heavy_traffic.spring_webflux_jooq.auth.JwtAuthenticator} 가
 * 핸들러 레벨에서 직접 처리하고, 실패해도 HTTP 200 표준 응답을 돌려줘야 하므로 (SR §5)
 * Spring Security 의 기본 인증/401 동작을 끄고 모든 요청을 통과시킨다.
 */
@Configuration(proxyBeanMethods = false)
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
        return http
                .csrf(ServerHttpSecurity.CsrfSpec::disable)
                .httpBasic(ServerHttpSecurity.HttpBasicSpec::disable)
                .formLogin(ServerHttpSecurity.FormLoginSpec::disable)
                .logout(ServerHttpSecurity.LogoutSpec::disable)
                .authorizeExchange(exchange -> exchange.anyExchange().permitAll())
                .build();
    }
}
