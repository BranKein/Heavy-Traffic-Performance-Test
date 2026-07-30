#!/usr/bin/env node
// RS256 JWT 발급기 (SR §4). 외부 의존성 없이 Node 내장 crypto 만 사용한다.
//
// 사용법:
//   node gen-token.mjs <userPk> [expiresInSeconds]
// 예:
//   node gen-token.mjs 11111111-1111-1111-1111-111111111111 3600
//
// 서명키는 같은 폴더의 jwt_private.pem (RSA-1024) 을 사용하며,
// 서버는 application.yaml 의 jwt.public-key(대응 공개키)로 검증한다.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ISSUER = 'PUSH_BROADCASTING';

const userPk = process.argv[2];
const expiresIn = Number(process.argv[3] ?? 3600);

if (!userPk) {
  console.error('usage: node gen-token.mjs <userPk> [expiresInSeconds]');
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const now = Math.floor(Date.now() / 1000);
const header = { alg: 'RS256', typ: 'JWT' };
const payload = { iss: ISSUER, userPk, iat: now, exp: now + expiresIn };

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const privateKey = readFileSync(join(here, 'jwt_private.pem'), 'utf8');
const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);

process.stdout.write(`${signingInput}.${b64url(signature)}\n`);
