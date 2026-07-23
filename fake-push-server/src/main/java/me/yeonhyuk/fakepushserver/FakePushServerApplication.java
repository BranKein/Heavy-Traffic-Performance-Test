package me.yeonhyuk.fakepushserver;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.reactive.config.EnableWebFlux;

@EnableWebFlux
@SpringBootApplication
public class FakePushServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(FakePushServerApplication.class, args);
    }

}
