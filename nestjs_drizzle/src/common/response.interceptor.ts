import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GlobalResponse } from './global-response';

/**
 * 컨트롤러의 정상 반환값을 표준 응답 DTO(GlobalResponse.success)로 감싸고,
 * 모든 응답의 HTTP status 를 200 으로 고정한다 (SR §5).
 * 이미 GlobalResponse 인 경우 그대로 통과시킨다.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, GlobalResponse<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<GlobalResponse<T>> {
    const res = context.switchToHttp().getResponse<Response>();
    res.status(200);
    return next.handle().pipe(
      map((data) =>
        data instanceof GlobalResponse ? data : GlobalResponse.success(data),
      ),
    );
  }
}
