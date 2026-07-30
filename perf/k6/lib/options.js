// k6 공통 옵션 빌더. 환경변수로 부하 프로파일을 조절한다.
//
//   PROFILE=smoke|load|stress|spike (기본 smoke)
//   VUS, DURATION 로 개별 override 가능 (constant-vus 모드로 강제)
//   THRESHOLD_P95 (ms), THRESHOLD_ERROR_RATE (0~1)
//
// 참고: Awful(동기) 서버는 채팅 1건당 (방 유저수 × 0.5초)가 걸리므로
// p95 임계값을 서버/시드 규모에 맞게 넉넉히 잡는다.

function int(name, def) {
  const v = __ENV[name];
  return v === undefined || v === '' ? def : parseInt(v, 10);
}
function str(name, def) {
  const v = __ENV[name];
  return v === undefined || v === '' ? def : v;
}
function num(name, def) {
  const v = __ENV[name];
  return v === undefined || v === '' ? def : parseFloat(v);
}

const PROFILES = {
  smoke: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '15s', target: 5 },
      { duration: '30s', target: 5 },
      { duration: '15s', target: 0 },
    ],
  },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 50 },
      { duration: '2m', target: 50 },
      { duration: '30s', target: 0 },
    ],
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 100 },
      { duration: '1m', target: 200 },
      { duration: '2m', target: 400 },
      { duration: '1m', target: 0 },
    ],
  },
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: 20 },
      { duration: '10s', target: 500 },
      { duration: '30s', target: 500 },
      { duration: '10s', target: 20 },
      { duration: '10s', target: 0 },
    ],
  },
  // breakpoint(한계 탐색): 0 → 아주 큰 VU 로 '계속' 선형 증가시키며 성능 저하 지점을 관찰.
  //   BREAKPOINT_MAX_VUS (기본 2000)      최종 목표 VU. 크게 줄수록 더 높은 한계까지 밀어붙임.
  //   BREAKPOINT_DURATION (기본 20m)      0→MAX 까지 걸리는 시간(길수록 완만하게 증가).
  // 임계값 위반해도 테스트는 계속되며(중단 안 함), Grafana/실시간 지표로 꺾이는 지점을 본다.
  breakpoint: {
    executor: 'ramping-vus',
    startVUs: 0,
    gracefulRampDown: '0s',
    stages: [
      { duration: str('BREAKPOINT_DURATION', '20m'), target: int('BREAKPOINT_MAX_VUS', 2000) },
    ],
  },
  // breakpoint-rate(처리량 한계 탐색, 열린 모델): 목표 '요청/초' 자체를 0 → 아주 크게 램프업.
  //   BREAKPOINT_MAX_RPS (기본 2000)     최종 목표 req/s. k6 가 이 속도로 새 요청을 계속 발사.
  //   BREAKPOINT_DURATION (기본 20m)     0→MAX rps 까지 걸리는 시간.
  //   BREAKPOINT_MAX_VUS (기본 2000)     목표 rps 를 내기 위해 투입 가능한 VU 상한(응답 느릴수록 많이 필요).
  // 서버가 목표 rps 를 못 따라오면 http_req_duration 급증 + dropped_iterations 증가로 한계가 드러난다.
  'breakpoint-rate': {
    executor: 'ramping-arrival-rate',
    startRate: 0,
    timeUnit: '1s',
    preAllocatedVUs: int('BREAKPOINT_PREALLOC_VUS', 50),
    maxVUs: int('BREAKPOINT_MAX_VUS', 2000),
    stages: [
      { duration: str('BREAKPOINT_DURATION', '20m'), target: int('BREAKPOINT_MAX_RPS', 2000) },
    ],
  },
};

export function buildOptions() {
  const profileName = str('PROFILE', 'smoke');
  let scenario = PROFILES[profileName] || PROFILES.smoke;

  // VUS/DURATION 이 주어지면 constant-vus 로 강제 override
  const vus = int('VUS', 0);
  if (vus > 0) {
    scenario = {
      executor: 'constant-vus',
      vus,
      duration: str('DURATION', '1m'),
    };
  }

  return {
    scenarios: { main: scenario },
    thresholds: {
      // 성공 응답 비율 (resultCode 검증 결과)
      checks: [`rate>${1 - num('THRESHOLD_ERROR_RATE', 0.05)}`],
      http_req_failed: [`rate<${num('THRESHOLD_HTTP_FAIL', 0.05)}`],
      http_req_duration: [`p(95)<${int('THRESHOLD_P95', 30000)}`],
    },
    // 태그: Prometheus/Grafana 에서 시나리오/타깃 구분용
    tags: {
      target: str('TARGET_NAME', profileName),
    },
  };
}
