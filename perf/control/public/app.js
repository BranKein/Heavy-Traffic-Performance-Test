'use strict';

const $ = (id) => document.getElementById(id);
const api = async (path, opts) => {
  const res = await fetch(path, opts);
  return res.json();
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── i18n ──────────────────────────────────────────────────────────────────
const I18N = {
  en: {
    'app.sub': 'Master panel for chat push server load testing',
    'panel.newTest': 'Start new test',
    'label.targets': 'Target server',
    'label.profile': 'Profile',
    'label.name': 'Name (optional)',
    'ph.label': 'e.g. cores=2',
    'btn.rename': 'Rename',
    'adv.summary': 'Advanced options (optional)',
    'adv.p95': 'P95 threshold (ms)',
    'adv.err': 'Error-rate threshold',
    'adv.bpMax': 'Breakpoint max VU',
    'adv.bpRps': 'Breakpoint max RPS',
    'adv.bpDur': 'Breakpoint duration',
    'ph.vus': 'Fixed VU instead of profile',
    'ph.duration': 'e.g. 2m',
    'ph.p95': 'default 30000',
    'ph.err': 'default 0.05',
    'ph.bpMax': 'default 2000',
    'ph.bpRps': 'rate: default 2000',
    'ph.bpDur': 'e.g. 30m',
    'note.adv': 'Setting VUS runs constant-vus instead of a profile. <b>breakpoint</b> = ramp VU from 0 → max VU (closed model). <b>breakpoint-rate</b> = ramp requests/sec from 0 → max RPS (open model, drives req/s directly).',
    'btn.start': '▶ Start test',
    'panel.metrics': 'Live metrics',
    'chart.reqRate': 'Requests / sec',
    'chart.lat': 'Latency (ms)',
    'chart.vus': 'Active VU',
    'chart.err': 'HTTP error rate (%)',
    'chart.drops': 'Dropped req / sec',
    'metrics.note': 'Per-run capture · updates live while running, freezes when the test ends · scroll sideways to see earlier time · X-axis = clock time. Click a run below to replay its graph.',
    'metrics.noRun': 'no run selected',
    'stat.checks': 'checks passed/sec',
    'stat.mem': 'Memory',
    'stat.cpu': 'CPU cores',
    'panel.runs': 'Run history',
    'th.id': 'Name / ID',
    'th.target': 'Target',
    'th.profile': 'Profile',
    'th.status': 'Status',
    'th.result': 'Result',
    'th.started': 'Started',
    'th.action': 'Action',
    'runs.empty': 'No tests have been run yet.',
    'btn.log': 'Logs',
    'btn.stop': 'Stop',
    'btn.delete': 'Delete',
    'btn.refresh': 'Refresh',
    'btn.close': 'Close',
    'btn.serverLog': 'Server logs',
    'modal.serverLog': 'Server logs',
    'modal.log': 'Logs',
    'log.loading': 'Loading…',
    'log.none': '(no logs)',
    'result.running': 'running…',
    'hint.targetsUp': '{up}/{total} up',
    'hint.runs': '{n} runs · {active} active',
    'msg.starting': 'Starting…',
    'msg.selectTarget': 'Select a target server.',
    'msg.targetBusy': 'This server is already under test.',
    'chip.busy': 'running',
    'msg.started': 'Started: {id}',
    'msg.failed': 'Failed: {err}',
    'msg.error': 'Error: {err}',
    'toast.stopReq': 'Stopping {id}…',
    'toast.stopped': '{id} stopped (record kept)',
    'toast.delReq': 'Deleting {id}…',
    'toast.deleted': '{id} deleted',
    'info.lang': 'Language',
    'info.stack': 'Stack',
    'info.model': 'Model',
    'info.fanout': 'Push fan-out',
    'prof.smoke': 'Quick sanity check. Ramp to 5 VU and hold ~30s (~1m total).',
    'prof.load': 'Expected steady load. Ramp to 50 VU and hold 2m (~3m total).',
    'prof.stress': 'Push beyond normal. Step up 100 → 200 → 400 VU (~4.5m total).',
    'prof.spike': 'Sudden surge. Jump 20 → 500 VU in 10s, hold 30s (~70s total).',
    'prof.breakpoint': 'Capacity limit — closed model. Linearly ramp VU 0 → max (default 2000) over the duration (default 20m) and watch where latency degrades. Never aborts on threshold breach.',
    'prof.breakpoint-rate': 'Throughput limit — open model. Ramp target req/s 0 → max (default 2000); k6 injects VU to hold the rate. If the server can’t keep up, latency spikes and iterations drop.',
    'init.fail': 'Init failed: {msg}',
    'btn.compare': 'Compare',
    'btn.exportAll': '⬇ Export all',
    'btn.export': '⬇',
    'btn.import': '⬆ Import',
    'modal.compare': 'Compare runs',
    'cmp.note': 'Overlay of selected runs per metric · X-axis = elapsed time since each run started (not clock time) · click a legend chip to toggle a run.',
    'cmp.p95': 'p95 (ms)',
    'cmp.p99': 'p99 (ms)',
    'cmp.avg': 'avg (ms)',
    'msg.selectTwo': 'Select 2 or more runs to compare.',
    'toast.exporting': 'Preparing export…',
    'toast.importing': 'Importing…',
    'toast.imported': 'Imported: {added} added, {skipped} skipped',
    'cmp.noSample': 'no sample at this point',
  },
  ko: {
    'app.sub': '채팅 푸시 서버 부하 테스트 마스터 패널',
    'panel.newTest': '새 테스트 시작',
    'label.targets': '대상 서버',
    'label.profile': '프로파일',
    'label.name': '이름 (선택)',
    'ph.label': '예: core=2',
    'btn.rename': '이름 수정',
    'adv.summary': '고급 옵션 (선택)',
    'adv.p95': 'P95 임계(ms)',
    'adv.err': '에러율 임계',
    'adv.bpMax': 'Breakpoint 최대 VU',
    'adv.bpRps': 'Breakpoint 최대 RPS',
    'adv.bpDur': 'Breakpoint 지속시간',
    'ph.vus': '프로파일 대신 고정 VU',
    'ph.duration': '예: 2m',
    'ph.p95': '기본 30000',
    'ph.err': '기본 0.05',
    'ph.bpMax': '기본 2000',
    'ph.bpRps': 'rate: 기본 2000',
    'ph.bpDur': '예: 30m',
    'note.adv': 'VUS 를 지정하면 프로파일 대신 constant-vus 로 실행됩니다. <b>breakpoint</b> = VU 를 0 → 최대 VU 로 램프(닫힌 모델). <b>breakpoint-rate</b> = 요청/초를 0 → 최대 RPS 로 램프(열린 모델, req/s 를 직접 끌어올림).',
    'btn.start': '▶ 테스트 시작',
    'panel.metrics': '실시간 지표',
    'chart.reqRate': '요청 / 초',
    'chart.lat': '지연 (ms)',
    'chart.vus': '활성 VU',
    'chart.err': 'HTTP 에러율 (%)',
    'chart.drops': '드롭 요청 / 초',
    'metrics.note': '실행(run) 단위 기록 · 진행 중에는 실시간 갱신, 테스트가 끝나면 정지 · 옆으로 스크롤하면 지난 시간 확인 · X축은 시각. 아래 실행 기록을 클릭하면 그때 그래프를 다시 봅니다.',
    'metrics.noRun': '선택된 실행 없음',
    'stat.checks': 'checks 통과/초',
    'stat.mem': '메모리',
    'stat.cpu': 'CPU 코어',
    'panel.runs': '실행 목록',
    'th.id': '이름 / ID',
    'th.target': '대상',
    'th.profile': '프로파일',
    'th.status': '상태',
    'th.result': '결과',
    'th.started': '시작',
    'th.action': '동작',
    'runs.empty': '아직 실행된 테스트가 없습니다.',
    'btn.log': '로그',
    'btn.stop': '중지',
    'btn.delete': '삭제',
    'btn.refresh': '새로고침',
    'btn.close': '닫기',
    'btn.serverLog': '서버 로그',
    'modal.serverLog': '서버 로그',
    'modal.log': '로그',
    'log.loading': '불러오는 중…',
    'log.none': '(로그 없음)',
    'result.running': '실행 중…',
    'hint.targetsUp': '{up}/{total} 기동 중',
    'hint.runs': '{n}건 · 실행 중 {active}',
    'msg.starting': '시작 중…',
    'msg.selectTarget': '대상 서버를 선택하세요.',
    'msg.targetBusy': '이 서버는 이미 테스트 중입니다.',
    'chip.busy': '실행 중',
    'msg.started': '시작됨: {id}',
    'msg.failed': '실패: {err}',
    'msg.error': '오류: {err}',
    'toast.stopReq': '{id} 중지 요청…',
    'toast.stopped': '{id} 중지됨 (레코드 유지)',
    'toast.delReq': '{id} 삭제 요청…',
    'toast.deleted': '{id} 삭제됨',
    'info.lang': '언어',
    'info.stack': '스택',
    'info.model': '처리 모델',
    'info.fanout': '푸시 fan-out',
    'prof.smoke': '빠른 정상 확인. 5 VU 까지 올려 ~30초 유지 (총 ~1분).',
    'prof.load': '예상 정상 부하. 50 VU 까지 올려 2분 유지 (총 ~3분).',
    'prof.stress': '정상 범위 초과 부하. 100 → 200 → 400 VU 단계 상승 (총 ~4.5분).',
    'prof.spike': '급격한 폭증. 10초 만에 20 → 500 VU 로 점프, 30초 유지 (총 ~70초).',
    'prof.breakpoint': '한계 탐색 — 닫힌 모델. 지정 시간(기본 20분) 동안 VU 를 0 → 최대(기본 2000)로 선형 증가시켜 성능이 꺾이는 지점을 관찰. 임계값 위반해도 중단하지 않음.',
    'prof.breakpoint-rate': '처리량 한계 — 열린 모델. 목표 req/s 를 0 → 최대(기본 2000)로 램프, k6 가 VU 를 투입해 속도를 맞춤. 서버가 못 따라오면 지연 급증·요청 드롭.',
    'init.fail': '초기화 실패: {msg}',
    'btn.compare': '비교',
    'btn.exportAll': '⬇ 전체 내보내기',
    'btn.export': '⬇',
    'btn.import': '⬆ 가져오기',
    'modal.compare': '실행 비교',
    'cmp.note': '선택한 실행들을 지표별로 겹쳐 그림 · X축 = 각 실행 시작 후 경과시간(시각 아님) · 범례 클릭으로 개별 on/off.',
    'cmp.p95': 'p95 (ms)',
    'cmp.p99': 'p99 (ms)',
    'cmp.avg': 'avg (ms)',
    'msg.selectTwo': '비교하려면 실행을 2건 이상 선택하세요.',
    'toast.exporting': '내보내기 준비 중…',
    'toast.importing': '가져오는 중…',
    'toast.imported': '가져오기 완료: 추가 {added}건, 건너뜀 {skipped}건',
    'cmp.noSample': '이 시점에 표본 없음',
  },
};
let lang = localStorage.getItem('lang') || 'en';
function t(key, vars) {
  let s = (I18N[lang] && I18N[lang][key]) ?? I18N.en[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

// 대상 서버 설명 (언어/스택은 언어 중립, model/fanout 은 언어별)
const TARGET_INFO = {
  'mvc':                   { lang: 'Java 21', stack: 'Spring MVC + JPA (Hibernate)', model: { en: 'Synchronous · blocking', ko: '동기 · 블로킹' }, fanout: { en: 'Sequential send on a single thread after commit', ko: '커밋 후 단일 스레드로 순차 전송' } },
  'mvc-parallel-virtual-thread':          { lang: 'Java 21', stack: 'Spring MVC + JPA (Hibernate)', model: { en: 'Sync request · parallel fan-out', ko: '동기 요청 · 병렬 fan-out' }, fanout: { en: 'Parallel send on virtual threads after commit', ko: '커밋 후 가상 스레드로 병렬 전송' } },
  'mvc-parallel-multi-thread': { lang: 'Java 21', stack: 'Spring MVC + JPA (Hibernate)', model: { en: 'Sync request · parallel fan-out', ko: '동기 요청 · 병렬 fan-out' }, fanout: { en: 'Parallel send on a fixed platform thread pool after commit', ko: '커밋 후 고정 플랫폼 스레드풀로 병렬 전송' } },
  'webflux':               { lang: 'Java 21', stack: 'Spring WebFlux + jOOQ (R2DBC)', model: { en: 'Asynchronous · non-blocking (reactive)', ko: '비동기 · 논블로킹(리액티브)' }, fanout: { en: 'Non-blocking send via Reactor pipeline', ko: 'Reactor 파이프라인으로 논블로킹 전송' } },
  'go':                    { lang: 'Go 1.25', stack: 'Gin + pgx', model: { en: 'Asynchronous · goroutine concurrency', ko: '비동기 · 고루틴 동시성' }, fanout: { en: 'Parallel send on goroutines after commit', ko: '커밋 후 goroutine 으로 병렬 전송' } },
  'nestjs':                { lang: 'TypeScript (Node.js)', stack: 'NestJS + Drizzle ORM', model: { en: 'Asynchronous · event loop (non-blocking)', ko: '비동기 · 이벤트 루프(논블로킹)' }, fanout: { en: 'Parallel send via async/await · Promise.all', ko: 'async/await · Promise.all 병렬 전송' } },
  'push':                  { lang: '—', stack: { en: 'Simulated push server', ko: '가상 푸시 서버' }, model: { en: 'Push downstream (not the SUT)', ko: '푸시 다운스트림 (SUT 아님)' }, fanout: { en: 'Mock server that receives pushes from other servers', ko: '다른 서버가 보내는 푸시를 받아주는 목 서버' } },
};
const tv = (v) => (v && typeof v === 'object' ? (v[lang] ?? v.en) : v);

let CONFIG = { targets: [], profiles: [] };
let selectedProfile = 'smoke';
let selectedTarget = null;

// ── 실시간 그래프 상태 ────────────────────────────────────────────────────
// 그래프는 '실행(run)' 단위. 서버가 run 별로 시계열을 캡처하고(/api/runs/:id/series),
// 프론트는 표시 중인 run 의 시계열만 그린다. 진행 중이면 실시간 갱신, 끝나면 정지.
let lastRuns = [];                    // 실행 목록 캐시
const selectedRuns = new Set();       // 비교용으로 체크된 run id
let editingRunId = null;              // 이름 인라인 편집 중인 run id(있으면 폴링 리렌더 잠깐 멈춤)
const resultCache = {};               // run id -> 파싱된 요약
const resultPending = new Set();
let viewRunId = null;                 // 그래프에 표시 중인 실행 id
const seriesCache = {};               // run id -> { samples, status, target, profile, finishedAt }
let userScrolledAway = false;         // 사용자가 그래프를 왼쪽으로 스크롤했는지(라이브 우측고정 억제)
let hoverIndex = null;                // 마우스가 가리키는 표본 index(전 차트 공통 crosshair)
const PX_PER_SAMPLE = 12;             // 표본 간 가로 픽셀(가로 스크롤 폭 결정)
const CHARTS = [
  { id: 'reqRate', titleKey: 'chart.reqRate', lines: [{ key: 'reqRate', color: '#5b8cff' }],                                    fmt: (v) => v.toFixed(1) },
  { id: 'lat',     titleKey: 'chart.lat',     lines: [{ key: 'p95', color: '#ffcc4d', name: 'p95' }, { key: 'p99', color: '#ff8f5c', name: 'p99' }, { key: 'avg', color: '#b98cff', name: 'avg' }], fmt: (v) => Math.round(v).toLocaleString() },
  { id: 'vus',     titleKey: 'chart.vus',     lines: [{ key: 'vus', color: '#3fce7c' }],                                        fmt: (v) => Math.round(v) },
  { id: 'drops',   titleKey: 'chart.drops',   lines: [{ key: 'dropRate', color: '#ff6b6b' }],                                   fmt: (v) => v.toFixed(2) },
];

// ── 초기화 ──────────────────────────────────────────────────────────────
async function init() {
  CONFIG = await api('/api/config');
  $('orch-pill').textContent = `orch: ${CONFIG.orch}`;

  const gl = $('grafana-link');
  gl.href = `${location.protocol}//${location.hostname}:${CONFIG.grafanaPort}`;

  // 지표 셀렉트
  $('m-target').innerHTML = CONFIG.targets.map((t) => `<option value="${t.key}">${t.label}</option>`).join('');

  // 프로파일 버튼 (+ 정보 아이콘)
  renderProfiles();
  $('f-profiles').addEventListener('click', (e) => {
    if (toggleInfo(e)) return;
    const b = e.target.closest('button[data-p]');
    if (!b) return;
    selectedProfile = b.dataset.p;
    $('f-profiles').querySelectorAll('button[data-p]').forEach((c) => c.classList.toggle('sel', c === b));
  });

  // 대상 서버 클릭 선택 + 정보 아이콘 토글 (그리드는 refreshTargets 가 5초마다 갱신)
  $('f-targets').addEventListener('click', (e) => {
    const tl = e.target.closest('button[data-tlog]');
    if (tl) { openTargetLogs(tl.dataset.tlog); return; }
    if (toggleInfo(e)) return;
    const b = e.target.closest('button[data-target]');
    if (!b) return;
    selectedTarget = b.dataset.target;
    $('f-targets').querySelectorAll('.tchip').forEach((c) => c.classList.toggle('sel', c === b));
    updateStartButton();
  });
  // 바깥 클릭 시 열린 정보 팝오버 모두 닫기
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tinfo')) document.querySelectorAll('.tinfo.open').forEach((x) => x.classList.remove('open'));
  });

  // 언어 스위치
  $('lang-switch').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]');
    if (b) setLang(b.dataset.lang);
  });

  $('run-form').addEventListener('submit', onStart);
  $('m-target').addEventListener('change', () => selectLatestForTarget($('m-target').value));
  window.addEventListener('resize', drawCharts);
  $('log-close').addEventListener('click', () => ($('log-modal').hidden = true));
  $('log-refresh').addEventListener('click', () => logReload && logReload());
  $('cmp-close').addEventListener('click', closeCompare);
  $('cmp-btn').addEventListener('click', openCompare);
  $('export-btn').addEventListener('click', () => exportRuns());
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', onImportFile);

  applyLang();
  buildCharts();
  drawCharts();

  tick();
  refreshTargets();
  refreshRuns();
  setInterval(tick, 1000);
  setInterval(refreshTargets, 5000);
  setInterval(refreshRuns, 3000);
  setInterval(refreshSeries, 2000);
}

function setLang(l) {
  if (l === lang) return;
  lang = l;
  localStorage.setItem('lang', l);
  applyLang();
  renderProfiles();
  buildCharts();
  drawCharts();
  refreshTargets();
  refreshRuns();
  refreshSeries();
  if (cmpSeries.length) { renderCompareLegend(); buildCompareCharts(); drawCompareCharts(); }
}

// 정보 아이콘 클릭 → 팝오버 토글(나머지는 닫음). 아이콘 클릭이면 true 반환.
function toggleInfo(e) {
  const info = e.target.closest('.tinfo');
  if (!info) return false;
  const wasOpen = info.classList.contains('open');
  document.querySelectorAll('.tinfo.open').forEach((x) => x.classList.remove('open'));
  if (!wasOpen) info.classList.add('open');
  return true;
}

function renderProfiles() {
  $('f-profiles').innerHTML = CONFIG.profiles.map((p) => `<span class="prow">
    <button type="button" data-p="${p}" class="${p === selectedProfile ? 'sel' : ''}">${p}</button>
    <span class="tinfo" tabindex="0" role="button" aria-label="${p}">
      <span class="ibadge">i</span>
      ${profilePopover(p)}
    </span>
  </span>`).join('');
}

function profilePopover(p) {
  const key = `prof.${p}`;
  const d = t(key);
  if (!d || d === key) return '';
  return `<span class="tpop prof-pop" role="tooltip">
    <span class="tpop-title">${p}</span>
    <span class="tpop-desc">${d}</span>
  </span>`;
}

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  [...$('lang-switch').children].forEach((b) => b.classList.toggle('sel', b.dataset.lang === lang));
}

function tick() {
  $('clock').textContent = new Date().toLocaleTimeString(lang === 'ko' ? 'ko-KR' : 'en-US');
}

// ── 대상 카드 ────────────────────────────────────────────────────────────
async function refreshTargets() {
  let data;
  try { data = await api('/api/targets'); } catch { return; }
  const up = data.targets.filter((t) => t.up).length;
  $('targets-hint').textContent = t('hint.targetsUp', { up, total: data.targets.length });
  if (!selectedTarget && data.targets.length) selectedTarget = data.targets[0].key;
  const busySet = runningTargets();
  $('f-targets').innerHTML = data.targets.map((t) => {
    const cls = t.up ? 'up' : t.deployed ? 'down' : 'absent';
    const sel = t.key === selectedTarget ? ' sel' : '';
    const busy = busySet.has(t.key) ? `<span class="chip-busy">${I18N[lang]['chip.busy']}</span>` : '';
    const spec = fmtSpec(t.cpuLimit, t.memLimitBytes);
    const serverLog = I18N[lang]['btn.serverLog'];
    return `<div class="trow">
      <button type="button" class="tchip${sel}${busy ? ' busy' : ''}" data-target="${t.key}">
        <span class="dot ${cls}"></span>${t.label}${busy}
      </button>
      ${spec ? `<span class="tspec">${spec}</span>` : ''}
      <button type="button" class="tlog" data-tlog="${t.key}" title="${serverLog}" aria-label="${serverLog}">≡</button>
      <span class="tinfo" tabindex="0" role="button" aria-label="${t.label}">
        <span class="ibadge">i</span>
        ${infoPopover(t.key, t.label)}
      </span>
    </div>`;
  }).join('');
}

// 컨테이너에 할당된 스펙 표시 문자열 (예: "1 vCPU · 2.0GB"). 값이 없으면 빈 문자열.
function fmtSpec(cpu, memBytes) {
  const parts = [];
  if (cpu != null) parts.push(`${Number.isInteger(cpu) ? cpu : Math.round(cpu * 100) / 100} vCPU`);
  if (memBytes != null) {
    const gb = memBytes / (1024 ** 3);
    parts.push(gb >= 1 ? `${gb.toFixed(1)}GB` : `${Math.round(memBytes / (1024 ** 2))}MB`);
  }
  return parts.join(' · ');
}

function infoPopover(key, label) {
  const i = TARGET_INFO[key];
  if (!i) return '';
  const rows = [
    ['info.lang', tv(i.lang)],
    ['info.stack', tv(i.stack)],
    ['info.model', tv(i.model)],
    ['info.fanout', tv(i.fanout)],
  ].filter(([, v]) => v);
  return `<span class="tpop" role="tooltip">
    <span class="tpop-title">${label}</span>
    ${rows.map(([k, v]) => `<span class="tpop-row"><em>${t(k)}</em><span>${v}</span></span>`).join('')}
  </span>`;
}

// 현재 running 상태인 실행이 있는 대상들의 집합
function runningTargets() {
  const s = new Set();
  for (const r of lastRuns) if (r.status === 'running') s.add(r.target);
  return s;
}

// 선택된 대상이 테스트 중이면 시작 버튼 비활성화 + 안내
function updateStartButton() {
  const btn = $('start-btn');
  if (!btn) return;
  const msg = $('run-msg');
  const busy = !!(selectedTarget && runningTargets().has(selectedTarget));
  btn.disabled = busy;
  if (busy) {
    msg.className = 'form-msg err';
    msg.textContent = t('msg.targetBusy');
    msg.dataset.state = 'busy';
  } else if (msg && msg.dataset.state === 'busy') {
    // busy 안내로 채워둔 것만 지운다(다른 메시지는 보존)
    msg.className = 'form-msg';
    msg.textContent = '';
    delete msg.dataset.state;
  }
}

// ── 테스트 시작 ──────────────────────────────────────────────────────────
async function onStart(e) {
  e.preventDefault();
  const btn = $('start-btn');
  const msg = $('run-msg');
  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = t('msg.starting');
  if (!selectedTarget) {
    msg.className = 'form-msg err';
    msg.textContent = t('msg.selectTarget');
    btn.disabled = false;
    return;
  }
  // 이미 테스트 중인 서버면 시작 거부(동시 실행 방지)
  if (runningTargets().has(selectedTarget)) {
    msg.className = 'form-msg err';
    msg.textContent = t('msg.targetBusy');
    msg.dataset.state = 'busy';
    return;
  }
  const body = {
    target: selectedTarget,
    profile: selectedProfile,
    label: $('f-label').value || undefined,
    vus: $('f-vus').value || undefined,
    duration: $('f-duration').value || undefined,
    thresholdP95: $('f-p95').value || undefined,
    thresholdErrorRate: $('f-err').value || undefined,
    breakpointMaxVus: $('f-bp-max').value || undefined,
    breakpointDuration: $('f-bp-dur').value || undefined,
    breakpointMaxRps: $('f-bp-rps').value || undefined,
  };
  try {
    const r = await api('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.error) {
      msg.className = 'form-msg err';
      msg.textContent = t('msg.failed', { err: r.error });
    } else {
      msg.className = 'form-msg ok';
      msg.textContent = t('msg.started', { id: r.id });
      $('f-label').value = '';
      // 새 실행을 그래프에 바로 물린다(= 시작 시 초기화, 이후 실시간 갱신)
      viewRunId = r.id;
      delete seriesCache[r.id];
      userScrolledAway = false;
      hoverIndex = null; hideTip();
      $('m-target').value = body.target;
      updateMetricsLabel();
      refreshRuns();
      refreshSeries();
    }
  } catch (err) {
    msg.className = 'form-msg err';
    msg.textContent = t('msg.error', { err: err.message });
  } finally {
    btn.disabled = false;
  }
}

// ── 실행 목록 ────────────────────────────────────────────────────────────
async function refreshRuns() {
  if (editingRunId) return; // 이름 수정 중엔 폴링 리렌더로 입력 중인 값이 날아가지 않게 잠깐 멈춘다
  let data;
  try { data = await api('/api/runs'); } catch { return; }
  const runs = data.runs || [];
  lastRuns = runs;
  const active = runs.filter((r) => r.status === 'running').length;
  $('runs-hint').textContent = t('hint.runs', { n: runs.length, active });
  // 목록에서 사라진(삭제된) run 은 선택도 해제
  const presentIds = new Set(runs.map((r) => r.id));
  for (const id of [...selectedRuns]) if (!presentIds.has(id)) selectedRuns.delete(id);
  // 표시 중인 실행이 없거나 사라졌으면(삭제 등) 자동 선택: 진행 중 우선, 없으면 최신
  if ((!viewRunId || !runs.some((r) => r.id === viewRunId)) && runs.length) {
    viewRunId = (runs.find((r) => r.status === 'running') || runs[0]).id;
  }
  const tb = $('runs');
  if (runs.length === 0) {
    tb.innerHTML = `<tr><td colspan="8" class="empty">${t('runs.empty')}</td></tr>`;
    viewRunId = null;
    updateMetricsLabel();
    updateCompareButton();
    return;
  }
  tb.innerHTML = runs.map((r) => {
    const when = r.startedAt ? new Date(r.startedAt).toLocaleTimeString(lang === 'ko' ? 'ko-KR' : 'en-US') : '-';
    // 실행 중이면 '중지'(부하만 멈춤, 레코드 보존), 끝났으면 '삭제'(레코드 제거)
    const action = r.status === 'running'
      ? `<button class="btn danger" data-stop="${r.id}">${t('btn.stop')}</button>`
      : `<button class="btn danger" data-del="${r.id}">${t('btn.delete')}</button>`;
    const sel = r.id === viewRunId ? ' class="sel"' : '';
    const checked = selectedRuns.has(r.id) ? ' checked' : '';
    const nameHtml = r.label
      ? `<span class="name-wrap"><span class="run-name">${escapeHtml(r.label)}</span><span class="run-id-sub">${r.id}</span></span>`
      : `<span class="name-wrap"><span class="run-name muted">${r.id}</span></span>`;
    return `<tr${sel} data-run="${r.id}">
      <td class="chk"><input type="checkbox" data-cmpsel="${r.id}"${checked} /></td>
      <td class="id" data-name-cell="${r.id}"><span class="name-row">${nameHtml}<button type="button" class="btn ghost mini rename-btn" data-rename="${r.id}" title="${t('btn.rename')}">✎</button></span></td>
      <td>${r.target}</td>
      <td>${r.profile}</td>
      <td><span class="badge ${r.status}">${r.status}</span></td>
      <td class="result" id="res-${r.id}">${resultText(r)}</td>
      <td>${when}</td>
      <td>
        <button class="btn ghost mini" data-log="${r.id}">${t('btn.log')}</button>
        <button class="btn ghost mini" data-export="${r.id}" title="${t('btn.exportAll')}">${t('btn.export')}</button>
        ${action}
      </td>
    </tr>`;
  }).join('');
  tb.querySelectorAll('[data-rename]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); startRenameEdit(b.dataset.rename); }));
  tb.querySelectorAll('[data-log]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openLogs(b.dataset.log); }));
  tb.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); exportRuns([b.dataset.export]); }));
  tb.querySelectorAll('[data-stop]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); stopRun(b.dataset.stop); }));
  tb.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); deleteRun(b.dataset.del); }));
  tb.querySelectorAll('[data-cmpsel]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = b.dataset.cmpsel;
    if (b.checked) selectedRuns.add(id); else selectedRuns.delete(id);
    updateCompareButton();
  }));
  // 행 클릭 → 그때의 그래프 다시 표시
  tb.querySelectorAll('tr[data-run]').forEach((row) => row.addEventListener('click', () => selectRun(row.dataset.run)));
  updateMetricsLabel();
  updateStartButton();
  updateCompareButton();
  // 완료/실패 실행의 최종 결과를 백그라운드로 채운다 (로그 안 열어도 표시)
  for (const r of runs) if (r.status === 'completed' || r.status === 'failed') ensureResult(r.id);
}

// ── 실행 이름(라벨) 인라인 편집 ────────────────────────────────────────────
function startRenameEdit(id) {
  const r = lastRuns.find((x) => x.id === id);
  if (!r) return;
  editingRunId = id;
  const cell = document.querySelector(`[data-name-cell="${CSS.escape(id)}"]`);
  if (!cell) { editingRunId = null; return; }
  cell.innerHTML = `<input type="text" class="rename-input" maxlength="200" value="${escapeHtml(r.label || '')}" placeholder="${t('ph.label')}" />`;
  const input = cell.querySelector('input');
  input.focus();
  input.select();
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    editingRunId = null;
    if (save) await saveRename(id, input.value);
    refreshRuns();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

async function saveRename(id, label) {
  const r = await api(`/api/runs/${encodeURIComponent(id)}/label`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }),
  });
  if (r.error) toast(t('msg.failed', { err: r.error }), 'err');
}

async function stopRun(id) {
  toast(t('toast.stopReq', { id }));
  const r = await api(`/api/runs/${encodeURIComponent(id)}/stop`, { method: 'POST' });
  toast(r.error ? t('msg.failed', { err: r.error }) : t('toast.stopped', { id }), r.error ? 'err' : 'ok');
  refreshRuns();
}

async function deleteRun(id) {
  toast(t('toast.delReq', { id }));
  const r = await api(`/api/runs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  toast(r.error ? t('msg.failed', { err: r.error }) : t('toast.deleted', { id }), r.error ? 'err' : 'ok');
  refreshRuns();
}

// ── 로그 ────────────────────────────────────────────────────────────────
// 로그 모달은 k6 실행 로그(openLogs)와 대상 서버 로그(openTargetLogs) 둘 다 재사용한다.
// 새로고침 버튼은 마지막으로 연 쪽을 그대로 다시 부른다.
let logReload = null;
async function openLogs(id) {
  logReload = () => openLogs(id);
  $('log-title').textContent = id;
  $('log-modal').hidden = false;
  $('log-body').textContent = t('log.loading');
  const r = await api(`/api/runs/${encodeURIComponent(id)}/logs?tail=400`);
  $('log-body').textContent = r.logs || t('log.none');
  $('log-body').scrollTop = $('log-body').scrollHeight;
}

// SUT 서버(대상) 자신의 애플리케이션 로그.
async function openTargetLogs(key) {
  const label = (CONFIG.targets.find((x) => x.key === key) || {}).label || key;
  logReload = () => openTargetLogs(key);
  $('log-title').textContent = `${label} — ${t('modal.serverLog')}`;
  $('log-modal').hidden = false;
  $('log-body').textContent = t('log.loading');
  const r = await api(`/api/targets/${encodeURIComponent(key)}/logs?tail=400`);
  $('log-body').textContent = r.logs || t('log.none');
  $('log-body').scrollTop = $('log-body').scrollHeight;
}

// ── 실시간 지표 ──────────────────────────────────────────────────────────
function fmtMs(v) { return v == null ? '—' : `${Math.round(v).toLocaleString()}<small>ms</small>`; }
function fmtNum(v, d = 1) { return v == null ? '—' : Number(v).toFixed(d); }
function fmtPct(v) { return v == null ? '—' : `${(v * 100).toFixed(1)}<small>%</small>`; }
function fmtMem(v) { return v == null ? '—' : `${(v / 1024 / 1024).toFixed(0)}<small>MB</small>`; }

// 표시 중인 실행의 현재 상태 조회 (목록 캐시 기준)
function statusOfRun(id) {
  const r = lastRuns.find((x) => x.id === id);
  return r ? r.status : 'completed';   // 목록에서 사라졌으면 종료된 것으로 취급
}

// 지표 패널 헤더의 실행 라벨 갱신 (id · 상태)
function updateMetricsLabel() {
  const el = $('m-runlabel');
  if (!el) return;
  if (!viewRunId) { el.textContent = t('metrics.noRun'); return; }
  el.textContent = `${viewRunId} · ${statusOfRun(viewRunId)}`;
}

// 실행 행 클릭 → 그 실행의 그래프를 표시
function selectRun(id) {
  if (!id) return;
  viewRunId = id;
  userScrolledAway = false;                 // 새로 선택 → 오른쪽(최근)부터 보이게
  hoverIndex = null; hideTip();
  const r = lastRuns.find((x) => x.id === id);
  if (r) $('m-target').value = r.target;
  updateMetricsLabel();
  refreshRuns();                            // 선택 하이라이트 반영
  refreshSeries();
}

// 대상 셀렉트 변경 → 그 대상의 최신 실행(진행 중 우선)을 표시
function selectLatestForTarget(target) {
  const cand = lastRuns.filter((r) => r.target === target);   // lastRuns 는 최신순 정렬
  const pick = cand.find((r) => r.status === 'running') || cand[0];
  viewRunId = pick ? pick.id : null;
  userScrolledAway = false;
  hoverIndex = null; hideTip();
  updateMetricsLabel();
  refreshRuns();
  refreshSeries();
}

// 표시 중인 실행의 시계열을 서버에서 받아 그래프/통계 갱신.
// 진행 중이면 매번 다시 받고(실시간), 끝났으면 한 번 받아 캐시 후 정지.
async function refreshSeries() {
  if (!viewRunId) { drawCharts(); renderStats(null); return; }
  const id = viewRunId;
  const status = statusOfRun(id);
  const cached = seriesCache[id];
  const needFetch = !cached || status === 'running' || cached.status === 'running';
  if (needFetch) {
    let raw;
    try { raw = await api(`/api/runs/${encodeURIComponent(id)}/series`); } catch { return; }
    if (viewRunId !== id) return;           // 응답 대기 중 선택이 바뀌면 버림
    // Prometheus 의 p95/p99 는 '초' 단위 → ms 로 변환
    const toMs = (v) => (v == null ? null : v * 1000);
    const samples = (raw.samples || []).map((d) => ({
      t: d.t, reqRate: d.reqRate, p95: toMs(d.p95), p99: toMs(d.p99), avg: toMs(d.avg), vus: d.vus,
      errRate: d.errRate, dropRate: d.dropRate, checksPass: d.checksPass, memBytes: d.memBytes, cpuCores: d.cpuCores,
    }));
    seriesCache[id] = { samples, status, target: raw.target, profile: raw.profile, finishedAt: raw.finishedAt };
  }
  drawCharts();
  renderStats(seriesCache[id]);
}

// 시계열이 아닌 현재값 카드(checks/메모리/CPU) — 표시 중 실행의 마지막 표본 기준
function renderStats(s) {
  const samples = s && s.samples ? s.samples : [];
  const last = samples.length ? samples[samples.length - 1] : null;
  let maxMem = null;                        // 메모리는 구간 최대치가 유의미
  for (const d of samples) if (d.memBytes != null && (maxMem == null || d.memBytes > maxMem)) maxMem = d.memBytes;
  const memAlert = maxMem != null && maxMem > 100 * 1024 * 1024;   // SR §10 목표 100MB
  const stats = [
    { label: t('stat.checks'), val: fmtNum(last ? last.checksPass : null, 1) },
    { label: t('stat.mem'), val: fmtMem(maxMem), alert: memAlert },
    { label: t('stat.cpu'), val: fmtNum(last ? last.cpuCores : null, 2) },
  ];
  $('metrics-stats').innerHTML = stats.map((c) =>
    `<div class="metric ${c.alert ? 'alert' : ''}"><div class="label">${c.label}</div><div class="val">${c.val}</div></div>`
  ).join('');
}

// ── 차트 렌더링 (canvas, 무의존, 가로 스크롤) ─────────────────────────────
function buildCharts() {
  $('charts').innerHTML = CHARTS.map((c) => `
    <div class="chart">
      <div class="chart-head"><span class="chart-title">${t(c.titleKey)}</span><span class="chart-val" id="cv-${c.id}">—</span></div>
      <div class="chart-scroll" id="cs-${c.id}"><canvas class="chart-canvas" id="cc-${c.id}"></canvas></div>
    </div>`).join('');
  // 4개 차트의 가로 스크롤을 동기화 + 사용자가 왼쪽으로 밀었는지 추적
  const scrollers = CHARTS.map((c) => $(`cs-${c.id}`)).filter(Boolean);
  let syncing = false;
  for (const s of scrollers) {
    s.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      for (const o of scrollers) if (o !== s) o.scrollLeft = s.scrollLeft;
      syncing = false;
      userScrolledAway = s.scrollWidth - s.clientWidth - s.scrollLeft > 12;
    });
  }
  // hover: 어느 차트 위든 마우스를 올리면 전 차트에 동일 index 점선(crosshair)+값, 툴팁 표시
  for (const c of CHARTS) {
    const cv = $(`cc-${c.id}`);
    if (!cv) continue;
    cv.addEventListener('mousemove', (e) => onChartHover(e, cv));
    cv.addEventListener('mouseleave', clearHover);
  }
}

// 마우스 x → 표본 index 로 환산해 hoverIndex 갱신 후 전 차트 재그림 + 툴팁
function onChartHover(e, canvas) {
  const s = seriesCache[viewRunId];
  const data = s && s.samples ? s.samples : [];
  if (!data.length) { clearHover(); return; }
  const rect = canvas.getBoundingClientRect();     // 스크롤돼도 캔버스 좌표계 기준
  const padL = 8;
  let i = Math.round((e.clientX - rect.left - padL) / PX_PER_SAMPLE);
  i = Math.max(0, Math.min(data.length - 1, i));
  hoverIndex = i;
  drawCharts();
  showTip(e, data[i]);
}

function clearHover() {
  if (hoverIndex === null) return;
  hoverIndex = null;
  hideTip();
  drawCharts();
}

// 커서 근처 고정 툴팁 — 해당 표본의 시각 + 전 지표 값
function showTip(e, d) {
  const tip = $('chart-tip');
  if (!tip) return;
  const time = new Date(d.t).toLocaleTimeString(lang === 'ko' ? 'ko-KR' : 'en-US', { hour12: false });
  const rows = [];
  for (const c of CHARTS) for (const ln of c.lines) {
    const v = d[ln.key];
    const label = ln.name ? `${t(c.titleKey)} · ${ln.name}` : t(c.titleKey);
    const vs = v == null ? '—' : c.fmt(v);
    rows.push(`<div class="tip-row"><span class="k"><span class="sw" style="background:${ln.color}"></span>${label}</span><span class="v">${vs}</span></div>`);
  }
  tip.innerHTML = `<div class="tip-time">${time}</div>${rows.join('')}`;
  tip.hidden = false;
  // 뷰포트 밖으로 안 나가게 위치 보정
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + tw > window.innerWidth - 8) x = e.clientX - tw - 14;
  if (y + th > window.innerHeight - 8) y = e.clientY - th - 14;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = Math.max(8, y) + 'px';
}

function hideTip() { const tip = $('chart-tip'); if (tip) tip.hidden = true; }

function drawCharts() {
  const s = seriesCache[viewRunId];
  const data = s && s.samples ? s.samples : [];
  const live = !!(s && s.status === 'running');
  for (const c of CHARTS) drawLineChart(c, data);
  // 진행 중 & 사용자가 왼쪽으로 밀지 않았고 hover 중이 아니면 오른쪽 끝(최근)으로 고정
  if (live && !userScrolledAway && hoverIndex === null) {
    for (const c of CHARTS) { const sc = $(`cs-${c.id}`); if (sc) sc.scrollLeft = sc.scrollWidth; }
  }
}

function drawLineChart(c, data) {
  const canvas = $(`cc-${c.id}`);
  const scroll = $(`cs-${c.id}`);
  if (!canvas || !scroll) return;
  const dpr = window.devicePixelRatio || 1;
  const n = data.length;
  const padL = 8, padR = 12, padT = 10, padB = 22;   // padB: 하단 시간축 여유
  const viewW = scroll.clientWidth || 300;
  const cssW = Math.max(viewW, padL + padR + Math.max(0, n - 1) * PX_PER_SAMPLE);
  const cssH = 116;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.floor(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const hgt = cssH - padT - padB;
  const xEnd = padL + Math.max(0, n - 1) * PX_PER_SAMPLE;

  const primary = c.lines[0];
  const cv = $(`cv-${c.id}`);
  const hi = (hoverIndex != null && hoverIndex < n) ? hoverIndex : null;   // 유효 hover index
  let headVal = null;
  if (hi != null && data[hi][primary.key] != null) headVal = data[hi][primary.key];   // hover 중이면 그 값
  else for (let i = n - 1; i >= 0; i--) { if (data[i][primary.key] != null) { headVal = data[i][primary.key]; break; } }
  cv.textContent = headVal == null ? '—' : c.fmt(headVal);

  let yMax = 0;
  for (const d of data) for (const ln of c.lines) { const v = d[ln.key]; if (v != null && v > yMax) yMax = v; }
  yMax = yMax > 0 ? yMax * 1.15 : 1;
  const X = (i) => padL + i * PX_PER_SAMPLE;
  const Y = (v) => padT + hgt - (v / yMax) * hgt;

  // baseline
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, padT + hgt); ctx.lineTo(Math.max(padL, xEnd), padT + hgt); ctx.stroke();

  // 시간축 (약 90px 간격 세로 눈금선 + 시각 라벨)
  const stepI = Math.max(1, Math.round(90 / PX_PER_SAMPLE));
  ctx.font = '10px ui-monospace, monospace'; ctx.textBaseline = 'top';
  for (let i = 0; i < n; i += stepI) {
    const x = X(i);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + hgt); ctx.stroke();
    const lbl = new Date(data[i].t).toLocaleTimeString(lang === 'ko' ? 'ko-KR' : 'en-US', { hour12: false });
    let tx = x - 24; if (tx < 2) tx = 2; if (tx + 52 > cssW) tx = cssW - 52;
    ctx.fillStyle = 'rgba(139,149,167,0.8)';
    ctx.fillText(lbl, tx, padT + hgt + 6);
  }

  // 라인들
  for (const ln of c.lines) {
    ctx.strokeStyle = ln.color; ctx.lineWidth = 1.6; ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = data[i][ln.key];
      if (v == null) { started = false; continue; }
      const x = X(i), y = Y(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 마지막 점 강조
    for (let i = n - 1; i >= 0; i--) { if (data[i][ln.key] != null) { ctx.fillStyle = ln.color; ctx.beginPath(); ctx.arc(X(i), Y(data[i][ln.key]), 2.5, 0, Math.PI * 2); ctx.fill(); break; } }
  }

  // hover crosshair — 전 차트 공통 index 에 세로 점선 + 각 라인 값 지점 강조
  if (hi != null) {
    const hx = X(hi);
    ctx.save();
    ctx.strokeStyle = 'rgba(230,234,242,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + hgt); ctx.stroke();
    ctx.restore();
    for (const ln of c.lines) {
      const v = data[hi][ln.key];
      if (v == null) continue;
      const hy = Y(v);
      ctx.fillStyle = ln.color; ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0d1017'; ctx.beginPath(); ctx.arc(hx, hy, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ── 실행 결과 (로그 안 열어도 인라인 표시) ────────────────────────────────
function fmtResult(s) {
  const parts = [];
  if (s.p95 != null) parts.push(`p95 <b>${s.p95}</b>`);
  if (s.failPct != null) parts.push(`err <b>${s.failPct}%</b>`);
  if (s.reqRate != null) parts.push(`<b>${s.reqRate.toFixed(0)}</b> r/s`);
  else if (s.reqs != null) parts.push(`<b>${s.reqs}</b> req`);
  if (s.maxReqRate != null) parts.push(`max <b>${s.maxReqRate.toFixed(0)}</b> r/s`);
  if (s.dropped) parts.push(`drop <b>${s.dropped}</b>`);
  return parts.join(' · ') || '—';
}

function resultText(r) {
  if (r.status === 'running') return `<span class="muted">${t('result.running')}</span>`;
  const s = resultCache[r.id];
  return s ? fmtResult(s) : '<span class="muted">…</span>';
}

async function ensureResult(id) {
  if (resultCache[id] || resultPending.has(id)) return;
  resultPending.add(id);
  try {
    const r = await api(`/api/runs/${encodeURIComponent(id)}/result`);
    if (r.summary) {
      resultCache[id] = r.summary;
      const cell = $(`res-${id}`);
      if (cell) cell.innerHTML = fmtResult(r.summary);
    }
  } catch { /* 다음 폴링에서 재시도 */ } finally {
    resultPending.delete(id);
  }
}

// ── Export / Import (백업·복원) ───────────────────────────────────────────
function exportRuns(ids) {
  toast(t('toast.exporting'));
  const qs = ids && ids.length ? `?ids=${ids.map(encodeURIComponent).join(',')}` : '';
  // Content-Disposition: attachment 응답이라 새 창 없이 그대로 다운로드된다.
  window.location.href = `/api/export${qs}`;
}

async function onImportFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  toast(t('toast.importing'));
  try {
    const text = await file.text();
    const res = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text });
    const r = await res.json();
    if (r.error) { toast(t('msg.failed', { err: r.error }), 'err'); return; }
    toast(t('toast.imported', { added: r.added ?? 0, skipped: r.skipped ?? 0 }), 'ok');
    refreshRuns();
  } catch (err) {
    toast(t('msg.error', { err: err.message }), 'err');
  }
}

// ── 비교 모달 (여러 run 오버레이) ──────────────────────────────────────────
const CMP_COLORS = ['#5b8cff', '#3fce7c', '#ffcc4d', '#ff6b6b', '#b98cff', '#4da3ff', '#ff8f5c', '#8b95a7'];
const COMPARE_METRICS = [
  { key: 'reqRate', titleKey: 'chart.reqRate', short: 'req/s', fmt: (v) => v.toFixed(1) },
  { key: 'p95', titleKey: 'cmp.p95', short: 'p95', fmt: (v) => Math.round(v).toLocaleString() },
  { key: 'p99', titleKey: 'cmp.p99', short: 'p99', fmt: (v) => Math.round(v).toLocaleString() },
  { key: 'avg', titleKey: 'cmp.avg', short: 'avg', fmt: (v) => Math.round(v).toLocaleString() },
  { key: 'vus', titleKey: 'chart.vus', short: 'VU', fmt: (v) => Math.round(v) },
  { key: 'dropRate', titleKey: 'chart.drops', short: 'drop', fmt: (v) => v.toFixed(2) },
];
const CMP_PX_PER_SEC = 12 / 5;   // 실시간 그래프와 동일 밀도(표본 간격 5초 = 12px)
let cmpSeries = [];              // [{ id, target, profile, startedAt, color, hidden, samples: [{elapsed,...}] }]
let cmpScale = { padL: 8, padR: 10, maxElapsedMs: 1 };   // 6개 차트가 공유하는 X축 스케일(호버 좌표 변환에도 씀)
let cmpHoverElapsedMs = null;    // 현재 호버 중인 경과시간(ms); null 이면 호버 아님

function updateCompareButton() {
  $('cmp-btn').disabled = selectedRuns.size < 2;
}

async function openCompare() {
  const ids = [...selectedRuns];
  if (ids.length < 2) { toast(t('msg.selectTwo'), 'err'); return; }
  cmpHoverElapsedMs = null;
  $('cmp-modal').hidden = false;
  $('cmp-legend').innerHTML = '';
  $('cmp-charts').innerHTML = '';
  let data;
  try { data = await api(`/api/series?ids=${ids.map(encodeURIComponent).join(',')}`); } catch (err) { toast(t('msg.error', { err: err.message }), 'err'); return; }
  const toMs = (v) => (v == null ? null : v * 1000);
  cmpSeries = (data.series || []).map((s, i) => {
    const samples = s.samples || [];
    const t0 = samples.length ? samples[0].t : (s.startedAt ? new Date(s.startedAt).getTime() : 0);
    return {
      id: s.id, target: s.target, profile: s.profile, startedAt: s.startedAt, label: s.label,
      color: CMP_COLORS[i % CMP_COLORS.length], hidden: false,
      samples: samples.map((d) => ({ elapsed: d.t - t0, reqRate: d.reqRate, p95: toMs(d.p95), p99: toMs(d.p99), avg: toMs(d.avg), vus: d.vus, dropRate: d.dropRate })),
    };
  });
  renderCompareLegend();
  buildCompareCharts();
  drawCompareCharts();
}

function closeCompare() {
  $('cmp-modal').hidden = true;
  cmpHoverElapsedMs = null;
  hideTip();
}

function renderCompareLegend() {
  const el = $('cmp-legend');
  el.innerHTML = cmpSeries.map((s) => {
    const when = s.startedAt ? new Date(s.startedAt).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US') : '-';
    const name = s.label ? escapeHtml(s.label) : s.id;
    return `<button type="button" class="cmp-chip${s.hidden ? ' off' : ''}" data-cmp="${s.id}">
      <span class="sw" style="background:${s.color}"></span>${name} · ${s.target}/${s.profile} · ${when}
    </button>`;
  }).join('');
  el.querySelectorAll('[data-cmp]').forEach((b) => b.addEventListener('click', () => {
    const s = cmpSeries.find((x) => x.id === b.dataset.cmp);
    if (!s) return;
    s.hidden = !s.hidden;
    b.classList.toggle('off', s.hidden);
    drawCompareCharts();
  }));
}

// 6개 패널 자체는 그대로 두고 안의 캔버스만 가로 스크롤(실시간 그래프와 동일 패턴).
// 캔버스 폭을 컨테이너 폭에 맞춰 강제로 다시 재는 게 아니라, 데이터 길이(경과시간)로부터
// 고정 계산하기 때문에 범례를 껐다 켜도 폭이 누적으로 늘어나지 않는다.
function buildCompareCharts() {
  $('cmp-charts').innerHTML = COMPARE_METRICS.map((c) => `
    <div class="chart cmp-chart">
      <div class="chart-head"><span class="chart-title">${t(c.titleKey)}</span></div>
      <div class="chart-scroll" id="cmpcs-${c.key}"><canvas class="cmp-canvas" id="cmpc-${c.key}"></canvas></div>
    </div>`).join('');
  // 6개 차트의 가로 스크롤을 동기화(하나 스크롤하면 전부 같이 움직임)
  const scrollers = COMPARE_METRICS.map((c) => $(`cmpcs-${c.key}`)).filter(Boolean);
  let syncing = false;
  for (const s of scrollers) {
    s.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      for (const o of scrollers) if (o !== s) o.scrollLeft = s.scrollLeft;
      syncing = false;
    });
  }
  // hover: 6개 차트 중 어디에 올려도 공통 crosshair + 툴팁(실시간 그래프와 동일 상호작용)
  for (const c of COMPARE_METRICS) {
    const cv = $(`cmpc-${c.key}`);
    if (!cv) continue;
    cv.addEventListener('mousemove', (e) => onCmpChartHover(e, cv));
    cv.addEventListener('mouseleave', clearCmpHover);
  }
}

function fmtElapsed(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// 표시 중인 run 들 중 elapsedMs 에 가장 가까운 표본을 찾는다(run 별로 시작시각이 달라
// 표본 시각이 서로 안 맞을 수 있어 run 마다 독립적으로 최근접 탐색).
function nearestCmpSample(s, elapsedMs) {
  if (!s.samples.length) return null;
  let best = s.samples[0];
  let bestDiff = Math.abs(best.elapsed - elapsedMs);
  for (const d of s.samples) {
    const diff = Math.abs(d.elapsed - elapsedMs);
    if (diff < bestDiff) { best = d; bestDiff = diff; }
  }
  return best;
}

// 6개 차트가 공유할 X축 스케일(표시 중인 run 들의 최대 경과시간)을 매번 다시 계산한다 —
// 범례 토글로 표시 대상이 바뀌면 축도 그에 맞게 다시 잡혀야 하기 때문.
function computeCmpScale() {
  const visible = cmpSeries.filter((s) => !s.hidden);
  let maxElapsedMs = 0;
  for (const s of visible) for (const d of s.samples) if (d.elapsed > maxElapsedMs) maxElapsedMs = d.elapsed;
  cmpScale = { padL: 8, padR: 10, maxElapsedMs: maxElapsedMs || 1 };
}

function drawCompareCharts() {
  computeCmpScale();
  for (const c of COMPARE_METRICS) drawCompareChart(c);
}

function drawCompareChart(c) {
  const scroll = $(`cmpcs-${c.key}`);
  const canvas = $(`cmpc-${c.key}`);
  if (!canvas || !scroll) return;
  const dpr = window.devicePixelRatio || 1;
  const { padL, padR, maxElapsedMs } = cmpScale;
  const padT = 8, padB = 18;
  const viewW = scroll.clientWidth || 300;
  // 폭은 부모 컨테이너가 아니라 데이터(경과시간) 길이로부터 계산 — 부모를 다시 재는 방식이면
  // 패딩만큼 매번 오차가 누적돼 범례를 토글할 때마다 그래프가 계속 넓어지는 버그가 났었다.
  const contentW = padL + padR + (maxElapsedMs / 1000) * CMP_PX_PER_SEC;
  const cssW = Math.max(viewW, contentW);
  const cssH = 140;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.floor(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const hgt = cssH - padT - padB;
  const visible = cmpSeries.filter((s) => !s.hidden);

  let maxVal = 0;
  for (const s of visible) for (const d of s.samples) { const v = d[c.key]; if (v != null && v > maxVal) maxVal = v; }
  maxVal = maxVal > 0 ? maxVal * 1.15 : 1;
  const X = (elapsedMs) => padL + (elapsedMs / 1000) * CMP_PX_PER_SEC;
  const Y = (v) => padT + hgt - (v / maxVal) * hgt;

  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, padT + hgt); ctx.lineTo(Math.max(padL, cssW - padR), padT + hgt); ctx.stroke();

  for (const s of visible) {
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.6; ctx.beginPath();
    let started = false;
    for (const d of s.samples) {
      const v = d[c.key];
      if (v == null) { started = false; continue; }
      const x = X(d.elapsed), y = Y(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // 시간축(약 90px 간격 눈금)
  ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = 'rgba(139,149,167,0.8)'; ctx.textBaseline = 'top';
  const stepMs = Math.max(5000, Math.round(90 / CMP_PX_PER_SEC / 5) * 5000);
  for (let ems = 0; ems <= maxElapsedMs; ems += stepMs) {
    const x = X(ems);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + hgt); ctx.stroke();
    let tx = x - 14; if (tx < 2) tx = 2; if (tx + 32 > cssW) tx = cssW - 32;
    ctx.fillText(fmtElapsed(ems), tx, padT + hgt + 4);
  }

  // hover crosshair — 전 차트 공통 경과시간에 세로 점선 + 표시 중인 run 마다 최근접 표본 강조
  if (cmpHoverElapsedMs != null) {
    const hx = X(cmpHoverElapsedMs);
    ctx.save();
    ctx.strokeStyle = 'rgba(230,234,242,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + hgt); ctx.stroke();
    ctx.restore();
    for (const s of visible) {
      const d = nearestCmpSample(s, cmpHoverElapsedMs);
      const v = d ? d[c.key] : null;
      if (v == null) continue;
      const hy = Y(v);
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0d1017'; ctx.beginPath(); ctx.arc(hx, hy, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// 마우스 x → 경과시간(ms)으로 환산해 hover 상태 갱신 후 전 차트 재그림 + 툴팁
function onCmpChartHover(e, canvas) {
  const visible = cmpSeries.filter((s) => !s.hidden);
  if (!visible.length) { clearCmpHover(); return; }
  const rect = canvas.getBoundingClientRect();   // 스크롤돼도 캔버스 좌표계 기준이라 그대로 사용 가능
  const { padL, maxElapsedMs } = cmpScale;
  let elapsedMs = ((e.clientX - rect.left - padL) / CMP_PX_PER_SEC) * 1000;
  elapsedMs = Math.max(0, Math.min(maxElapsedMs, elapsedMs));
  cmpHoverElapsedMs = elapsedMs;
  drawCompareCharts();
  showCmpTip(e);
}

function clearCmpHover() {
  if (cmpHoverElapsedMs === null) return;
  cmpHoverElapsedMs = null;
  hideTip();
  drawCompareCharts();
}

// 커서 근처 툴팁 — 표시 중인 run 마다 그 시점(최근접 표본)의 6개 지표 값을 한 줄로 요약
function showCmpTip(e) {
  const tip = $('chart-tip');
  if (!tip) return;
  const visible = cmpSeries.filter((s) => !s.hidden);
  if (!visible.length) { tip.hidden = true; return; }
  const rows = visible.map((s) => {
    const d = nearestCmpSample(s, cmpHoverElapsedMs);
    const fv = (v, fmt) => (v == null ? '—' : fmt(v));
    const line = d
      ? COMPARE_METRICS.map((c) => `${c.short} ${fv(d[c.key], c.fmt)}`).join(' · ')
      : t('cmp.noSample');
    return `<div class="tip-row"><span class="k"><span class="sw" style="background:${s.color}"></span>${s.label ? escapeHtml(s.label) : s.id}</span></div>
            <div class="tip-sub">${line}</div>`;
  }).join('');
  tip.innerHTML = `<div class="tip-time">${fmtElapsed(cmpHoverElapsedMs)}</div>${rows}`;
  tip.hidden = false;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + tw > window.innerWidth - 8) x = e.clientX - tw - 14;
  if (y + th > window.innerHeight - 8) y = e.clientY - th - 14;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = Math.max(8, y) + 'px';
}

// ── 토스트 ──────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(text, kind = '') {
  const t = $('toast');
  t.textContent = text;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3000);
}

init().catch((e) => {
  document.body.innerHTML = `<div style="padding:40px;color:#ff6b6b">${t('init.fail', { msg: e.message })}</div>`;
});
