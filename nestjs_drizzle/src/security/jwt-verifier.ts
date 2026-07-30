import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, verify, KeyObject } from 'crypto';
import { JwtVerificationException } from './jwt-verification.exception';
import { ResultCode } from '../common/result-code.enum';

const EXPECTED_ALGORITHM = 'RS256';
const EXPECTED_ISSUER = 'PUSH_BROADCASTING';
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RS256 JWT 를 JDK/외부 라이브러리 없이 Node 내장 crypto 로 직접 검증한다 (SR §4).
 * 서명은 properties(env)로 주입된 RSA(2048) Public Key 로 검증하며,
 * 실패 원인별로 resultCode 를 담은 JwtVerificationException 을 던진다.
 * spring_mvc_jpa 의 JwtVerifier 와 동일한 역할.
 */
@Injectable()
export class JwtVerifier implements OnModuleInit {
  private publicKey!: KeyObject;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const raw = this.config.getOrThrow<string>('JWT_PUBLIC_KEY');
    // PEM 헤더/공백 제거 후 Base64 X.509(SPKI) DER 로 키를 구성 (SR §4)
    const sanitized = raw
      .replace(/-----BEGIN[^-]*-----/g, '')
      .replace(/-----END[^-]*-----/g, '')
      .replace(/\s/g, '');
    try {
      this.publicKey = createPublicKey({
        key: Buffer.from(sanitized, 'base64'),
        format: 'der',
        type: 'spki',
      });
    } catch (e) {
      throw new Error("Invalid RSA public key in 'JWT_PUBLIC_KEY' env");
    }
  }

  /** 검증 성공 시 userPk(UUID 문자열)를 반환한다. */
  verifyToken(token: string): string {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new JwtVerificationException(ResultCode.TOKEN_MALFORMED);
    }
    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const header = this.decodeJson(encodedHeader);
    if (header.alg !== EXPECTED_ALGORITHM) {
      throw new JwtVerificationException(ResultCode.TOKEN_INVALID_ALGORITHM);
    }

    const payload = this.decodeJson(encodedPayload);

    // 서명 검증 (RS256 = RSASSA-PKCS1-v1_5 + SHA-256)
    let signatureValid: boolean;
    try {
      signatureValid = verify(
        'RSA-SHA256',
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        this.publicKey,
        Buffer.from(encodedSignature, 'base64url'),
      );
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) {
      throw new JwtVerificationException(ResultCode.TOKEN_INVALID_SIGNATURE);
    }

    // 만료 확인 (exp, 초 단위 epoch)
    if (typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000) {
      throw new JwtVerificationException(ResultCode.TOKEN_EXPIRED);
    }

    // issuer 확인 (SR §4)
    if (payload.iss !== EXPECTED_ISSUER) {
      throw new JwtVerificationException(ResultCode.TOKEN_INVALID_ISSUER);
    }

    // userPk 확인 (SR §4)
    const userPk = payload.userPk;
    if (typeof userPk !== 'string' || !UUID_REGEX.test(userPk)) {
      throw new JwtVerificationException(ResultCode.TOKEN_MALFORMED);
    }
    return userPk;
  }

  private decodeJson(segment: string): Record<string, unknown> {
    try {
      const json = Buffer.from(segment, 'base64url').toString('utf-8');
      const parsed: unknown = JSON.parse(json);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('not an object');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new JwtVerificationException(ResultCode.TOKEN_MALFORMED);
    }
  }
}
