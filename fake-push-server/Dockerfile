FROM azul/zulu-openjdk:21-latest as builder

WORKDIR /app
COPY . /app

RUN ./gradlew clean bootJar

FROM azul/zulu-openjdk:21-latest
COPY --from=builder /app/build/libs/*.jar /app/simple-server.jar

ENTRYPOINT ["java", "-jar", "/app/simple-server.jar"]
