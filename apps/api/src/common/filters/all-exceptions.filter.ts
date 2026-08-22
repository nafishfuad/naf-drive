import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
  path?: string;
  timestamp: string;
}

/** RFC7807-style envelope. Never leaks stack traces or internals in production. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method?: string; url?: string }>();

    const body = this.toErrorBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method ?? '?'} ${request.url ?? '?'} → ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorBody(exception: unknown): ErrorBody {
    const base = {
      details: undefined,
      path: undefined,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const payload = typeof res === 'string' ? { message: res } : (res as Record<string, unknown>);
      return {
        ...base,
        statusCode: status,
        code: (payload['code'] as string) ?? this.codeFromStatus(status),
        message: (payload['message'] as string) ?? exception.message,
        details: payload['details'],
      };
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error',
    };
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return 'ERROR';
    }
  }
}
