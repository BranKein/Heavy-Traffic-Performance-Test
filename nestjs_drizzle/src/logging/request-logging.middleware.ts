import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ApiLogService } from './api-log.service';

/**
 * 들어오는 모든 요청(GET 제외)에 대해 request 로그를 남긴다 (SR §8).
 * - 기록 항목: HTTP method, URI, 요청 시각, 요청 IP, request body
 * - Authorization 등 헤더는 기록하지 않는다.
 * - 응답 완료(finish) 시점에 기록하되, 로깅 실패는 요청 처리에 영향을 주지 않는다.
 * spring_mvc_jpa 의 RequestLoggingFilter 와 동일한 역할.
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private readonly apiLogService: ApiLogService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // GET 요청은 로깅 대상에서 제외 (SR §8)
    if (req.method === 'GET') {
      next();
      return;
    }

    const requestTime = new Date();
    const method = req.method;
    const uri = req.originalUrl;
    const ip = this.resolveClientIp(req);
    const body = this.extractBody(req);

    res.on('finish', () => {
      // fire-and-forget: 저장 실패해도 요청 흐름과 무관 (SR §8)
      void this.apiLogService.record(method, uri, requestTime, ip, body);
    });

    next();
  }

  private extractBody(req: Request): string | null {
    const body = req.body as unknown;
    if (body === undefined || body === null) {
      return null;
    }
    if (typeof body === 'string') {
      return body.length === 0 ? null : body;
    }
    if (Buffer.isBuffer(body)) {
      return body.length === 0 ? null : body.toString('utf-8');
    }
    if (typeof body === 'object' && Object.keys(body).length === 0) {
      return null;
    }
    try {
      return JSON.stringify(body);
    } catch {
      return null;
    }
  }

  private resolveClientIp(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip ?? req.socket.remoteAddress ?? null;
  }
}
