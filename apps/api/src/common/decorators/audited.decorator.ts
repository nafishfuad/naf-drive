import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/** Audit interceptor placeholder — Phase 2 writes activity_log rows here. */
export interface AuditedRequest {
  userId?: string;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(tap(() => undefined));
  }
}

export const Audited = () => UseInterceptors(AuditInterceptor);
