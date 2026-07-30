# syntax=docker/dockerfile:1

# ============================================================
# JVM 이미지 (GraalVM 네이티브 아님)
#   그냥 JVM 위에서 bootJar 를 실행하는 표준 멀티스테이지 빌드.
#   네이티브 이미지는 Dockerfile 없이 `./gradlew bootBuildImage`(Paketo buildpack)로 만든다.
# ============================================================

# 1) Build stage: JDK 로 bootJar 생성
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
COPY . .
RUN --mount=type=cache,target=/root/.gradle ./gradlew --no-daemon clean bootJar

# 2) Runtime stage: JRE 에 boot jar 만 복사
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
