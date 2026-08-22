import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface NafUser {
  id: string;
  email?: string;
}

/** Shape attached by SupabaseJwtGuard; controllers read via this decorator. */
interface AuthedRequest {
  nafUser?: NafUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): NafUser => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    return request.nafUser as NafUser;
  },
);
