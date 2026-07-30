package me.yeonhyuk.heavy_traffic.spring_mvc_jpa;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class SpringMvcJpaApplication {

    public static void main(String[] args) {
        SpringApplication.run(SpringMvcJpaApplication.class, args);
    }

}