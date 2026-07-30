package me.yeonhyuk.heavy_traffic.spring_webflux_jooq.config;

import io.r2dbc.spi.ConnectionFactory;
import org.jooq.DSLContext;
import org.jooq.SQLDialect;
import org.jooq.impl.DSL;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * R2DBC {@link ConnectionFactory} 위에 리액티브 jOOQ {@link DSLContext} 를 구성한다.
 * <p>
 * Spring Boot 의 {@code JooqAutoConfiguration} 은 JDBC {@code DataSource} 기반이므로
 * {@link me.yeonhyuk.heavy_traffic.spring_webflux_jooq.SpringWebfluxJooqApplication} 에서 제외하고
 * 여기서 직접 R2DBC 기반 DSLContext 를 만든다.
 */
@Configuration(proxyBeanMethods = false)
public class JooqConfig {

    @Bean
    public DSLContext dslContext(ConnectionFactory connectionFactory) {
        return DSL.using(connectionFactory, SQLDialect.POSTGRES);
    }
}
