#!/usr/bin/env bash
# 로컬 성능 테스트 오케스트레이션 (docker-compose 스택).
#
#   ./run-local.sh <target> <profile>
#     target  : mvc | mvc-parallel-virtual-thread | mvc-parallel-multi-thread | webflux | go | nestjs | push   (기본 mvc)
#     profile : smoke | load | stress | spike (기본 smoke)
#
# 환경변수:
#   SKIP_BUILD=1        이미지 재빌드 생략 (미리 빌드된 chat-*:local 사용)
#   MVC_MODULE_DIR=...  chat-mvc 소스 경로 override (기본 ../spring_mvc_jpa)
#   MVC_DOCKERFILE=...  Dockerfile 경로 override (기본 <MVC_MODULE_DIR>/Dockerfile)
#   PUSH_POOLSIZE=...   mvc-parallel-multi-thread 의 플랫폼 스레드 풀 크기(기본 200)
#
# 흐름: 시드 생성 → 인프라 기동 → SUT 빌드/기동 → 헬스대기 → 시드 적재 → k6 실행.
set -euo pipefail
cd "$(dirname "$0")"

TARGET="${1:-mvc}"
PROFILE="${2:-smoke}"
PROJECT="heavy-traffic-perf"
NETWORK="${PROJECT}_default"

echo "==> target=$TARGET profile=$PROFILE"

# 1. 시드/키 생성 (없을 때만)
if [ ! -f out/users.json ] || [ ! -f keys/jwt-public-key.b64 ]; then
  echo "==> 시드/키 생성 (seed/generate.mjs)"
  node seed/generate.mjs
fi
export JWT_PUBLICKEY="$(cat keys/jwt-public-key.b64)"

# 2. 인프라 기동 (마스터 컨트롤 패널 포함)
echo "==> 인프라 기동 (postgres, fake-push, cadvisor, prometheus, grafana, perf-control)"
docker compose -p "$PROJECT" up -d postgres fake-push-server cadvisor prometheus grafana perf-control
echo "    마스터 컨트롤 패널: http://localhost:8088"

# 2.5 스키마 + 시드 적재 (Flyway 폐기 → 시드가 스키마 소유).
#     Spring 앱은 flyway off + ddl-auto=validate 이므로 기동 전에 스키마가 있어야 한다.
#     → postgres 준비되면 SUT 빌드/기동보다 먼저 out/seed.sql(스키마 DDL+데이터)을 적재한다.
echo "==> postgres 준비 대기"
for i in $(seq 1 60); do
  docker exec perf-postgres pg_isready -U chat -d chat_server >/dev/null 2>&1 && { echo "   준비됨 (${i}s)"; break; }
  sleep 1
  [ "$i" = "60" ] && { echo "   postgres 기동 실패"; exit 1; }
done
echo "==> 스키마 + 시드 SQL 적재 (out/seed.sql)"
docker exec -i perf-postgres psql -U chat -d chat_server -v ON_ERROR_STOP=1 -q < out/seed.sql

case "$TARGET" in
  mvc)
    SVC=chat-mvc; SCRIPT=chat_test.js; BASE="http://chat-mvc:8080"; HOSTPORT=8080; NEED_SEED=1
    MODULE_DIR="${MVC_MODULE_DIR:-../spring_mvc_jpa}"
    DOCKERFILE="${MVC_DOCKERFILE:-$MODULE_DIR/Dockerfile}"
    ;;
  mvc-parallel-virtual-thread)
    SVC=chat-mvc-parallel-virtual-thread; SCRIPT=chat_test.js; BASE="http://chat-mvc-parallel-virtual-thread:8080"; HOSTPORT=8082; NEED_SEED=1
    MODULE_DIR="${MVC_PARALLEL_VIRTUAL_THREAD_MODULE_DIR:-../spring_mvc_jpa_parallel_virtual_thread}"
    DOCKERFILE="${MVC_PARALLEL_VIRTUAL_THREAD_DOCKERFILE:-$MODULE_DIR/Dockerfile}"
    ;;
  mvc-parallel-multi-thread)
    SVC=chat-mvc-parallel-multi-thread; SCRIPT=chat_test.js; BASE="http://chat-mvc-parallel-multi-thread:8080"; HOSTPORT=8083; NEED_SEED=1
    MODULE_DIR="${MVC_PARALLEL_MULTI_THREAD_MODULE_DIR:-../spring_mvc_jpa_parallel_multi_thread}"
    DOCKERFILE="${MVC_PARALLEL_MULTI_THREAD_DOCKERFILE:-$MODULE_DIR/Dockerfile}"
    ;;
  webflux)
    SVC=chat-webflux; SCRIPT=chat_test.js; BASE="http://chat-webflux:8080"; HOSTPORT=8081; NEED_SEED=1
    MODULE_DIR="${WEBFLUX_MODULE_DIR:-../spring_webflux_jooq}"
    DOCKERFILE="${WEBFLUX_DOCKERFILE:-$MODULE_DIR/Dockerfile}"
    ;;
  go)
    SVC=chat-go; SCRIPT=chat_test.js; BASE="http://chat-go:8080"; HOSTPORT=8084; NEED_SEED=1
    MODULE_DIR="${GO_MODULE_DIR:-../go_gin_pgx}"
    DOCKERFILE="${GO_DOCKERFILE:-$MODULE_DIR/Dockerfile}"
    ;;
  nestjs)
    SVC=chat-nestjs; SCRIPT=chat_test.js; BASE="http://chat-nestjs:8080"; HOSTPORT=8085; NEED_SEED=1
    MODULE_DIR="${NESTJS_MODULE_DIR:-../nestjs_drizzle}"
    DOCKERFILE="${NESTJS_DOCKERFILE:-$MODULE_DIR/Dockerfile}"
    ;;
  push)
    SVC=""; SCRIPT=push_test.js; BASE="http://fake-push-server:8090"; HOSTPORT=9000; NEED_SEED=0
    ;;
  *) echo "알 수 없는 target: $TARGET"; exit 1 ;;
esac

# 3. SUT 빌드 & 기동
if [ -n "$SVC" ]; then
  IMG="${SVC}:local"
  if [ "${SKIP_BUILD:-0}" != "1" ]; then
    echo "==> $SVC 이미지 빌드 ($MODULE_DIR)"
    docker build -t "$IMG" -f "$DOCKERFILE" "$MODULE_DIR"
  fi
  echo "==> $SVC 기동"
  if [ "$TARGET" = "webflux" ]; then
    docker compose -p "$PROJECT" --profile webflux up -d "$SVC"
  else
    docker compose -p "$PROJECT" up -d "$SVC"
  fi

  # 4. 헬스 대기 (POST /api/chat 는 토큰 없어도 200 을 반환하므로 기동 확인에 사용)
  echo "==> $SVC 헬스 대기 (localhost:$HOSTPORT)"
  for i in $(seq 1 60); do
    code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:$HOSTPORT/api/chat" \
      -H 'Content-Type: application/json' -d '{}' || true)"
    [ "$code" = "200" ] && { echo "   준비됨 (${i}s)"; break; }
    sleep 1
    [ "$i" = "60" ] && { echo "   기동 실패"; docker compose -p "$PROJECT" logs "$SVC" | tail -40; exit 1; }
  done
fi

# (시드 적재는 위 2.5 에서 앱 기동 전에 이미 완료됨 — Flyway 폐기로 시드가 스키마를 소유)

# 6. k6 실행 (Prometheus remote-write)
echo "==> k6 실행 ($SCRIPT)"
docker run --rm --network "$NETWORK" \
  -v "$PWD/k6:/scripts:ro" -v "$PWD/out:/out:ro" \
  -e BASE_URL="$BASE" -e USERS_FILE=/out/users.json -e PROFILE="$PROFILE" \
  -e TARGET_NAME="$TARGET" \
  -e K6_PROMETHEUS_RW_SERVER_URL="http://prometheus:9090/api/v1/write" \
  -e K6_PROMETHEUS_RW_TREND_STATS="p(95),p(99),avg,min,max" \
  grafana/k6 run -o experimental-prometheus-rw "/scripts/$SCRIPT"

echo "==> 완료."
echo "    마스터 컨트롤 패널: http://localhost:8088  (대상 확인/테스트 시작·중지/로그·지표)"
echo "    Grafana:            http://localhost:3000  (대시보드: Heavy Traffic — k6 + Container Resources)"
