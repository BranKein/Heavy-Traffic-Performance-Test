#!/usr/bin/env bash
# 로컬 빌드 대상 이미지(6 SUT + perf-control)를 Docker Hub 로 빌드·푸시한다.
# fake-push-server(yeonhyukkim/fake-push-server:latest) 와 동일한 네임스페이스 컨벤션.
#
# 왜 필요한가: 멀티노드 k3s 에선 `docker save | k3s ctr import` 로 한 노드에만 이미지를
# 넣는 방식이 안 통한다. Docker Hub 에 올려두면 어느 노드든 containerd 가 pull 한다.
#
# 중요: 개발 머신이 Apple Silicon(arm64)이어도 EC2 노드(c6i/t3)는 amd64 이므로
#       반드시 --platform linux/amd64 로 빌드한다(안 그러면 노드에서 exec format error).
#
# 사전조건: `docker login` (Docker Hub 인증) 완료. buildkit 사용(도커 기본).
#
# 사용:
#   ./publish-images.sh                 # yeonhyukkim/*:latest 로 전체 빌드·푸시
#   DOCKER_NS=myuser TAG=v1 ./publish-images.sh
#   ./publish-images.sh chat-go         # 특정 이미지만
set -euo pipefail

DOCKER_NS=${DOCKER_NS:-yeonhyukkim}
TAG=${TAG:-latest}
PLATFORM=${PLATFORM:-linux/amd64}

# 리포지토리 루트 (이 스크립트는 perf/ 아래에 있음)
ROOT=$(cd "$(dirname "$0")/.." && pwd)

# 이미지명 → 빌드 컨텍스트(리포 루트 기준). Dockerfile 은 각 컨텍스트의 Dockerfile.
declare -a IMAGES=(
  "htpt-spring-mvc:spring_mvc_jpa"
  "htpt-spring-mvc-parallel-virtual-thread:spring_mvc_jpa_parallel_virtual_thread"
  "htpt-spring-mvc-parallel-multi-thread:spring_mvc_jpa_parallel_multi_thread"
  "htpt-spring-webflux:spring_webflux_jooq"
  "htpt-go:go_gin_pgx"
  "htpt-nestjs:nestjs_drizzle"
  "htpt-perf-control:perf/control"
)

build_push() {
  local img=$1 ctx=$2
  local ref="$DOCKER_NS/$img:$TAG"
  echo "──────────────────────────────────────────────────────────"
  echo "▶ $ref   (context: $ctx, platform: $PLATFORM)"
  docker build --platform "$PLATFORM" -t "$ref" -f "$ROOT/$ctx/Dockerfile" "$ROOT/$ctx"
  docker push "$ref"
}

# 인자로 특정 이미지명을 주면 그것만, 없으면 전체.
want=("$@")
matched=0
for entry in "${IMAGES[@]}"; do
  img=${entry%%:*}
  ctx=${entry#*:}
  if [ ${#want[@]} -gt 0 ]; then
    skip=1
    for w in "${want[@]}"; do [ "$w" = "$img" ] && skip=0; done
    [ $skip -eq 1 ] && continue
  fi
  build_push "$img" "$ctx"
  matched=$((matched+1))
done

if [ ${#want[@]} -gt 0 ] && [ $matched -eq 0 ]; then
  echo "일치하는 이미지가 없습니다: ${want[*]}" >&2
  echo "가능한 이름: $(for e in "${IMAGES[@]}"; do printf '%s ' "${e%%:*}"; done)" >&2
  exit 1
fi

echo "──────────────────────────────────────────────────────────"
echo "완료: $matched 개 이미지 → Docker Hub($DOCKER_NS), tag=$TAG, platform=$PLATFORM"
echo "매니페스트는 kustomization.yaml 의 images: 가 $DOCKER_NS/* 를 참조합니다."
