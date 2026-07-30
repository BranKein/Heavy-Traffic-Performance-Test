// Fake Push Server 단독 부하 테스트.
//
// 계약: POST /api/push
//   Body: { "deviceId": "<uuid>" }
//   Resp: { "resultCode": 100 | -1, "resultData": { "message", "deviceId" } }
//   특성: 응답까지 반드시 0.5초 지연, 5% 확률로 resultCode=-1 (정상 동작)
//
// 랜덤 UUID 만 만들어 호출하면 되므로 사전 시드가 필요 없다.
//
// 환경변수: BASE_URL (기본 http://localhost:9000), PROFILE/VUS/DURATION 등.

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { buildOptions } from './lib/options.js';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:9000').replace(/\/$/, '');

const pushSuccess = new Counter('push_success');
const pushFailed = new Counter('push_failed'); // 서버가 의도적으로 반환하는 5% 실패

export const options = buildOptions();

// RFC4122 v4 UUID (k6 goja 에는 crypto.randomUUID 가 없어 직접 생성)
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function () {
  const payload = JSON.stringify({ deviceId: uuidv4() });
  const res = http.post(`${BASE_URL}/api/push`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /api/push' },
  });

  let resultCode = null;
  try {
    resultCode = res.json('resultCode');
  } catch (_) {}

  // 5% 실패는 정상이므로 HTTP 200 이면 성공으로 취급, resultCode 는 카운터로만 분리
  check(res, { 'status is 200': (r) => r.status === 200 });

  if (resultCode === 100) pushSuccess.add(1);
  else if (resultCode === -1) pushFailed.add(1);
}
