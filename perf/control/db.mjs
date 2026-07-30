// control 스키마 영속화 — 의존성 없이 `psql` shell-out 으로 공유 Postgres 에 접근한다.
// (docker/kubectl 을 shell-out 하는 server.mjs 의 기존 패턴과 동일)
//
// 값 치환은 psql 의 `-v name=value` + SQL 안의 `:'name'` 로 처리한다. psql 이 문자열
// 리터럴로 안전하게 이스케이프해주므로 SQL 인젝션에 안전하다(값은 항상 -v 로만 전달,
// SQL 텍스트 자체는 이 모듈이 만드는 고정 조각만 사용). NULL 은 값 자리에 트러스티드
// SQL 조각 `NULL` 을 직접 넣어 표현한다(런타임 값이 아니라 이 모듈의 분기 로직).
//
// 대량 표본 적재는 `\copy ... FROM STDIN` 스크립트를 stdin 으로 흘려보낸다(TSV, 표준
// COPY 텍스트 이스케이프).
//
// Postgres 가 없거나 접속 실패면 DB_OK=false 로 전환해 모든 함수가 조용히 no-op/빈
// 결과를 반환한다 — 컨트롤 서버 자체는 계속 동작해야 하므로(그래프/기록 영속화만 저하).

import { spawn } from 'node:child_process';

let DB_OK = false;

function run(cmd, args, { input } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => resolve({ code: -1, out, err: String(e.message || e) }));
    p.on('close', (code) => resolve({ code, out, err }));
    // psql 이 접속 실패 등으로 즉시 종료되면 stdin 이 먼저 닫혀 write() 가 EPIPE 를 낸다.
    // 이 스트림에 error 리스너가 없으면 Node 가 처리되지 않은 예외로 프로세스를 죽인다
    // (실제로 postgres max_connections 초과 상황에서 컨트롤 서버 전체가 크래시한 적 있음) —
    // 여기서 흡수하면 위 'close' 핸들러가 psql 의 실패 종료 코드로 정상적으로 resolve 한다.
    p.stdin.on('error', () => {});
    if (input != null) p.stdin.write(input);
    p.stdin.end();
  });
}

// docker(host 실행)/k8s 기본값 — 실제 배포 값은 PG* 환경변수로 덮어씀(compose/k8s manifest).
function defaultPgEnv(orch) {
  if (orch === 'k8s') return { PGHOST: 'postgres', PGPORT: '5432', PGDATABASE: 'chat_server', PGUSER: 'chat', PGPASSWORD: 'chat1234' };
  return { PGHOST: 'localhost', PGPORT: '5433', PGDATABASE: 'chat_server', PGUSER: 'chat', PGPASSWORD: 'chat1234' };
}

// process.env 에 없는 PG* 키만 기본값으로 채운다(명시적 env 가 항상 우선).
export function configurePg(orch) {
  const defaults = { ...defaultPgEnv(orch), PGCONNECT_TIMEOUT: '5' };
  for (const [k, v] of Object.entries(defaults)) if (!process.env[k]) process.env[k] = v;
}

function psql(args, opts) {
  return run('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-q', ...args], opts);
}

// `:'var'` 보간은 psql 이 stdin/스크립트로 SQL 을 읽을 때만 동작하고 `-c` 인자로는 되지
// 않는다(psql 18 확인) — 그래서 모든 쿼리를 `-c` 대신 stdin 으로 흘려보낸다.

// 읽기 전용: sql 은 반드시 단일 JSON 값(예: json_agg(...))을 selecting 하는 SELECT 문.
async function psqlQueryJson(sql, vars = {}) {
  if (!DB_OK) return null;
  const args = [];
  for (const [k, v] of Object.entries(vars)) if (v != null) args.push('-v', `${k}=${v}`);
  args.push('-t', '-A');
  const r = await psql(args, { input: sql });
  if (r.code !== 0) { console.warn('[db] query failed:', r.err.trim() || r.out.trim()); return null; }
  const text = r.out.trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { console.warn('[db] non-JSON result:', text.slice(0, 200)); return null; }
}

// 쓰기(INSERT/UPDATE/DELETE): 결과 파싱 없이 성공 여부만 반환.
async function psqlExec(sql, vars = {}) {
  if (!DB_OK) return false;
  const args = [];
  for (const [k, v] of Object.entries(vars)) if (v != null) args.push('-v', `${k}=${v}`);
  const r = await psql(args, { input: sql });
  if (r.code !== 0) { console.warn('[db] exec failed:', r.err.trim() || r.out.trim()); return false; }
  return true;
}

// `\copy` 스크립트를 stdin 으로 실행(-c 대신 stdin 스크립트 모드 — COPY 데이터를 같은 스트림에 이어붙임).
async function psqlCopyScript(script) {
  if (!DB_OK) return false;
  const r = await psql([], { input: script });
  if (r.code !== 0) { console.warn('[db] copy failed:', r.err.trim() || r.out.trim()); return false; }
  return true;
}

function tsvEscape(v) {
  if (v == null) return '\\N';
  return String(v).replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function pgArrayLiteral(arr) {
  return '{' + arr.map((s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}';
}

// 벌크 INSERT 문에 직접 박아넣는 문자열 리터럴 이스케이프(표준 conforming string, `'` 만 두 번).
// import 처럼 여러 row 를 한 statement 로 묶을 때만 사용 — 그 외엔 항상 -v/:'var' 사용.
function sqlLiteral(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

// ── 스키마 ──────────────────────────────────────────────────────────────
const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS control;
CREATE TABLE IF NOT EXISTS control.runs (
  id text PRIMARY KEY,
  target text NOT NULL,
  profile text,
  params_json jsonb,
  status text NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  exit_code int,
  result_json jsonb,
  log_text text,
  label text
);
-- 이미 떠 있던 배포에 label 컬럼을 추가(CREATE TABLE IF NOT EXISTS 는 기존 테이블엔 컬럼을 안 더해줌).
ALTER TABLE control.runs ADD COLUMN IF NOT EXISTS label text;
CREATE TABLE IF NOT EXISTS control.run_samples (
  run_id text NOT NULL REFERENCES control.runs(id) ON DELETE CASCADE,
  t bigint NOT NULL,
  req_rate double precision,
  p95 double precision,
  p99 double precision,
  avg double precision,
  vus double precision,
  err_rate double precision,
  drop_rate double precision,
  checks_pass double precision,
  mem_bytes double precision,
  cpu_cores double precision
);
CREATE INDEX IF NOT EXISTS run_samples_run_id_idx ON control.run_samples(run_id);
`;

export async function initSchema() {
  const probe = await run('psql', ['--version']);
  if (probe.code !== 0) {
    console.warn('[db] psql binary not found — persistence disabled');
    DB_OK = false;
    return false;
  }
  DB_OK = true; // psqlExec 아래서 사용하려면 먼저 true 로 둬야 함
  const ok = await psqlExec(SCHEMA_SQL);
  DB_OK = ok;
  console.log(ok ? '[db] control schema ready (persistence enabled)' : '[db] schema init failed — persistence disabled');
  return ok;
}

export function isEnabled() { return DB_OK; }

// ── runs ────────────────────────────────────────────────────────────────
export async function insertRun({ id, target, profile, paramsJson, status, startedAt, label }) {
  const vars = {
    id, target, profile: profile || '', status,
    startedAt: startedAt || new Date().toISOString(),
    paramsJson: JSON.stringify(paramsJson || {}),
  };
  const labelExpr = label ? (vars.label = label, `:'label'`) : 'NULL';
  const sql = `INSERT INTO control.runs (id, target, profile, params_json, status, started_at, label)
    VALUES (:'id', :'target', :'profile', :'paramsJson'::jsonb, :'status', :'startedAt'::timestamptz, ${labelExpr})
    ON CONFLICT (id) DO NOTHING;`;
  return psqlExec(sql, vars);
}

const PATCH_COLS = {
  status: ['status', ''],
  finishedAt: ['finished_at', '::timestamptz'],
  exitCode: ['exit_code', '::int'],
  resultJson: ['result_json', '::jsonb'],
  logText: ['log_text', ''],
  label: ['label', ''],
};

export async function updateRun(id, patch) {
  const sets = [];
  const vars = { id };
  for (const [key, [col, cast]] of Object.entries(PATCH_COLS)) {
    if (!(key in patch)) continue;
    const v = patch[key];
    if (v == null) { sets.push(`${col} = NULL`); continue; }
    vars[key] = key === 'resultJson' ? JSON.stringify(v) : String(v);
    sets.push(`${col} = :'${key}'${cast}`);
  }
  if (!sets.length) return true;
  const sql = `UPDATE control.runs SET ${sets.join(', ')} WHERE id = :'id';`;
  return psqlExec(sql, vars);
}

export async function deleteRun(id) {
  return psqlExec(`DELETE FROM control.runs WHERE id = :'id';`, { id });
}

const RUN_COLS = `id, target, profile, params_json AS "paramsJson", status,
  started_at AS "startedAt", finished_at AS "finishedAt", exit_code AS "exitCode",
  result_json AS "resultJson", log_text AS "logText", label`;

export async function listRuns() {
  const sql = `SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t."startedAt" DESC), '[]')
    FROM (SELECT ${RUN_COLS} FROM control.runs) t;`;
  const rows = await psqlQueryJson(sql);
  return rows; // null = DB 비활성/조회 실패(호출부가 폴백 처리)
}

export async function getRun(id) {
  const sql = `SELECT row_to_json(t) FROM (SELECT ${RUN_COLS} FROM control.runs WHERE id = :'id') t;`;
  return psqlQueryJson(sql, { id });
}

// ── run_samples ────────────────────────────────────────────────────────
const SAMPLE_COLS = ['run_id', 't', 'req_rate', 'p95', 'p99', 'avg', 'vus', 'err_rate', 'drop_rate', 'checks_pass', 'mem_bytes', 'cpu_cores'];

export async function insertSamples(runId, samples) {
  if (!samples || !samples.length) return true;
  const lines = samples.map((s) => [
    runId, s.t, s.reqRate, s.p95, s.p99, s.avg, s.vus, s.errRate, s.dropRate, s.checksPass, s.memBytes, s.cpuCores,
  ].map(tsvEscape).join('\t'));
  const script = `\\copy control.run_samples (${SAMPLE_COLS.join(',')}) FROM STDIN WITH (FORMAT text)\n${lines.join('\n')}\n\\.\n`;
  return psqlCopyScript(script);
}

const SAMPLE_SELECT_COLS = `run_id AS "runId", t, req_rate AS "reqRate", p95, p99, avg, vus,
  err_rate AS "errRate", drop_rate AS "dropRate", checks_pass AS "checksPass",
  mem_bytes AS "memBytes", cpu_cores AS "cpuCores"`;

// 서브쿼리 alias 는 반드시 `t`(시각 컬럼)와 겹치지 않는 이름을 써야 한다 — 겹치면
// `row_to_json(t)` 가 테이블 전체가 아니라 t 컬럼(bigint) 을 가리켜 타입 에러가 난다.
export async function getSamples(runId) {
  const sql = `SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.t), '[]')
    FROM (SELECT ${SAMPLE_SELECT_COLS} FROM control.run_samples WHERE run_id = :'runId') r;`;
  return (await psqlQueryJson(sql, { runId })) || [];
}

export async function getSamplesBatch(runIds) {
  if (!runIds.length) return {};
  const sql = `SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r."runId", r.t), '[]')
    FROM (SELECT ${SAMPLE_SELECT_COLS} FROM control.run_samples WHERE run_id = ANY(:'ids'::text[])) r;`;
  const rows = (await psqlQueryJson(sql, { ids: pgArrayLiteral(runIds) })) || [];
  const byRun = Object.fromEntries(runIds.map((id) => [id, []]));
  for (const row of rows) (byRun[row.runId] ||= []).push(row);
  return byRun;
}

// ── export / import (백업·복원) ───────────────────────────────────────────
export async function exportBundle(ids) {
  const hasIds = Array.isArray(ids) && ids.length > 0;
  const vars = hasIds ? { ids: pgArrayLiteral(ids) } : {};
  const whereRuns = hasIds ? `WHERE id = ANY(:'ids'::text[])` : '';
  const whereSamples = hasIds ? `WHERE run_id = ANY(:'ids'::text[])` : '';
  const runsSql = `SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (SELECT ${RUN_COLS} FROM control.runs ${whereRuns}) t;`;
  const samplesSql = `SELECT COALESCE(json_agg(row_to_json(r)), '[]') FROM (SELECT ${SAMPLE_SELECT_COLS} FROM control.run_samples ${whereSamples}) r;`;
  const [runs, samples] = await Promise.all([psqlQueryJson(runsSql, vars), psqlQueryJson(samplesSql, vars)]);
  return { version: 1, exportedAt: new Date().toISOString(), runs: runs || [], samples: samples || [] };
}

export async function importBundle(bundle, mode = 'skip') {
  if (!DB_OK) return { added: 0, skipped: 0, error: 'db not configured' };
  const runs = Array.isArray(bundle?.runs) ? bundle.runs : [];
  const samplesByRun = new Map();
  for (const s of Array.isArray(bundle?.samples) ? bundle.samples : []) {
    if (!samplesByRun.has(s.runId)) samplesByRun.set(s.runId, []);
    samplesByRun.get(s.runId).push(s);
  }
  let added = 0, skipped = 0;
  for (const r of runs) {
    if (!r.id) continue;
    const existing = await getRun(r.id);
    if (existing && mode !== 'overwrite') { skipped++; continue; }
    if (existing && mode === 'overwrite') {
      await psqlExec(`DELETE FROM control.run_samples WHERE run_id = :'id';`, { id: r.id });
    }
    const cols = ['id', 'target', 'profile', 'params_json', 'status', 'started_at', 'finished_at', 'exit_code', 'result_json', 'log_text', 'label'];
    const vals = [
      sqlLiteral(r.id), sqlLiteral(r.target || ''), sqlLiteral(r.profile || ''),
      r.paramsJson != null ? `${sqlLiteral(JSON.stringify(r.paramsJson))}::jsonb` : `'{}'::jsonb`,
      sqlLiteral(r.status || 'completed'), r.startedAt ? `${sqlLiteral(r.startedAt)}::timestamptz` : 'NULL',
      r.finishedAt ? `${sqlLiteral(r.finishedAt)}::timestamptz` : 'NULL',
      r.exitCode != null ? sqlLiteral(r.exitCode) : 'NULL',
      r.resultJson != null ? `${sqlLiteral(JSON.stringify(r.resultJson))}::jsonb` : 'NULL',
      r.logText != null ? sqlLiteral(r.logText) : 'NULL',
      r.label != null ? sqlLiteral(r.label) : 'NULL',
    ];
    const updateSet = cols.filter((c) => c !== 'id').map((c) => `${c}=EXCLUDED.${c}`).join(', ');
    const conflictClause = mode === 'overwrite' ? `ON CONFLICT (id) DO UPDATE SET ${updateSet}` : `ON CONFLICT (id) DO NOTHING`;
    const sql = `INSERT INTO control.runs (${cols.join(',')}) VALUES (${vals.join(',')}) ${conflictClause};`;
    const ok = await psqlExec(sql);
    if (!ok) continue;
    added++;
    const samples = samplesByRun.get(r.id);
    if (samples && samples.length) await insertSamples(r.id, samples);
  }
  return { added, skipped };
}
