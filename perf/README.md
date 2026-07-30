# 성능 테스트 하네스 (k6 + 관찰성 + IaC)

채팅 푸시 브로드캐스팅 서버 3종에 대한 heavy-traffic 부하 테스트 구성입니다.

| 대상 | 설명 | k6 스크립트 |
|------|------|-------------|
| **Awful (chat-mvc)** | Spring MVC + JPA 동기 서버(푸시 순차). `POST /api/chat` | `k6/chat_test.js` |
| **Parallel/virtual (chat-mvc-parallel-virtual-thread)** | 위와 동일 스택, 푸시를 **가상 스레드**로 병렬 fan-out. `POST /api/chat` | `k6/chat_test.js` |
| **Parallel/platform (chat-mvc-parallel-multi-thread)** | 위와 동일 스택, 푸시를 **고정 플랫폼 스레드 풀**(`PUSH_POOLSIZE`, 기본 200)로 병렬 fan-out. `POST /api/chat` | `k6/chat_test.js` |
| **Better (chat-webflux)** | Spring WebFlux + jOOQ 비동기 서버. `POST /api/chat` | `k6/chat_test.js` |
| **Go (chat-go)** | Go + Gin + pgx 서버. 푸시 병렬 fan-out. `POST /api/chat` | `k6/chat_test.js` |
| **NestJS (chat-nestjs)** | NestJS + Drizzle 서버. 푸시 병렬 fan-out. `POST /api/chat` | `k6/chat_test.js` |
| **Fake Push** | 다운스트림 푸시 서버. `POST /api/push` (0.5초 지연, 5% 실패) | `k6/push_test.js` |

두 채팅 서버는 실제 푸시가 날아가는 것을 시뮬레이션하기 위해 **유저·채팅방·참여관계·디바이스**를 사전 시딩하고,
유저별 **JWT(RS256)** 를 미리 발급해 k6 가 인증 요청을 보냅니다. Fake Push 는 랜덤 UUID 만 호출하면 됩니다.

- **로컬 검증**: `docker-compose` 스택으로 구성이 맞는지 확인합니다.
- **실제 테스트**: `terraform` 으로 AWS EC2 단일 노드에 **k3s** 를 띄우고 `k8s/` 매니페스트로 실행합니다.
- **관찰성**: SUT(테스트 대상 서버) 코드를 건드리지 않고 **cAdvisor**(컨테이너 메모리/CPU) + **Prometheus**(k6 지표 remote-write 수신) + **Grafana** 대시보드로 봅니다. 메모리 100MB 목표(SR §10) 검증에 초점.

```
perf/
├─ seed/generate.mjs      # RSA 키쌍 + 시드 SQL + 유저별 JWT 생성 (Node 내장 crypto, 무의존성)
├─ k6/
│   ├─ chat_test.js       # 채팅 서버 (mvc/webflux 공통, BASE_URL 로 전환)
│   ├─ push_test.js       # fake push 서버
│   └─ lib/options.js     # 부하 프로파일(smoke/load/stress/spike) 빌더
├─ control/               # 마스터 컨트롤 패널 (SPA + 무의존 Node 백엔드, k8s/docker 2모드)
├─ docker-compose.yml     # 로컬 전체 스택 (perf-control 포함)
├─ run-local.sh           # 로컬 오케스트레이션 (시드→기동→적재→k6)
├─ docker/                # prometheus.yml, grafana 프로비저닝/대시보드
├─ k8s/                   # 쿠버네티스 매니페스트 (kustomize, control.yaml 포함)
└─ terraform/             # AWS EC2 + k3s 프로비저닝 + bootstrap.sh
```

---

## 1. 사전 준비 (시딩)

k6 가 채팅 서버에 인증 요청을 보내려면 ① 서버에 주입할 **JWT 공개키**와 ② 유저별 **JWT 토큰 + 채팅방** 데이터가 필요합니다.
`seed/generate.mjs` 가 이 둘을 한 번에 만듭니다.

```bash
cd perf
# 규모 조절(선택): 방 수 × 방당 유저 수 × 유저당 디바이스 수
SEED_ROOMS=10 SEED_USERS_PER_ROOM=10 SEED_DEVICES_PER_USER=1 node seed/generate.mjs
```

생성물:

| 파일 | 용도 |
|------|------|
| `keys/private.pem` | JWT 서명용 개인키 (RSA-2048) |
| `keys/jwt-public-key.b64` | **서버에 주입할 공개키** (`JWT_PUBLICKEY` 환경변수) |
| `out/seed.sql` | 채팅방/유저/참여/디바이스 INSERT (psql 로 적재) |
| `out/users.json` | k6 채팅 테스트 데이터 `[{ jwt, chatRoomPk }]` |
| `out/summary.json` | 생성 규모 요약 |

> **fan-out 크기 = 방당 유저 수 × 유저당 디바이스 수.** 채팅 1건당 이 횟수만큼 푸시가 나갑니다.
> Awful(동기) 서버는 fan-out 1건당 0.5초가 **순차**로 걸리므로, `SEED_USERS_PER_ROOM=10` 이면 채팅 1건 = 약 5초입니다.
> heavy 부하일수록 이 값을 키우면 됩니다. (단, `out/seed.sql`·`out/users.json` 이 커지면 k8s configmap 1MB 제한에 유의 — §4 참고)

키/토큰은 서버(`JwtVerifier`, jjwt)와 다음 계약을 지킵니다: `RS256`, `iss=PUSH_BROADCASTING`, `userPk=<uuid>`, 무만료, RSA-2048.

---

## 2. 로컬 검증 (docker-compose)

> 요구: Docker, Node. (k6 는 `grafana/k6` 이미지로 실행하므로 별도 설치 불필요.)

```bash
cd perf
./run-local.sh <target> <profile>
#   target : mvc | mvc-parallel-virtual-thread | mvc-parallel-multi-thread | webflux | go | nestjs | push   (기본 mvc)
#   profile: smoke | load | stress | spike (기본 smoke)

./run-local.sh mvc smoke                    # 예: Awful(순차) 서버 스모크 테스트
./run-local.sh mvc-parallel-virtual-thread load            # 예: 가상 스레드 병렬 버전 부하 테스트
PUSH_POOLSIZE=500 ./run-local.sh mvc-parallel-multi-thread load  # 예: 플랫폼 스레드 풀(500) 버전
./run-local.sh push load                    # 예: Fake Push 부하 테스트
```

스크립트가 순서대로 처리합니다:
1. 시드/키 생성(없을 때만) → `JWT_PUBLICKEY` 주입
2. 인프라 기동 (postgres, fake-push, cadvisor, prometheus, grafana)
3. SUT 이미지 빌드 & 기동 (리소스 제한 1 vCPU / 2 GB)
4. 헬스 대기 → 시드 SQL 적재
5. k6 실행 (지표를 Prometheus 로 remote-write)

**결과 확인**
- **마스터 컨트롤 패널 → http://localhost:8088** — 브라우저에서 대상 확인·테스트 시작/중지·로그·실시간 지표 (`control/` 참고, compose 로 함께 기동)
- k6 요약: 터미널 출력 (`checks`, `http_req_duration`, 커스텀 카운터)
- 실시간 대시보드: **Grafana → http://localhost:3000** (익명 접근 허용)
  대시보드: *Heavy Traffic — k6 + Container Resources* (요청속도/지연/VU/메모리/CPU)
- Prometheus: http://localhost:9090

**정리**
```bash
docker compose -p heavy-traffic-perf down -v
```

> **⚠️ macOS 로컬 한정 — cAdvisor 메모리 라벨**: Docker Desktop(Mac/Win)에서는 컨테이너가 LinuxKit VM 안에서 돌기 때문에
> cAdvisor 가 `name` 라벨을 채우지 못해 Grafana 메모리 패널이 비어 보일 수 있습니다. 로컬에서 실제 메모리는
> `docker stats perf-chat-mvc` 로 확인하세요. **실제 테스트(Linux k3s, §4)에서는 정상 수집**됩니다.
> (예: 이 하네스로 측정한 Awful 서버 = 약 245MB → 100MB 목표 초과, Better 버전으로 개선 대상.)

> **로컬 워크트리 주의**: 채팅 서버 소스가 커밋 전이라 워크트리에 없을 수 있습니다.
> 그럴 땐 원본 모듈 경로로 이미지를 미리 빌드하고 `SKIP_BUILD=1` 로 재사용하세요:
> ```bash
> docker build -t chat-mvc:local -f spring_mvc_jpa/Dockerfile /path/to/spring_mvc_jpa
> SKIP_BUILD=1 ./run-local.sh mvc smoke
> ```

---

## 3. 부하 프로파일

`k6/lib/options.js` 에서 정의합니다. `PROFILE` 로 선택하거나 `VUS`/`DURATION` 으로 직접 지정합니다.

| PROFILE | 개요 |
|---------|------|
| `smoke` | 5 VU, 약 1분. 구성 검증용 |
| `load`  | 50 VU, 약 3분. 기본 부하 |
| `stress`| 100→400 VU 램프업. 한계 탐색 |
| `spike` | 20→500 VU 급증. 스파이크 내성 |
| `breakpoint` | **닫힌 모델**. 0 → 아주 큰 **VU**(기본 2000)로 계속 선형 증가. 서버가 포화되면 응답시간이 늘어 req/s 는 평평해짐 → 그 지점이 한계 |
| `breakpoint-rate` | **열린 모델**. 0 → 아주 큰 **요청/초**(기본 2000 RPS)로 램프. req/s 를 직접 끌어올려, 서버가 못 따라오면 지연 급증 + `dropped_iterations` 로 한계가 드러남 |

기타 환경변수: `THRESHOLD_P95`(ms), `THRESHOLD_ERROR_RATE`, `THRESHOLD_HTTP_FAIL`, `VUS`, `DURATION`.
`breakpoint*` 전용: `BREAKPOINT_MAX_VUS`(기본 2000 — `breakpoint`는 목표 VU, `breakpoint-rate`는 VU 상한), `BREAKPOINT_MAX_RPS`(`breakpoint-rate`의 목표 req/s, 기본 2000), `BREAKPOINT_DURATION`(0→최대 도달 시간, 기본 20m). 컨트롤 패널 고급 옵션에서도 지정 가능.

> **VU 는 느는데 req/s 가 안 늘 때**: `breakpoint`(closed)는 `req/s = VU ÷ 응답시간` 이라 서버 포화 시 req/s 가 평평해지는 게 정상(그게 한계 신호). req/s 자체를 계속 올리려면 `breakpoint-rate`(open)를 쓴다.

> **서버 재기동 에러율 테스트(SR §9)**: 2분짜리 테스트 중 1분 시점에 SUT 를 재시작해 에러율을 봅니다.
> ```bash
> VUS=30 DURATION=2m ./run-local.sh mvc &     # 또는 k8s Job PROFILE 조정
> sleep 60 && docker restart perf-chat-mvc     # 로컬. k8s 는 kubectl rollout restart deploy/chat-mvc
> ```

---

## 4. 실제 테스트 (Terraform → AWS EC2 + k3s)

단일 EC2 인스턴스에 경량 쿠버네티스(k3s)를 올리고, `k8s/` 매니페스트로 전체 스택을 배포합니다.

### 4.1 준비물
- AWS 자격증명 (`aws configure` 또는 환경변수)
- 기존 **EC2 키페어** 이름과 개인키 파일

### 4.2 실행
```bash
cd perf/terraform
terraform init
terraform apply \
  -var 'key_name=<키페어이름>' \
  -var 'private_key_path=~/.ssh/<키>.pem' \
  -var 'allowed_cidr=<내IP>/32'
```

`terraform apply` 가 하는 일:
1. EC2(Ubuntu 22.04) 기동, cloud-init 으로 **k3s + docker + node** 설치
2. 리포지토리(spring 모듈 + `perf/`)를 인스턴스로 업로드
3. `terraform/bootstrap.sh` 실행: 이미지 빌드 → k3s import → 시드 생성 → `kubectl apply -k k8s/` → 시드 적재 → k6 Job 실행

출력값: `public_ip`, `ssh_command`, `grafana_url`, `control_url`.

배포가 끝나면 **마스터 컨트롤 패널(`control_url` = `http://<노드IP>:30800`)** 에서 브라우저로 대상 확인·테스트 시작/중지·로그·지표를 모두 제어할 수 있습니다. (SSH·kubectl 없이)

### 4.3 결과 확인 / 대상 전환 (인스턴스에서)
```bash
ssh -i <키> ubuntu@<public_ip>
export KUBECONFIG=~/.kube/config

k3s kubectl -n perf get pods
k3s kubectl -n perf logs -f job/k6-chat        # k6 결과
# Grafana: http://<public_ip>:30300

# webflux 대상으로 전환: k8s/k6-chat-job.yaml 의 BASE_URL 을 http://chat-webflux:8080 으로
# push 부하:  k3s kubectl -n perf apply -f app/perf/k8s/k6-push-job.yaml
```

### 4.4 정리
```bash
terraform destroy -var 'key_name=...' -var 'private_key_path=...'
```

> **configmap 1MB 제한**: 대용량 시드(`out/seed.sql`/`out/users.json` 이 ~1MB 초과)는 kustomize configmap 으로
> 못 올립니다. 이 경우 파일을 노드 hostPath 로 두고 Job/Deployment 볼륨을 hostPath 로 바꾸거나, 시드를 여러 Job 으로 분할하세요.

---

## 5. 쿠버네티스 구성 (참고)

`k8s/` (kustomize base = `kustomization.yaml`):

| 매니페스트 | 내용 |
|------------|------|
| `postgres.yaml` | PostgreSQL (emptyDir) |
| `fake-push.yaml` | Fake Push Server |
| `chat-mvc.yaml` / `chat-webflux.yaml` | SUT (1 vCPU / 2 GB limit, `JWT_PUBLICKEY` 는 Secret 주입) |
| `cadvisor.yaml` | 컨테이너 리소스 수집 DaemonSet |
| `prometheus.yaml` | remote-write 수신 + cadvisor/fake-push 스크랩 |
| `grafana.yaml` | 대시보드 프로비저닝, NodePort 30300 |
| `seed-job.yaml` | 시드 SQL 적재 Job |
| `k6-chat-job.yaml` / `k6-push-job.yaml` | 부하 실행 Job |

시드/키/대시보드/스크립트는 `kustomization.yaml` 의 `configMapGenerator`/`secretGenerator` 로 `perf/out`·`perf/keys`·`perf/docker`·`perf/k6` 파일에서 주입됩니다. 따라서 **`node seed/generate.mjs` 를 먼저 실행**해야 합니다.

generator 소스가 `k8s/` 디렉터리 밖에 있어 kustomize 기본 보안정책에 걸리므로, 적용은 load-restrictor 를 완화해서 합니다(`bootstrap.sh` 가 자동 처리):
```bash
kubectl kustomize --load-restrictor LoadRestrictionsNone k8s/ | kubectl apply -f -
```

이미지(`chat-mvc:local`, `chat-webflux:local`)는 k3s 노드 containerd 에 미리 import 되어 있어야 합니다(`bootstrap.sh` 가 처리).

---

## 6. 관찰성 지표 요약

- **k6 → Prometheus (remote-write)**: `k6_http_reqs_total`, `k6_http_req_duration_p95/p99`, `k6_vus`, `k6_checks_total`, 커스텀(`chat_result_code_success/error`, `push_success/failed`) 등
- **cAdvisor → Prometheus**: `container_memory_working_set_bytes`, `container_cpu_usage_seconds_total` (메모리 100MB 목표 검증)
- **Fake Push actuator → Prometheus**: JVM/HTTP 지표

Grafana 대시보드 하나에서 부하(k6)와 자원(cadvisor)을 함께 보며 Awful vs Better 를 비교합니다.
