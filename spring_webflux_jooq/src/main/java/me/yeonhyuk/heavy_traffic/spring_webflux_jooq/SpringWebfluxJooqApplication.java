package me.yeonhyuk.heavy_traffic.spring_webflux_jooq;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.boot.jooq.autoconfigure.JooqAutoConfiguration;

/**
 * Better Chatting Push Server — 비동기(Spring WebFlux + jOOQ) 구현.
 * <p>
 * 런타임 DB 접근은 R2DBC 로만 하고 JDBC {@code DataSource} 는 두지 않는다(Flyway 만 자체 JDBC 사용).
 * 따라서 JDBC 기반인 {@link DataSourceAutoConfiguration}/{@link JooqAutoConfiguration} 을 제외하고,
 * jOOQ {@code DSLContext} 는 {@link me.yeonhyuk.heavy_traffic.spring_webflux_jooq.config.JooqConfig} 에서
 * R2DBC {@code ConnectionFactory} 로 직접 구성한다.
 */
@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class, JooqAutoConfiguration.class})
@ConfigurationPropertiesScan
public class SpringWebfluxJooqApplication {

    public static void main(String[] args) {
        new SpringApplicationBuilder(SpringWebfluxJooqApplication.class).run(args);
    }

}
