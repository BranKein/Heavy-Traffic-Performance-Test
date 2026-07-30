// 채팅 푸시 브로드캐스팅 서버(Awful MVC / Better WebFlux 공통) 부하 테스트.
//
// 계약: POST /api/chat
//   Header: Authorization: Bearer <RS256 JWT>
//   Body:   { "chatRoomPk": "<uuid>", "chatData": "text" }
//   Resp:   { "resultCode": 100, "resultData": { "chatPk": "<uuid>" } }
//
// 사전 준비: seed/generate.mjs 로 out/users.json 생성 + 서버에 JWT_PUBLICKEY 주입.
//
// 환경변수:
//   BASE_URL     (기본 http://localhost:8080)   테스트 대상 서버
//   USERS_FILE   (기본 ../out/users.json)         시드 데이터 경로
//   PROFILE/VUS/DURATION 등은 lib/options.js 참고

import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';
import { buildOptions } from './lib/options.js';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const USERS_FILE = __ENV.USERS_FILE || '../out/users.json';

// 시드 데이터는 모든 VU 가 공유 (메모리 절약)
const users = new SharedArray('users', function () {
  return JSON.parse(open(USERS_FILE));
});

const resultCodeSuccess = new Counter('chat_result_code_success');
const resultCodeError = new Counter('chat_result_code_error');
const broadcastLatency = new Trend('chat_broadcast_latency_ms', true);

export const options = buildOptions();

export function setup() {
  if (users.length === 0) {
    throw new Error(`시드 데이터가 비어 있습니다: ${USERS_FILE}. 먼저 seed/generate.mjs 를 실행하세요.`);
  }
  console.log(`대상=${BASE_URL}, 시드 유저=${users.length}건`);
}

export default function () {
  const row = users[Math.floor(Math.random() * users.length)];
  const payload = JSON.stringify({
    chatRoomPk: row.chatRoomPk,
    chatData: `hello-${Date.now()}`,
  });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${row.jwt}`,
    },
    tags: { name: 'POST /api/chat' },
  };

  const res = http.post(`${BASE_URL}/api/chat`, payload, params);
  broadcastLatency.add(res.timings.duration);

  let resultCode = null;
  try {
    resultCode = res.json('resultCode');
  } catch (_) {
    // JSON 파싱 실패 (서버 다운/재시작 중 등)
  }

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'resultCode is 100': () => resultCode === 100,
  });

  if (resultCode === 100) {
    resultCodeSuccess.add(1);
  } else {
    resultCodeError.add(1, { resultCode: String(resultCode) });
  }
  return ok;
}
