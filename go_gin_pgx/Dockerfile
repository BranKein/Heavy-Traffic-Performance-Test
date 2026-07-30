# syntax=docker/dockerfile:1

# ============================================================
# 1) Build stage: 정적 링크된 Linux 바이너리를 만든다.
# ============================================================
FROM golang:1.25-alpine AS build
WORKDIR /src

# 의존성 캐시 레이어 (go.mod/go.sum 만 먼저 복사)
COPY go.mod go.sum* ./
RUN go mod download

# 소스 복사 후 빌드. CGO 끄고 정적 바이너리 생성.
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server ./cmd/server

# ============================================================
# 2) Runtime stage: 바이너리만 담은 최소 이미지.
#    Go 바이너리는 부팅이 매우 빨라 5초 목표(SR §9)를 쉽게 만족한다.
# ============================================================
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/server /app/server
EXPOSE 8080
ENTRYPOINT ["/app/server"]
