# 마스터 컨트롤 패널

부하 테스트를 브라우저에서 제어하는 단일 페이지 패널 + 경량 백엔드입니다.
의존성 없는 Node(HTTP) 서버 하나가 정적 SPA 를 제공하고, k6 테스트를 오케스트레이션합니다.

## 할 수 있는 것
- **대상 서버 확인**: 7종(mvc / mvc-parallel-virtual-thread / mvc-parallel-multi-thread / webflux / go / nestjs / fake-push)의 배포·기동 상태
- **테스트 시작**: 대상 + 프로파일(smoke/load/stress/spike) 선택, 고급 옵션(VUS/DURATION/임계값)
- **테스트 중지 / 삭제**: **중지**는 부하 발생만 멈추고 실행 레코드(컨테이너/Job)와 로그·Prometheus 지표는 보존(docker=`docker stop`, k8s=러닝 Pod 만 제거). **삭제**는 실행 레코드를 완전 제거(docker=`rm -f`, k8s=`delete job`)
- **실행 목록 / 로그**: 실행별 상태·시작시각, k6 로그 tail
- **실시간 그래프(실행 단위)**: 요청/초·지연(p95·p99·avg, ms)·활성 VU·드롭 요청/초 라이브 라인 차트. 서버가 실행(run)별로 시계열을 캡처하므로 **테스트를 안 할 땐 정지, 시작하면 초기화, 진행 중엔 실시간 갱신, 끝나면 그 상태로 정지**. 긴 테스트는 **가로 스크롤**로 지난 구간 확인(X축=시각, 좌측 패널은 창 크기에만 반응하고 안 찌그러짐). **아래 실행 기록을 클릭하면 그때의 그래프를 다시** 띄움. 그래프 위에 마우스를 올리면 **툴팁(시각+전 지표 값)** 과 **4개 차트 공통 세로 점선(crosshair)** 표시. checks/메모리/CPU 는 현재값 카드.
- **동시 실행 방지**: 이미 테스트 중인 서버는 칩에 "실행 중" 표시 + "테스트 시작" 버튼 비활성화.
- **실행별 인라인 결과**: 로그를 열지 않아도 완료된 실행의 p95·에러율·req/s·**최대 req/s**(캡처 시계열의 순간 최대)·dropped 를 목록에 바로 표시 (k6 요약 파싱 + 시계열)
- **영구 저장**: 공유 Postgres(`control` 스키마)를 실행 목록의 원천으로 사용 — 컨트롤 서버 재시작, 컨테이너/Job 자동 삭제(auto-cleanup) 후에도 실행 기록·결과·그래프 시계열이 유지됨. DB 미구성/접속 실패 시엔 기존처럼 프로세스 메모리에만 담아(재시작 시 소실) 계속 동작.
- **자동 정리(auto-cleanup)**: 실행 종료 감지 시 로그·요약·시계열을 DB 에 저장한 뒤 컨테이너/Job 을 자동 삭제(`PERF_AUTO_CLEANUP=false` 로 끄면 기존처럼 컨테이너/Job 이 남음).
- **Export / Import(백업·복원)**: 전체 또는 선택 실행을 JSON 번들로 내보내기/가져오기 — k3s postgres 가 PVC 없이 휘발성이라 파일 백업이나 로컬↔EC2 결과 공유에 사용.
- **비교 모달**: 실행 목록에서 여러 건을 선택해 지표별로 겹쳐 그린 그래프(상대 경과시간축)로 비교.
- **Grafana 바로가기**

## 오케스트레이터 2모드 (`PERF_ORCH`, 기본 `auto`)
| 모드 | 제어 방식 | 용도 |
|------|-----------|------|
| `k8s` | `kubectl`(또는 `k3s kubectl`) 로 perf 네임스페이스의 Job/Deployment | EC2 k3s 실제 테스트 |
| `docker` | `docker` CLI 로 compose 스택 | 로컬 검증 |

`auto` 는 kubectl → docker 순으로 감지합니다.

## 실제 테스트 (AWS k3s)
terraform 배포에 포함되어 자동 기동됩니다. `terraform apply` 출력의 `control_url`(= `http://<노드IP>:30800`) 로 접속하세요.
(SG 30800 포트가 `allowed_cidr` 로 열립니다.)

## 로컬 실행 (docker-compose)
컨트롤 패널은 compose 스택의 `perf-control` 서비스로 포함되어 **함께 기동**됩니다.

```bash
cd perf
./run-local.sh mvc smoke          # 인프라 기동 시 perf-control 도 함께 뜸
# 또는 인프라만:
docker compose -p heavy-traffic-perf up -d perf-control prometheus grafana cadvisor fake-push-server postgres
# → http://localhost:8088
```

컨테이너 모드에서는 host `docker.sock` 에 붙어 k6 컨테이너를 직접 띄우며,
k6 는 `--volumes-from perf-control` 로 컨트롤 컨테이너의 `/scripts`(=`k6/`)·`/out`(=`out/`) 마운트를 물려받습니다.
(host 데몬 기준 경로 문제 회피)

### host 에서 직접 실행 (컨테이너 없이)
```bash
cd perf/control
PERF_ORCH=docker PROM_URL=http://localhost:9090 node server.mjs
```
이 경우 k6 볼륨은 `PERF_DIR`(기본 `..`) 하위 `k6/`·`out/` 를 직접 마운트합니다.
compose 프로젝트명이 다르면 `DOCKER_NETWORK` 로 네트워크명을 지정하세요.

## 환경변수
| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `8088` | 리슨 포트 |
| `PERF_ORCH` | `auto` | `auto` \| `k8s` \| `docker` |
| `NAMESPACE` | `perf` | k8s 네임스페이스 |
| `PROM_URL` | k8s=`http://prometheus:9090`, docker=`http://localhost:9090` | Prometheus 베이스 URL |
| `GRAFANA_PORT` | k8s=`30300`, docker=`3000` | Grafana 링크용 포트(현재 호스트에 붙임) |
| `PERF_DIR` | `..`(perf 루트) | docker 모드 k6 볼륨 마운트 경로 |
| `DOCKER_NETWORK` | `heavy-traffic-perf_default` | docker 모드 k6 컨테이너 네트워크 |
| `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` | docker=`localhost`/`5433`/…, k8s=`postgres`/`5432`/… (둘 다 DB `chat_server`) | 실행 기록 영속화용 Postgres 접속 정보(표준 libpq 환경변수, `psql` 이 사용). 접속 실패 시 영속화만 비활성화되고 서버는 계속 동작 |
| `PERF_AUTO_CLEANUP` | `true` | 실행 종료 시 로그/결과를 DB 에 저장한 뒤 컨테이너/Job 자동 삭제. `false` 면 기존처럼 남김 |

## API (프론트가 사용)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/config` | 모드·대상·프로파일·Grafana 포트 |
| GET | `/api/targets` | 대상별 배포/기동 상태 |
| GET | `/api/runs` | k6 실행 목록(DB 우선, 미구성 시 오케스트레이터 직접 조회) |
| POST | `/api/runs` | 테스트 시작 `{target, profile, vus?, duration?, thresholdP95?, thresholdErrorRate?}` |
| POST | `/api/runs/:id/stop` | 중지 (부하만 멈추고 레코드·로그 보존) |
| DELETE | `/api/runs/:id` | 삭제 (실행 레코드 완전 제거, DB 행도 함께 삭제) |
| GET | `/api/runs/:id/logs?tail=N` | k6 로그 tail (라이브 우선, 없으면 DB 저장 로그) |
| GET | `/api/runs/:id/series` | 실행별 캡처 시계열(그래프 재현용) |
| GET | `/api/runs/:id/result` | 실행 최종 결과(요약 + maxReqRate) |
| GET | `/api/metrics?target=KEY` | Prometheus 지표 요약(현재값) |
| GET | `/api/series?ids=a,b,c` | 여러 실행의 시계열을 한 번에 조회(비교 모달용) |
| GET | `/api/export`, `/api/export?ids=a,b` | 실행 기록 JSON 백업(전체/선택), 다운로드 |
| POST | `/api/import?mode=skip\|overwrite` | JSON 백업 복원. id 충돌 시 기본 skip |
