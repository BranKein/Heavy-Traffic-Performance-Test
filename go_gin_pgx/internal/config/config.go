// Package config 는 환경변수로 서버 설정을 주입받는다 (SR §4: 키 외부 주입).
package config

import (
	"os"
	"strconv"
)

// Config 는 서버 실행에 필요한 모든 설정이다.
type Config struct {
	Port               string
	DatabaseURL        string
	PushServerURL      string
	JWTPublicKey       string // Base64(X.509 SubjectPublicKeyInfo), RSA-2048. RS256 검증용 (SR §4)
	LogDir             string
	DBMaxConns         int
	PushMaxConcurrency int // 채팅방 하나당 동시 푸시 상한 (큰 방이 자원을 독점하지 않게)
	PushMaxIdleConns   int // 푸시 서버로 유지하는 keep-alive idle 커넥션 풀 크기 (서버 전체 동시성 기준)
}

// defaultPublicKey 는 로컬 개발용 샘플 키다 (Spring application.yaml 과 동일).
// 배포/테스트 시 JWT_PUBLIC_KEY 환경변수로 override 한다.
const defaultPublicKey = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1YrfAYl6cHNE9vYfTt5Oi8VHb0SdKaPbSiJjILZhSroG5qQLDBaIPrxDi+T8vexrbftg5mEx0IaIKJo/tJb+IBFfUT24BIaCdjcjhqJS6ZlPhIigFSqS4YlyWeTI4aMyAnCkbNO/lMvf7TTRbPHPvQfCyTEZbSxYFqqJWXBWiY7AIThNPUYAtF2SruZ6feTAnXJ1BAFxZcQ+jfk58PTKUPjrjgIIhd/slSmtgDzy4sxPJbyNgPErWEdqNtOzGPQlJx9ksuDALckoFuos23ij5eJUyIERIwXj59tdTOMz6snGTk+DhvcD8dLiquNWKq6PHKhRdNPVWxNBBygYICq/wIDAQAB"

// Load 는 환경변수(없으면 기본값)로 Config 를 채운다.
func Load() Config {
	return Config{
		Port:               env("SERVER_PORT", "8080"),
		DatabaseURL:        env("DATABASE_URL", "postgres://chat:chat1234@localhost:5432/chat_server"),
		PushServerURL:      env("PUSH_SERVER_URL", "http://localhost:9000"),
		JWTPublicKey:       env("JWT_PUBLIC_KEY", defaultPublicKey),
		LogDir:             env("LOG_DIR", "./logs"),
		DBMaxConns:         envInt("DB_MAX_CONNS", 10),
		PushMaxConcurrency: envInt("PUSH_MAX_CONCURRENCY", 64),
		PushMaxIdleConns:   envInt("PUSH_MAX_IDLE_CONNS", 12000),
	}
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
