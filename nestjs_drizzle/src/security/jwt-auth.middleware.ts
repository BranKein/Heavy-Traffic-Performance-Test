import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtVerifier } from './jwt-verifier';
import { JwtVerificationException } from './jwt-verification.exception';
import { GlobalResponse } from '../common/global-response';
import { ResultCode } from '../common/result-code.enum';

const BEARER_PREFIX = 'Bearer ';

/**
 * 보호 대상 요청(/api/chat)에 대해 JWT 를 검증하는 미들웨어 (SR §4).
 * 검증 실패 시에도 HTTP 200 + 표준 응답 DTO(resultCode)를 반환한다 (SR §5).
 * 성공 시 검증된 userPk 를 req 에 저장하여 컨트롤러로 전달한다.
 * spring_mvc_jpa 의 JwtAuthenticationFilter 와 동일한 역할.
 */
@Injectable()
export class JwtAuthMiddleware implements NestMiddleware {
  constructor(private readonly jwtVerifier: JwtVerifier) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith(BEARER_PREFIX)) {
      this.writeError(res, ResultCode.TOKEN_MISSING);
      return;
    }

    try {
      const userPk = this.jwtVerifier.verifyToken(
        authorization.substring(BEARER_PREFIX.length).trim(),
      );
      (req as Request & { userPk: string }).userPk = userPk;
      next();
    } catch (e) {
      if (e instanceof JwtVerificationException) {
        this.writeError(res, e.resultCode);
        return;
      }
      throw e;
    }
  }

  private writeError(res: Response, resultCode: number): void {
    res.status(200).json(GlobalResponse.error(resultCode));
  }
}
