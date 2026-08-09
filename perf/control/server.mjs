#!/usr/bin/env node
// 성능 테스트 마스터 컨트롤 서버 (의존성 없음, Node 20+).
//
// 하는 일:
//   - 테스트 대상 서버(SUT) 목록/상태 조회
//   - k6 부하 테스트 시작 / 중지 / 실행 목록 / 로그
//   - Prometheus 지표(요청률/p95/p99/에러율/VU/메모리/CPU) 실시간 조회
//   - 정적 SPA(public/) 제공
//
// 오케스트레이터 2모드 (PERF_ORCH 로 강제, 기본 auto):
//   - k8s    : `kubectl`(또는 `k3s kubectl`) 로 perf 네임스페이스의 Job/Deployment 제어 (EC2 k3s 실제 테스트)
//   - docker : `docker` CLI 로 compose 스택 제어 (로컬 검증)
//
// 환경변수:
//   PORT               리슨 포트 (기본 8088)
//   PERF_ORCH          auto | k8s | docker (기본 auto)
//   NAMESPACE          k8s 네임스페이스 (기본 perf)
//   PROM_URL           Prometheus 베이스 URL (기본: k8s=http://prometheus:9090, docker=http://localhost:9090)
//   GRAFANA_PORT       Grafana 노출 포트 (기본: k8s=30300, docker=3000) — 프론트가 현재 호스트에 붙여 링크 생성
//   PERF_DIR           perf 루트 경로 (docker 모드 볼륨 마운트용, 기본: 이 파일의 상위)
//   DOCKER_NETWORK     docker 모드 k6 컨테이너가 붙을 네트워크 (기본 heavy-traffic-perf_default)
//   PGHOST/PGPORT/...  공유 Postgres 접속 정보(표준 libpq 환경변수, db.mjs 가 psql 로 사용). 없으면
//                      docker=localhost:5433, k8s=postgres:5432 로 기본값 채움(둘 다 DB chat_server).
//                      접속 실패 시 실행 기록 영속화만 비활성화되고 서버는 계속 동작한다.
//   PERF_AUTO_CLEANUP  기본 on. 실행 종료 감지 시 로그/결과를 DB 에 저장한 뒤 컨테이너/Job 을 자동 삭제.
//                      off 로 끄면 기존처럼 컨테이너/Job 이 남는다(완료 상태로, 목록에서 계속 조회 가능).

import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import * as db from './db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '8088', 10);
const NAMESPACE = process.env.NAMESPACE || 'perf';
const PERF_DIR = process.env.PERF_DIR || join(__dirname, '..');
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'heavy-traffic-perf_default';
const K6_IMAGE = process.env.K6_IMAGE || 'grafana/k6:latest';
// docker 모드에서 컨트롤 서버가 컨테이너로 돌 때, k6 컨테이너가 물려받을 볼륨 소스 컨테이너.
// 설정 시 host 경로 마운트(-v) 대신 `--volumes-from` 사용 (compose 스택에서 권장).
const K6_VOLUMES_FROM = process.env.K6_VOLUMES_FROM || '';
const AUTO_CLEANUP = (process.env.PERF_AUTO_CLEANUP ?? 'true').toLowerCase() !== 'false';
// chat 부하가 실제 경로(harness→internal NLB→sut NodePort)를 타도록 하는 엔드포인트(host:port).
// terraform/bootstrap 이 <NLB DNS>:80 로 주입한다. 비어 있으면(로컬 compose 등) 클러스터
// DNS(svc:port)로 폴백. sut 타깃(chat)에만 적용 — push(fake-push) 는 그대로 직접 호출.
const CHAT_ENDPOINT = process.env.CHAT_ENDPOINT || '';

// ── 테스트 대상 카탈로그 ────────────────────────────────────────────────
// svc      : 클러스터/네트워크 내부 DNS 이름 (k8s Service = compose service, 동일)
// deploy   : k8s Deployment 이름 (readiness 조회)
// dcName   : docker container_name (compose)
// cName    : cadvisor `name` 라벨 값 (메모리/CPU 쿼리) — k8s=컨테이너명, docker=container_name
const TARGETS = [
  { key: 'mvc',                    label: 'spring mvc jpa',                  svc: 'chat-mvc',                    deploy: 'chat-mvc',                    dcName: 'perf-chat-mvc',                    port: 8080, script: 'chat_test.js', seed: true,  sut: true },
  { key: 'mvc-parallel-multi-thread',  label: 'spring mvc jpa parallel',         svc: 'chat-mvc-parallel-multi-thread',  deploy: 'chat-mvc-parallel-multi-thread',  dcName: 'perf-chat-mvc-parallel-multi-thread',  port: 8080, script: 'chat_test.js', seed: true,  sut: true },
  { key: 'mvc-parallel-virtual-thread',           label: 'spring mvc jpa parallel virtual', svc: 'chat-mvc-parallel-virtual-thread',           deploy: 'chat-mvc-parallel-virtual-thread',           dcName: 'perf-chat-mvc-parallel-virtual-thread',           port: 8080, script: 'chat_test.js', seed: true,  sut: true },
  { key: 'webflux',                label: 'spring webflux jooq',             svc: 'chat-webflux',                deploy: 'chat-webflux',                dcName: 'perf-chat-webflux',                port: 8080, script: 'chat_test.js', seed: true,  sut: true },
  { key: 'go',                     label: 'go gin pgx',                      svc: 'chat-go',                     deploy: 'chat-go',                     dcName: 'perf-chat-go',                     port: 8080, script: 'chat_test.js', seed: true,  sut: true },
  { key: 'nestjs',                 label: 'nestjs drizzle',                  svc: 'chat-nestjs',                 deploy: 'chat-nestjs',                 dcName: 'perf-chat-nestjs',                 port: 8080, script: 'chat_test.js', seed: true,  sut: true },
  { key: 'push',                   label: 'simulated push',                  svc: 'fake-push-server',            deploy: 'fake-push-server',            dcName: 'perf-fake-push',                   port: 8090, script: 'push_test.js', seed: false, sut: false },
];
const TARGET_MAP = Object.fromEntries(TARGETS.map((t) => [t.key, t]));

const PROFILES = ['smoke', 'load', 'stress', 'spike', 'breakpoint', 'breakpoint-rate'];

// ── child_process 헬퍼 ─────────────────────────────────────────────────
function run(cmd, args, { input } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => resolve({ code: -1, out, err: String(e.message || e) }));
    p.on('close', (code) => resolve({ code, out, err }));
    if (input != null) p.stdin.write(input);
    p.stdin.end();
  });
}

// ── 오케스트레이터 감지 ────────────────────────────────────────────────
let ORCH = null;      // 'k8s' | 'docker'
let KUBECTL = null;   // ['kubectl'] | ['k3s','kubectl']

async function detectOrch() {
  const forced = (process.env.PERF_ORCH || 'auto').toLowerCase();

  async function kubectlAvailable() {
    if ((await run('kubectl', ['version', '--client'])).code === 0) return ['kubectl'];
    if ((await run('k3s', ['kubectl', 'version', '--client'])).code === 0) return ['k3s', 'kubectl'];
    return null;
  }
  const dockerOk = async () => (await run('docker', ['version', '--format', '{{.Server.Version}}'])).code === 0;

  if (forced === 'k8s') {
    KUBECTL = (await kubectlAvailable()) || ['kubectl'];
    ORCH = 'k8s';
  } else if (forced === 'docker') {
    ORCH = 'docker';
  } else {
    const kc = await kubectlAvailable();
    if (kc) { KUBECTL = kc; ORCH = 'k8s'; }
    else if (await dockerOk()) { ORCH = 'docker'; }
    else { KUBECTL = ['kubectl']; ORCH = 'k8s'; } // 최후 기본값
  }
  console.log(`[control] orchestrator=${ORCH}${ORCH === 'k8s' ? ` (${KUBECTL.join(' ')})` : ''}`);
}

const kubectl = (args, opts) => run(KUBECTL[0], [...KUBECTL.slice(1), ...args], opts);
const PROM_URL = process.env.PROM_URL || (process.env.PERF_ORCH === 'docker' ? 'http://localhost:9090' : null);
const GRAFANA_PORT = parseInt(process.env.GRAFANA_PORT || '', 10);

function promUrl() {
  if (PROM_URL) return PROM_URL;
  return ORCH === 'docker' ? 'http://localhost:9090' : 'http://prometheus:9090';
}
function grafanaPort() {
  if (!Number.isNaN(GRAFANA_PORT)) return GRAFANA_PORT;
  return ORCH === 'docker' ? 3000 : 30300;
}

// ── 대상 상태 ──────────────────────────────────────────────────────────
// k8s resources.limits 파싱: cpu("500m"→0.5, "2"→2), memory("2Gi"→bytes). 못 읽으면 null.
function parseK8sCpu(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s.endsWith('m')) { const n = parseFloat(s); return Number.isNaN(n) ? null : n / 1000; }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}
function parseK8sMem(v) {
  if (v == null) return null;
  const m = String(v).trim().match(/^([\d.]+)\s*([A-Za-z]*)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const mult = { '': 1, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };
  const f = mult[m[2]];
  return f == null ? null : Math.round(n * f);
}

// docker HostConfig 에서 할당된 코어수/메모리(bytes)를 뽑는다. NanoCpus 우선, 없으면
// CpuQuota/CpuPeriod 폴백. 값이 0(미설정)이면 null.
function dockerCores(nano, quota, period) {
  const n = Number(nano), q = Number(quota), p = Number(period);
  if (n > 0) return n / 1e9;
  if (q > 0 && p > 0) return q / p;
  return null;
}

async function listTargets() {
  if (ORCH === 'k8s') {
    const r = await kubectl(['-n', NAMESPACE, 'get', 'deploy', '-o', 'json']);
    let items = [];
    try { items = JSON.parse(r.out).items || []; } catch { /* 네임스페이스 부재 등 */ }
    const byName = Object.fromEntries(items.map((d) => [d.metadata.name, d]));
    return TARGETS.map((t) => {
      const d = byName[t.deploy];
      const replicas = d ? (d.spec.replicas ?? 0) : 0;
      const ready = d ? (d.status?.readyReplicas ?? 0) : 0;
      // 추가 kubectl 호출 없이 이미 파싱된 Deployment JSON 에서 limit 을 함께 읽는다.
      const limits = d?.spec?.template?.spec?.containers?.[0]?.resources?.limits;
      const cpuLimit = parseK8sCpu(limits?.cpu);
      const memLimitBytes = parseK8sMem(limits?.memory);
      return { key: t.key, label: t.label, port: t.port, sut: t.sut, seed: t.seed, deployed: !!d, replicas, ready, up: ready > 0, cpuLimit, memLimitBytes };
    });
  }
  // docker — ps(상태) + inspect(할당 스펙) 를 한 번씩 병렬 조회.
  const [psR, inspR] = await Promise.all([
    run('docker', ['ps', '-a', '--format', '{{.Names}}\t{{.State}}']),
    run('docker', ['inspect', ...TARGETS.map((t) => t.dcName), '--format',
      '{{.Name}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.CpuQuota}}|{{.HostConfig.CpuPeriod}}|{{.HostConfig.Memory}}']),
  ]);
  const state = {};
  for (const line of psR.out.split('\n')) {
    const [name, st] = line.split('\t');
    if (name) state[name] = st;
  }
  // 존재하지 않는 컨테이너는 inspect 가 에러를 내지만, 찾은 것들의 출력 라인은 그대로 나온다.
  const limits = {};
  for (const line of inspR.out.split('\n')) {
    if (!line.trim()) continue;
    const [nameRaw, nano, quota, period, mem] = line.split('|');
    if (nameRaw == null) continue;
    const name = nameRaw.replace(/^\//, '');
    limits[name] = { cpuLimit: dockerCores(nano, quota, period), memLimitBytes: Number(mem) > 0 ? Number(mem) : null };
  }
  return TARGETS.map((t) => {
    const st = state[t.dcName];
    const up = st === 'running';
    const lim = limits[t.dcName] || {};
    return { key: t.key, label: t.label, port: t.port, sut: t.sut, seed: t.seed, deployed: !!st, replicas: st ? 1 : 0, ready: up ? 1 : 0, up, cpuLimit: lim.cpuLimit ?? null, memLimitBytes: lim.memLimitBytes ?? null };
  });
}

// SUT 서버(대상) 자신의 애플리케이션 로그 조회 — k6 로그(runLogs)와 구조는 같고 대상만 다름.
async function targetLogs(key, tail) {
  const t = TARGET_MAP[key];
  if (!t) return '알 수 없는 대상';
  const n = String(Math.min(Math.max(parseInt(tail, 10) || 200, 1), 2000));
  if (ORCH === 'k8s') {
    const r = await kubectl(['-n', NAMESPACE, 'logs', `deploy/${t.deploy}`, '--tail', n]);
    return r.out || r.err || '';
  }
  const r = await run('docker', ['logs', '--tail', n, t.dcName]);
  return r.out + r.err;
}

// ── k6 실행 목록 / 시작 / 중지 / 로그 ──────────────────────────────────
function jobStatus(job) {
  const s = job.status || {};
  if ((s.active ?? 0) > 0) return 'running';
  if ((s.succeeded ?? 0) > 0) return 'completed';
  if ((s.failed ?? 0) > 0) return 'failed';
  return 'pending';
}

// 오케스트레이터(컨테이너/Job)를 직접 조회한 "라이브" 목록 — DB 미구성 폴백 및
// reconcile 루프가 종료 감지에 사용한다. 공개 API(listRuns)는 DB 를 우선한다.
async function listRunsOrch() {
  if (ORCH === 'k8s') {
    const r = await kubectl(['-n', NAMESPACE, 'get', 'jobs', '-l', 'perf-control=k6', '-o', 'json']);
    let items = [];
    try { items = JSON.parse(r.out).items || []; } catch { /* noop */ }
    const runs = items.map((j) => ({
      id: j.metadata.name,
      target: j.metadata.labels?.['perf-target'] || '?',
      profile: j.metadata.labels?.['perf-profile'] || '?',
      status: jobStatus(j),
      startedAt: j.status?.startTime || j.metadata.creationTimestamp,
      finishedAt: j.status?.completionTime || null,
    }));
    runs.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    return runs;
  }
  // docker
  const fmt = '{{.Names}}\t{{.Label "perf-target"}}\t{{.Label "perf-profile"}}\t{{.State}}\t{{.CreatedAt}}';
  const r = await run('docker', ['ps', '-a', '--filter', 'label=perf-control=k6', '--format', fmt]);
  const runs = [];
  for (const line of r.out.split('\n')) {
    if (!line.trim()) continue;
    const [id, target, profile, st, created] = line.split('\t');
    let status = 'running';
    if (st === 'exited') status = 'completed';
    else if (st === 'dead' || st === 'created') status = 'failed';
    runs.push({ id, target, profile, status, startedAt: created, finishedAt: null });
  }
  runs.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  return runs;
}

// 공개 목록: DB 가 있으면 DB(원천)에서, 없으면(미구성/조회 실패) 오케스트레이터에서 직접 조회.
async function listRuns() {
  if (db.isEnabled()) {
    const rows = await db.listRuns();
    if (rows) return rows.map((r) => ({ id: r.id, target: r.target, profile: r.profile, status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt, label: r.label ?? null }));
  }
  return listRunsOrch();
}

function runEnv(t, body) {
  // chat(sut) 타깃은 NLB 경유(실경로) — CHAT_ENDPOINT 주입 시. push 는 항상 svc 직접.
  const baseUrl = t.sut && CHAT_ENDPOINT ? `http://${CHAT_ENDPOINT}` : `http://${t.svc}:${t.port}`;
  const env = {
    BASE_URL: baseUrl,
    PROFILE: body.profile || 'smoke',
    TARGET_NAME: t.key,
    // k6 컨테이너는 클러스터/compose 네트워크 내부에서 prometheus 서비스로 remote-write
    K6_PROMETHEUS_RW_SERVER_URL: 'http://prometheus:9090/api/v1/write',
    K6_PROMETHEUS_RW_TREND_STATS: 'p(95),p(99),avg,min,max',
  };
  if (t.seed) env.USERS_FILE = ORCH === 'docker' ? '/out/users.json' : '/data/users.json';
  if (body.vus) env.VUS = String(body.vus);
  if (body.duration) env.DURATION = String(body.duration);
  if (body.thresholdP95) env.THRESHOLD_P95 = String(body.thresholdP95);
  if (body.thresholdErrorRate) env.THRESHOLD_ERROR_RATE = String(body.thresholdErrorRate);
  // breakpoint 프로파일 튜닝 (최대 VU / 0→최대 도달 시간)
  if (body.breakpointMaxVus) env.BREAKPOINT_MAX_VUS = String(body.breakpointMaxVus);
  if (body.breakpointDuration) env.BREAKPOINT_DURATION = String(body.breakpointDuration);
  if (body.breakpointMaxRps) env.BREAKPOINT_MAX_RPS = String(body.breakpointMaxRps);
  return env;
}

function newRunId(key) {
  const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  return `k6-${key}-${ts}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function buildK8sJob(id, t, env) {
  const volumes = [
    { name: 'scripts', configMap: { name: 'k6-scripts', items: [{ key: t.script, path: t.script }, { key: 'options.js', path: 'lib/options.js' }] } },
  ];
  const mounts = [{ name: 'scripts', mountPath: '/scripts' }];
  if (t.seed) {
    volumes.push({ name: 'data', configMap: { name: 'perf-data' } });
    mounts.push({ name: 'data', mountPath: '/data' });
  }
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: id,
      namespace: NAMESPACE,
      labels: { 'perf-control': 'k6', 'perf-target': t.key, 'perf-profile': env.PROFILE },
    },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: 3600,
      template: {
        metadata: { labels: { 'perf-control': 'k6', 'perf-target': t.key } },
        spec: {
          restartPolicy: 'Never',
          containers: [{
            name: 'k6',
            image: K6_IMAGE,
            args: ['run', '-o', 'experimental-prometheus-rw', `/scripts/${t.script}`],
            env: Object.entries(env).map(([name, value]) => ({ name, value })),
            volumeMounts: mounts,
          }],
          volumes,
        },
      },
    },
  };
}

// 빈 문자열/공백만 있는 라벨은 null(=라벨 없음)로 정규화하고 길이를 제한한다.
function sanitizeLabel(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim().slice(0, 200);
  return trimmed || null;
}

async function startRun(body) {
  const t = TARGET_MAP[body.target];
  if (!t) return { error: `알 수 없는 target: ${body.target}` };
  if (body.profile && !PROFILES.includes(body.profile) && !body.vus) {
    return { error: `알 수 없는 profile: ${body.profile}` };
  }
  const id = newRunId(t.key);
  const env = runEnv(t, body);
  const label = sanitizeLabel(body.label);

  if (ORCH === 'k8s') {
    const manifest = JSON.stringify(buildK8sJob(id, t, env));
    const r = await kubectl(['apply', '-f', '-'], { input: manifest });
    if (r.code !== 0) return { error: r.err || r.out };
    await db.insertRun({ id, target: t.key, profile: env.PROFILE, paramsJson: body, status: 'running', startedAt: new Date().toISOString(), label });
    return { id };
  }
  // docker
  const args = ['run', '-d', '--name', id, '--network', DOCKER_NETWORK,
    '--label', 'perf-control=k6', '--label', `perf-target=${t.key}`, '--label', `perf-profile=${env.PROFILE}`];
  if (K6_VOLUMES_FROM) {
    // 컨트롤 서버가 컨테이너로 돌 때(compose): host 데몬 기준 경로 문제를 피하려고
    // 컨트롤 컨테이너의 /scripts·/out 마운트를 그대로 물려받는다.
    args.push('--volumes-from', K6_VOLUMES_FROM);
  } else {
    // 컨트롤 서버가 host 에서 `node server.mjs` 로 돌 때: perf 디렉터리를 직접 마운트.
    args.push('-v', `${join(PERF_DIR, 'k6')}:/scripts:ro`);
    if (t.seed) args.push('-v', `${join(PERF_DIR, 'out')}:/out:ro`);
  }
  for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`);
  args.push(K6_IMAGE, 'run', '-o', 'experimental-prometheus-rw', `/scripts/${t.script}`);
  const r = await run('docker', args);
  if (r.code !== 0) return { error: r.err || r.out };
  await db.insertRun({ id, target: t.key, profile: env.PROFILE, paramsJson: body, status: 'running', startedAt: new Date().toISOString(), label });
  return { id };
}

// 실행 이름 수정: 시작 시 안 붙였거나 나중에 다시 붙이고 싶을 때 사용. DB 미구성이면
// 저장할 곳이 없으므로 에러를 반환한다(실행 목록 자체가 DB 없이는 라벨을 못 가지므로).
async function renameRun(id, label) {
  if (!/^k6-[a-z0-9-]+$/.test(id)) return { error: '잘못된 실행 id' };
  if (!db.isEnabled()) return { error: 'DB 가 구성되지 않아 이름을 저장할 수 없습니다' };
  const ok = await db.updateRun(id, { label: sanitizeLabel(label) });
  if (!ok) return { error: '이름 저장 실패' };
  return { ok: true };
}

// 중지: 부하 발생만 멈추고 실행 레코드(컨테이너/Job)는 보존한다.
//   - docker: `docker stop` → SIGTERM 으로 k6 정상 종료. 컨테이너는 exited 상태로 남아
//             로그/최종 요약이 유지되고 목록에서 'completed' 로 표시된다.
//   - k8s   : 러닝 Pod 만 제거해 부하를 멈춘다. backoffLimit=0 이라 재생성되지 않고
//             Job 오브젝트는 남아(목록 유지) Prometheus/Grafana 지표도 보존된다.
async function stopRun(id) {
  if (!/^k6-[a-z0-9-]+$/.test(id)) return { error: '잘못된 실행 id' };
  if (ORCH === 'k8s') {
    const r = await kubectl(['-n', NAMESPACE, 'delete', 'pod', '-l', `job-name=${id}`, '--ignore-not-found']);
    if (r.code !== 0) return { error: r.err || r.out };
    return { ok: true };
  }
  const r = await run('docker', ['stop', id]);
  if (r.code !== 0) return { error: r.err || r.out };
  return { ok: true };
}

// 삭제: 실행 레코드를 완전히 제거한다(컨테이너/Job + DB 행 + 로그).
// DB 에 행이 있으면(=import 로 들여온 다른 환경의 기록 등, 이 환경엔 컨테이너/Job 이 아예
// 없을 수 있음) 오케스트레이터 삭제가 실패해도 DB 행 제거는 계속 진행한다.
async function deleteRun(id) {
  if (!/^k6-[a-z0-9-]+$/.test(id)) return { error: '잘못된 실행 id' };
  const dbRow = db.isEnabled() ? await db.getRun(id) : null;
  if (ORCH === 'k8s') {
    const r = await kubectl(['-n', NAMESPACE, 'delete', 'job', id, '--ignore-not-found']);
    if (r.code !== 0 && !dbRow) return { error: r.err || r.out };
  } else {
    const r = await run('docker', ['rm', '-f', id]);
    if (r.code !== 0 && !dbRow) return { error: r.err || r.out };
  }
  delete runSeries[id];
  await db.deleteRun(id);
  return { ok: true };
}

// 오케스트레이터(컨테이너/Job)에서 직접 로그를 가져온다 — 살아있는 동안만 가능.
async function runLogsLive(id, tail) {
  const n = String(Math.min(Math.max(parseInt(tail, 10) || 200, 1), 2000));
  if (ORCH === 'k8s') {
    const r = await kubectl(['-n', NAMESPACE, 'logs', `job/${id}`, '--tail', n]);
    return r.out || r.err || '';
  }
  const r = await run('docker', ['logs', '--tail', n, id]);
  return r.out + r.err;
}

// 공개 로그 조회: 컨테이너/Job 이 아직 살아있으면 라이브, 정리됐으면 DB 에 저장된 로그.
async function runLogs(id, tail) {
  if (!/^k6-[a-z0-9-]+$/.test(id)) return '잘못된 실행 id';
  let live = null;
  try {
    const orchRuns = await listRunsOrch();
    if (orchRuns.some((r) => r.id === id)) live = await runLogsLive(id, tail);
  } catch { /* 오케스트레이터 조회 실패 — DB 폴백으로 진행 */ }
  if (live) return live;
  if (db.isEnabled()) {
    const row = await db.getRun(id);
    if (row && row.logText) {
      const n = Math.min(Math.max(parseInt(tail, 10) || 200, 1), 2000);
      return row.logText.split('\n').slice(-n).join('\n');
    }
  }
  return '(로그 없음 — 컨테이너/Job 이 정리되었고 저장된 로그도 없습니다)';
}

// ── k6 텍스트 요약 파싱 (완료된 실행의 최종 결과를 로그에서 추출) ──────────
function parseK6Summary(text) {
  if (!text) return null;
  const res = {};
  let m;
  if ((m = text.match(/http_reqs[.\s]*:\s*([\d.]+)\s+([\d.]+)\/s/))) { res.reqs = +m[1]; res.reqRate = +m[2]; }
  if ((m = text.match(/http_req_duration[.\s]*:\s*avg=([\d.a-zµ]+).*?p\(95\)=([\d.a-zµ]+)/))) { res.avg = m[1]; res.p95 = m[2]; }
  if ((m = text.match(/http_req_failed[.\s]*:\s*([\d.]+)%/))) { res.failPct = +m[1]; }
  if ((m = text.match(/iterations[.\s]*:\s*([\d.]+)\s+([\d.]+)\/s/))) { res.iterations = +m[1]; }
  if ((m = text.match(/dropped_iterations[.\s]*:\s*([\d.]+)/))) { res.dropped = +m[1]; }
  return Object.keys(res).length ? res : null;
}

async function runResult(id) {
  if (!/^k6-[a-z0-9-]+$/.test(id)) return { error: '잘못된 실행 id' };
  // 이미 종료 처리된(=finalize 완료) 실행은 DB 에 저장된 최종 결과를 그대로 사용.
  if (db.isEnabled()) {
    const row = await db.getRun(id);
    if (row && row.status !== 'running') return { summary: row.resultJson || null };
  }
  // 실행 중(또는 DB 미구성) — 로그+표본으로 즉석 계산.
  const logs = await runLogs(id, 250);
  const summary = parseK6Summary(logs);
  // 캡처된 시계열에서 최대 순간 req/s 를 계산해 결과에 덧붙인다(요약엔 없는 값)
  // 실행 중엔 DB 가 아니라 라이브 버퍼가 원천(finalize 때 한 번에 업로드하는 방식이라
  // 실행 중인 run 은 DB 에 표본이 없다) — 종료 후엔 runSeries 가 비어있으므로 DB 로 폴백.
  const samples = runSeries[id]?.samples || (db.isEnabled() ? await db.getSamples(id) : []);
  if (samples.length) {
    let mx = null;
    for (const d of samples) if (d.reqRate != null && (mx == null || d.reqRate > mx)) mx = d.reqRate;
    if (mx != null) return { summary: { ...(summary || {}), maxReqRate: mx } };
  }
  return { summary };
}

// ── Prometheus 지표 ────────────────────────────────────────────────────
async function promQuery(q) {
  try {
    const res = await fetch(`${promUrl()}/api/v1/query?query=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const j = await res.json();
    const r = j?.data?.result;
    if (!r || r.length === 0) return null;
    const v = parseFloat(r[0].value[1]);
    return Number.isNaN(v) ? null : v;
  } catch {
    return null;
  }
}

async function metricsFor(key) {
  const t = TARGET_MAP[key];
  if (!t) return { error: 'unknown target' };
  const tag = `target="${key}"`;
  const cName = ORCH === 'docker' ? t.dcName : t.deploy;
  const nm = `name="${cName}"`;
  const [reqRate, p95, p99, avg, vus, errRate, dropRate, checksPass, checksFail, mem, cpu] = await Promise.all([
    promQuery(`sum(rate(k6_http_reqs_total{${tag}}[15s]))`),
    promQuery(`max(k6_http_req_duration_p95{${tag}})`),
    promQuery(`max(k6_http_req_duration_p99{${tag}})`),
    promQuery(`max(k6_http_req_duration_avg{${tag}})`),
    promQuery(`max(k6_vus{${tag}})`),
    promQuery(`rate(k6_http_req_failed_total{${tag}}[30s]) / clamp_min(rate(k6_http_reqs_total{${tag}}[30s]), 1)`),
    // 드롭된 이터레이션(요청 드롭) 실시간 rate — open 모델에서 서버가 못 따라올 때 증가
    promQuery(`sum(rate(k6_dropped_iterations_total{${tag}}[15s]))`),
    promQuery(`sum(rate(k6_checks_total{${tag},outcome="pass"}[30s]))`),
    promQuery(`sum(rate(k6_checks_total{${tag},outcome="fail"}[30s]))`),
    promQuery(`max(container_memory_working_set_bytes{${nm}})`),
    promQuery(`sum(rate(container_cpu_usage_seconds_total{${nm}}[30s]))`),
  ]);
  return { reqRate, p95, p99, avg, vus, errRate, dropRate, checksPass, checksFail, memBytes: mem, cpuCores: cpu };
}

// ── 실행별 시계열 캡처 / DB 영속화 ──────────────────────────────────────
// DB(control 스키마)가 구성되면, 실행 "중"에는 표본을 이 프로세스 메모리(runSeries)에만
// 쌓고(실시간 그래프는 여기서 서빙), **테스트가 끝났을 때 한 번에** DB 로 업로드한다
// ([[perf-control-persistence-plan]]). 처음엔 매 5초 tick 마다 psql 로 바로 적재했는데,
// stress 프로파일 여러 개를 동시에 돌리니 SUT 들 자신의 DB 커넥션과 겹쳐 postgres
// max_connections 를 넘겨 컨트롤 서버가 크래시한 적이 있어(2026-07-27) 이 방식으로 바꿨다.
// 대가: 서버가 실행 "도중"에 죽으면(재시작 등) 그 실행의 그래프 표본은 유실된다(로그 기반
// 최종 요약은 recoverOnBoot 이 그대로 복구 가능 — summary/maxReqRate 는 살아있는 컨테이너
// 로그에서 다시 계산되므로). DB 미구성일 땐 원래처럼 메모리에만 담아 서버 재시작 시 소실.
const runSeries = Object.create(null);      // id -> { id, target, profile, startedAt, finishedAt, samples: [...] } (실행 중 라이브 버퍼 겸 DB 미구성 폴백)
const SERIES_INTERVAL_MS = 5000;
const SERIES_MAX_SAMPLES = 20000;           // 메모리 폴백 run 당 상한(≈27h @5s)
const SERIES_TTL_MS = 2 * 60 * 60 * 1000;   // 메모리 폴백: 종료 후 2시간 보관

async function reconcile() {
  if (db.isEnabled()) return reconcileDb();
  return reconcileMemory();
}

// DB 미구성: 오케스트레이터를 직접 조회해 메모리에만 표본을 쌓는다(원래 동작).
async function reconcileMemory() {
  let runs;
  try { runs = await listRunsOrch(); } catch { return; }
  const present = new Set(runs.map((r) => r.id));
  for (const r of runs) {
    if (r.status !== 'running' || !TARGET_MAP[r.target]) continue;
    let s = runSeries[r.id];
    if (!s) s = runSeries[r.id] = { id: r.id, target: r.target, profile: r.profile, startedAt: r.startedAt, finishedAt: null, samples: [] };
    s.finishedAt = null;
    const m = await metricsFor(r.target);
    if (s.samples.length < SERIES_MAX_SAMPLES) {
      s.samples.push({ t: Date.now(), reqRate: m.reqRate, p95: m.p95, p99: m.p99, avg: m.avg, vus: m.vus, errRate: m.errRate, dropRate: m.dropRate, checksPass: m.checksPass, memBytes: m.memBytes, cpuCores: m.cpuCores });
    }
  }
  const now = Date.now();
  for (const id of Object.keys(runSeries)) {
    const s = runSeries[id];
    const running = present.has(id) && runs.find((r) => r.id === id)?.status === 'running';
    if (!running && s.finishedAt == null) s.finishedAt = now;                       // 방금 끝남 → 종료시각 기록
    if (s.finishedAt != null && now - s.finishedAt > SERIES_TTL_MS && !present.has(id)) delete runSeries[id]; // 오래된 것 정리
  }
}

// DB 구성됨: 실행 중엔 표본을 메모리(runSeries)에만 쌓고(DB 쓰기 없음), 오케스트레이터
// 기준으로 종료를 감지하면 finalize 에서 한 번에 업로드한다. DB(control.runs)가 실행
// 목록의 원천이므로 목록 조회는 DB 에서 이뤄지지만, 표본 적재는 종료 시점에만 발생한다.
async function reconcileDb() {
  let orchRuns;
  try { orchRuns = await listRunsOrch(); } catch { return; }
  const orchById = Object.fromEntries(orchRuns.map((r) => [r.id, r]));

  for (const or of orchRuns) {
    if (or.status !== 'running' || !TARGET_MAP[or.target]) continue;
    let s = runSeries[or.id];
    if (!s) {
      s = runSeries[or.id] = { id: or.id, target: or.target, profile: or.profile, startedAt: or.startedAt, finishedAt: null, samples: [] };
      // 이 실행을 처음 보는 tick 에서만(=매번 아님) DB 행 존재를 확인 — 레이스(컨트롤
      // 서버가 startRun 응답 전에 재시작 등) 대비. 정상 경로에선 startRun 이 이미 만들어둠.
      if (!(await db.getRun(or.id))) {
        await db.insertRun({ id: or.id, target: or.target, profile: or.profile, status: 'running', startedAt: or.startedAt });
      }
    }
    const m = await metricsFor(or.target);
    if (s.samples.length < SERIES_MAX_SAMPLES) {
      s.samples.push({ t: Date.now(), reqRate: m.reqRate, p95: m.p95, p99: m.p99, avg: m.avg, vus: m.vus, errRate: m.errRate, dropRate: m.dropRate, checksPass: m.checksPass, memBytes: m.memBytes, cpuCores: m.cpuCores });
    }
  }

  const dbRuns = (await db.listRuns()) || [];
  for (const dr of dbRuns) {
    if (dr.status !== 'running') continue;
    const or = orchById[dr.id];
    if (or && or.status === 'running') continue;   // 계속 진행 중
    await finalizeRun(dr.id, or || null);
  }
}

// 실행 종료 확정: 메모리에 쌓아둔 표본을 한 번에 DB 업로드 + 로그 파싱 결과/상태 저장,
// auto-cleanup 이면 컨테이너/Job 삭제. (서버 재시작 후 recoverOnBoot 로 들어온 경우엔
// runSeries 에 아무것도 없을 수 있다 — 그땐 표본 없이 로그 기반 요약만 저장된다.)
async function finalizeRun(id, orchRun) {
  const stillPresent = !!orchRun;
  const logs = stillPresent ? await runLogsLive(id, 250) : null;
  const summary = logs ? parseK6Summary(logs) : null;
  const samples = runSeries[id]?.samples || [];
  let maxReqRate = null;
  for (const d of samples) if (d.reqRate != null && (maxReqRate == null || d.reqRate > maxReqRate)) maxReqRate = d.reqRate;
  const resultJson = (summary || maxReqRate != null) ? { ...(summary || {}), ...(maxReqRate != null ? { maxReqRate } : {}) } : null;
  const status = orchRun?.status === 'failed' ? 'failed' : 'completed';
  await db.insertSamples(id, samples);
  await db.updateRun(id, {
    status,
    finishedAt: new Date().toISOString(),
    resultJson,
    logText: logs || '(서버 재시작 복구 — 컨테이너/Job 이 이미 정리되어 로그를 확보하지 못했습니다)',
  });
  delete runSeries[id];   // 이제 DB 가 원천 — 라이브 버퍼는 비운다
  if (AUTO_CLEANUP && stillPresent) {
    if (ORCH === 'k8s') await kubectl(['-n', NAMESPACE, 'delete', 'job', id, '--ignore-not-found']);
    else await run('docker', ['rm', '-f', id]);
  }
}

// 서버 부팅 시 복구: DB 상 running 인데 오케스트레이터에 없거나 이미 끝나있는 행을 finalize.
// (레코드가 컨테이너/Job 보다 오래 살아야 하므로 재시작 직후 한 번 정리한다.)
async function recoverOnBoot() {
  if (!db.isEnabled()) return;
  const dbRuns = (await db.listRuns()) || [];
  const running = dbRuns.filter((r) => r.status === 'running');
  if (!running.length) return;
  let orchRuns = [];
  try { orchRuns = await listRunsOrch(); } catch { /* noop */ }
  const orchById = Object.fromEntries(orchRuns.map((r) => [r.id, r]));
  let recovered = 0;
  for (const dr of running) {
    const or = orchById[dr.id];
    if (or && or.status === 'running') continue;   // 여전히 진행 중 — reconcile 루프가 이어받음
    await finalizeRun(dr.id, or || null);
    recovered++;
  }
  if (recovered) console.log(`[control] boot recovery: finalized ${recovered} stale running row(s)`);
}

async function seriesFor(id) {
  // 실행 중(=아직 DB 에 업로드 전)이면 라이브 버퍼가 원천 — DB 를 칠 필요가 없다.
  const live = runSeries[id];
  if (live) return live;
  if (db.isEnabled()) {
    const row = await db.getRun(id);
    const samples = await db.getSamples(id);
    if (!row) return { id, target: null, profile: null, startedAt: null, finishedAt: null, samples };
    return { id, target: row.target, profile: row.profile, startedAt: row.startedAt, finishedAt: row.finishedAt, samples };
  }
  return { id, target: null, profile: null, startedAt: null, finishedAt: null, samples: [] };
}

async function reconcileLoop() {
  await reconcile();
  setTimeout(reconcileLoop, SERIES_INTERVAL_MS);
}

// ── HTTP 라우팅 ────────────────────────────────────────────────────────
const STATIC_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf-8')); } catch { return {}; }
}

async function serveStatic(res, path) {
  const file = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  if (file.includes('..')) { res.writeHead(403); res.end('forbidden'); return; }
  try {
    const buf = await readFile(join(__dirname, 'public', file));
    res.writeHead(200, { 'Content-Type': STATIC_TYPES[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  try {
    if (path === '/api/config') {
      return sendJson(res, 200, {
        orch: ORCH,
        namespace: NAMESPACE,
        grafanaPort: grafanaPort(),
        targets: TARGETS.map((t) => ({ key: t.key, label: t.label, port: t.port, seed: t.seed, sut: t.sut })),
        profiles: PROFILES,
      });
    }
    if (path === '/api/targets') return sendJson(res, 200, { targets: await listTargets() });
    const tlogM = path.match(/^\/api\/targets\/([^/]+)\/logs$/);
    if (tlogM) {
      const logs = await targetLogs(decodeURIComponent(tlogM[1]), url.searchParams.get('tail'));
      return sendJson(res, 200, { logs });
    }
    if (path === '/api/runs' && req.method === 'GET') return sendJson(res, 200, { runs: await listRuns() });
    if (path === '/api/runs' && req.method === 'POST') {
      const r = await startRun(await readBody(req));
      return sendJson(res, r.error ? 400 : 200, r);
    }
    const stopM = path.match(/^\/api\/runs\/([^/]+)\/stop$/);
    if (stopM && req.method === 'POST') {
      const r = await stopRun(decodeURIComponent(stopM[1]));
      return sendJson(res, r.error ? 400 : 200, r);
    }
    const labelM = path.match(/^\/api\/runs\/([^/]+)\/label$/);
    if (labelM && req.method === 'POST') {
      const body = await readBody(req);
      const r = await renameRun(decodeURIComponent(labelM[1]), body.label);
      return sendJson(res, r.error ? 400 : 200, r);
    }
    const delM = path.match(/^\/api\/runs\/([^/]+)$/);
    if (delM && req.method === 'DELETE') {
      const r = await deleteRun(decodeURIComponent(delM[1]));
      return sendJson(res, r.error ? 400 : 200, r);
    }
    const seriesM = path.match(/^\/api\/runs\/([^/]+)\/series$/);
    if (seriesM) return sendJson(res, 200, await seriesFor(decodeURIComponent(seriesM[1])));
    const logM = path.match(/^\/api\/runs\/([^/]+)\/logs$/);
    if (logM) {
      const logs = await runLogs(decodeURIComponent(logM[1]), url.searchParams.get('tail'));
      return sendJson(res, 200, { logs });
    }
    const resM = path.match(/^\/api\/runs\/([^/]+)\/result$/);
    if (resM) return sendJson(res, 200, await runResult(decodeURIComponent(resM[1])));
    if (path === '/api/metrics') {
      return sendJson(res, 200, await metricsFor(url.searchParams.get('target')));
    }
    // 비교 모달: 여러 run 의 시계열을 한 번에 fetch (지표별 오버레이용)
    if (path === '/api/series') {
      const ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!ids.length) return sendJson(res, 400, { error: 'ids 파라미터가 필요합니다' });
      if (db.isEnabled()) {
        const [runRows, samplesByRun] = await Promise.all([db.listRuns(), db.getSamplesBatch(ids)]);
        const byId = Object.fromEntries((runRows || []).map((r) => [r.id, r]));
        const series = ids.map((id) => {
          const r = byId[id];
          return { id, target: r?.target ?? null, profile: r?.profile ?? null, startedAt: r?.startedAt ?? null, finishedAt: r?.finishedAt ?? null, label: r?.label ?? null, samples: samplesByRun[id] || [] };
        });
        return sendJson(res, 200, { series });
      }
      const series = await Promise.all(ids.map((id) => seriesFor(id)));
      return sendJson(res, 200, { series });
    }
    // 백업/복원(Export/Import) — 공유 Postgres 자체가 날아갈 때(k3s emptyDir 등)를 대비한 파일 백업.
    if (path === '/api/export') {
      if (!db.isEnabled()) return sendJson(res, 400, { error: 'DB 가 구성되지 않아 export 할 수 없습니다' });
      const idsParam = url.searchParams.get('ids');
      const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : null;
      const bundle = await db.exportBundle(ids);
      const body = JSON.stringify(bundle);
      const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="perf-runs-${ts}.json"`,
        'Content-Length': Buffer.byteLength(body),
      });
      return res.end(body);
    }
    if (path === '/api/import' && req.method === 'POST') {
      if (!db.isEnabled()) return sendJson(res, 400, { error: 'DB 가 구성되지 않아 import 할 수 없습니다' });
      const mode = url.searchParams.get('mode') === 'overwrite' ? 'overwrite' : 'skip';
      const bundle = await readBody(req);
      const r = await db.importBundle(bundle, mode);
      return sendJson(res, 200, r);
    }
    if (path.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });
    return await serveStatic(res, path);
  } catch (e) {
    return sendJson(res, 500, { error: String(e?.message || e) });
  }
});

await detectOrch();
db.configurePg(ORCH);
await db.initSchema();
await recoverOnBoot();
reconcileLoop();  // 실행별 시계열 캡처 + 종료 감지/DB 영속화 시작
server.listen(PORT, () => console.log(`[control] 마스터 컨트롤 서버 http://0.0.0.0:${PORT}  (orch=${ORCH}, ns=${NAMESPACE}, prom=${promUrl()}, db=${db.isEnabled() ? 'on' : 'off'})`));
