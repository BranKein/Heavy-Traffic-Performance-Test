package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_multi_thread;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class SpringMvcJpaParallelMultiThreadApplication {

    public static void main(String[] args) {
        SpringApplication.run(SpringMvcJpaParallelMultiThreadApplication.class, args);
    }

}