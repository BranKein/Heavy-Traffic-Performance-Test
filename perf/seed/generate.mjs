#!/usr/bin/env node
// 성능 테스트용 사전 데이터 생성기 (의존성 없음, Node 내장 crypto 만 사용).
//
// 생성물:
//   keys/private.pem            : 서명용 RSA-1024 개인키 (PKCS#8 PEM)
//   keys/jwt-public-key.b64     : 서버 주입용 공개키 (Base64 X.509 SPKI, 한 줄) -> JWT_PUBLICKEY 로 주입
//   out/seed.sql                : 채팅방/유저/참여/디바이스 INSERT (psql 로 로드)
//   out/users.json              : k6 채팅 테스트용 [{ jwt, chatRoomPk }] 배열
//   out/summary.json            : 생성 규모 요약
//
// 서버(JwtVerifier, jjwt 기반)와 계약:
//   - RS256, iss=PUSH_BROADCASTING, userPk=<uuid>, exp 없음(무만료)
//   - RSA 키 길이 2048 (jjwt 는 RS256 에서 2048 미만 키를 거부한다. SR 은 1024 라 했으나
//     실제 서버가 jjwt 를 쓰므로 2048 로 맞춘다.)
//
// 규모는 환경변수로 조절 (아래 CONFIG 참고).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KEYS_DIR = path.join(ROOT, 'keys');
const OUT_DIR = path.join(ROOT, 'out');

const CONFIG = {
  numRooms: intEnv('SEED_ROOMS', 10),          // 채팅방 수
  usersPerRoom: intEnv('SEED_USERS_PER_ROOM', 10), // 방당 유저 수 (푸시 fan-out 크기)
  devicesPerUser: intEnv('SEED_DEVICES_PER_USER', 1), // 유저당 디바이스 수
};

function intEnv(name, def) {
  const v = process.env[name];
  return v === undefined || v === '' ? def : parseInt(v, 10);
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signJwt(privateKey, userPk) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: 'PUSH_BROADCASTING', userPk }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(signingInput, 'ascii'), privateKey)
    .toString('base64url');
  return `${signingInput}.${signature}`;
}

// --- RSA-2048 키쌍 로드 또는 생성 (기존 키가 있으면 재사용해 서버/시드 정합 유지) ---
function loadOrCreateKeys() {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  const privPath = path.join(KEYS_DIR, 'private.pem');
  const pubPath = path.join(KEYS_DIR, 'jwt-public-key.b64');

  if (fs.existsSync(privPath) && fs.existsSync(pubPath) && !process.env.SEED_REGEN_KEYS) {
    const privateKey = crypto.createPrivateKey(fs.readFileSync(privPath));
    const publicKeyB64 = fs.readFileSync(pubPath, 'utf8').trim();
    console.log('[keys] 기존 키쌍 재사용:', privPath);
    return { privateKey, publicKeyB64 };
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicKeyB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  fs.writeFileSync(privPath, privPem);
  fs.writeFileSync(pubPath, publicKeyB64 + '\n');
  console.log('[keys] RSA-2048 키쌍 새로 생성:', privPath);
  return { privateKey, publicKeyB64 };
}

function sqlUuid(u) {
  return `'${u}'`;
}

function main() {
  const { privateKey, publicKeyB64 } = loadOrCreateKeys();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const now = new Date().toISOString();
  const roomInserts = [];
  const userInserts = [];
  const membershipInserts = [];
  const deviceInserts = [];
  const k6Rows = []; // { jwt, chatRoomPk }

  for (let r = 0; r < CONFIG.numRooms; r++) {
    const roomPk = crypto.randomUUID();
    roomInserts.push(`(${sqlUuid(roomPk)}, '${now}')`);

    for (let u = 0; u < CONFIG.usersPerRoom; u++) {
      const userPk = crypto.randomUUID();
      userInserts.push(`(${sqlUuid(userPk)}, 'user_${r}_${u}')`);
      membershipInserts.push(`(${sqlUuid(userPk)}, ${sqlUuid(roomPk)})`);

      for (let d = 0; d < CONFIG.devicesPerUser; d++) {
        const devicePk = crypto.randomUUID();
        const deviceId = crypto.randomUUID();
        deviceInserts.push(`(${sqlUuid(devicePk)}, ${sqlUuid(userPk)}, ${sqlUuid(deviceId)})`);
      }

      const jwt = signJwt(privateKey, userPk);
      k6Rows.push({ jwt, chatRoomPk: roomPk });
    }
  }

  // 스키마 DDL(seed/schema.sql)을 시드 SQL 맨 앞에 끼워 넣는다. Flyway 를 폐기했으므로
  // 시드가 스키마의 유일한 소유자다. DDL + 데이터를 한 트랜잭션으로 묶어 원자적/재실행 안전하게.
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8').trimEnd();

  const sql = [
    '-- 성능 테스트 스키마 + 시드 데이터 (generate.mjs 생성물). 재실행 안전(idempotent).',
    '-- Flyway 폐기 → 이 파일이 스키마 DDL 과 데이터를 함께 적재한다(seed-job / run-local).',
    'BEGIN;',
    '',
    '-- === 스키마 DDL (seed/schema.sql) ===',
    schemaSql,
    '',
    '-- === 시드 데이터 ===',
    'INSERT INTO chat_room (pk, create_date) VALUES',
    roomInserts.join(',\n') + ';',
    '',
    'INSERT INTO users (pk, name) VALUES',
    userInserts.join(',\n') + ';',
    '',
    'INSERT INTO user_chat_room (user_fk, chat_room_fk) VALUES',
    membershipInserts.join(',\n') + ';',
    '',
    'INSERT INTO device (pk, user_fk, device_id) VALUES',
    deviceInserts.join(',\n') + ';',
    '',
    'COMMIT;',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(OUT_DIR, 'seed.sql'), sql);
  fs.writeFileSync(path.join(OUT_DIR, 'users.json'), JSON.stringify(k6Rows));

  const summary = {
    generatedAt: now,
    config: CONFIG,
    counts: {
      rooms: roomInserts.length,
      users: userInserts.length,
      memberships: membershipInserts.length,
      devices: deviceInserts.length,
      k6Rows: k6Rows.length,
    },
    jwtPublicKeyB64: publicKeyB64,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log('[seed] 생성 완료:');
  console.log(`  방=${summary.counts.rooms}, 유저=${summary.counts.users}, 디바이스=${summary.counts.devices}`);
  console.log(`  → 방당 유저 ${CONFIG.usersPerRoom}명 = 채팅 1건당 푸시 fan-out ${CONFIG.usersPerRoom * CONFIG.devicesPerUser}회`);
  console.log(`  out/seed.sql, out/users.json, out/summary.json`);
  console.log(`  JWT_PUBLICKEY(server 주입값) = keys/jwt-public-key.b64`);
}

main();
