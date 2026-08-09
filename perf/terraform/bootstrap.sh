#!/usr/bin/env bash
# harness 노드(k3s server)에서 실행되는 부트스트랩. terraform 의 remote-exec 가 호출한다.
# 이미지는 Docker Hub(yeonhyukkim/*)에서 pull 하므로 여기서 빌드/import 하지 않는다
# (publish-images.sh 로 사전에 push 되어 있어야 함). 시드 생성 → k8s 배포 → 시드 적재.
set -euxo pipefail

APP=/home/ubuntu/app
K="k3s kubectl"

cd "$APP"

# 1. 시드/키 생성 (perf/out, perf/keys 산출 — kustomize configMap/secret 입력)
( cd perf && node seed/generate.mjs )

# 2. 노드 라벨 확인(디버깅용) — sut/deps 노드가 라벨/taint 를 제대로 받았는지
$K get nodes -L role

# 3. 베이스 배포 (kustomize: 시드/키/대시보드 configmap + prometheus RBAC 포함)
#    generator 소스가 k8s/ 밖(perf/out, perf/keys 등)에 있으므로 load-restrictor 완화 필요
$K kustomize --load-restrictor LoadRestrictionsNone perf/k8s/ | $K apply -f -

# 3-1. k6 chat Job 이 때릴 chat base URL 을 configmap(chat-endpoint) 으로 주입.
#      terraform remote-exec 가 CHAT_ENDPOINT=<NLB DNS>:80 를 넘기면 NLB 경유(부하가
#      harness→NLB→sut NodePort 실경로를 탄다). 없으면 cluster DNS 로 폴백.
#      (create --dry-run|apply 로 재실행 시 idempotent)
CHAT_BASE_URL="http://${CHAT_ENDPOINT:-chat-mvc:8080}"
echo "k6 chat BASE_URL = ${CHAT_BASE_URL}"
$K -n perf create configmap chat-endpoint \
  --from-literal=BASE_URL="${CHAT_BASE_URL}" \
  --dry-run=client -o yaml | $K apply -f -

# 3-2. 컨트롤 패널로 시작하는 부하도 실경로(NLB)를 타도록 perf-control 에 CHAT_ENDPOINT 주입.
#      (server.mjs 가 sut 타깃 BASE_URL 을 http://$CHAT_ENDPOINT 로 사용. 비면 svc DNS 폴백)
#      set env 는 값 변경 시에만 롤아웃을 유발하므로 재실행 idempotent.
if [ -n "${CHAT_ENDPOINT:-}" ]; then
  $K -n perf set env deploy/perf-control CHAT_ENDPOINT="${CHAT_ENDPOINT}"
fi

# 4. 스키마 + 시드 적재 (Flyway 폐기 → 시드가 스키마 소유).
#    Spring 앱은 flyway off + ddl-auto=validate 이므로 스키마가 먼저 있어야 검증을 통과한다.
#    → Spring rollout 대기보다 먼저 postgres 를 띄우고 시드를 적재한다(순서 중요).
$K -n perf rollout status deploy/postgres --timeout=180s
$K -n perf delete job seed-db --ignore-not-found
$K -n perf apply -f perf/k8s/seed-job.yaml
$K -n perf wait --for=condition=complete job/seed-db --timeout=180s

# 5. SUT 기동 대기 (sut 노드에서 Docker Hub pull. 스키마는 이미 준비됨 → validate 통과.
#    JVM 부팅이 postgres+시드보다 느려 대개 첫 기동에 바로 통과한다.)
$K -n perf rollout status deploy/chat-mvc --timeout=600s

set +x
echo "======================================================================"
echo " 배포 완료 (3-node k3s: harness/sut/deps)."
echo "  마스터 패널:  http://<harness 퍼블릭IP>:30800   ← 테스트 시작/중지/조회"
echo "  Grafana:      http://<harness 퍼블릭IP>:30300"
echo "  노드 확인:    k3s kubectl get nodes -L role -o wide"
echo "  파드 배치:    k3s kubectl -n perf get pod -o wide   (sut/deps 노드 분리 확인)"
echo "  k6 부하:      컨트롤 패널에서 시작(또는 perf/k8s/k6-*-job.yaml apply)"
echo "======================================================================"
