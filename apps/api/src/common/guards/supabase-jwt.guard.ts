import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/env.schema';
import { UsersService } from '../../modules/users/users.service';
import type { NafUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Inject } from '@nestjs/common';

type JwksCache = ReturnType<typeof createRemoteJWKSet>;

const jwksByUrl = new Map<string, JwksCache>();

function jwksFor(url: string): JwksCache {
  const existing = jwksByUrl.get(url);
  if (existing) return existing;
  const created = createRemoteJWKSet(new URL(url));
  jwksByUrl.set(url, created);
  return created;
}

interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  nafUser?: NafUser;
}

/**
 * Verifies Supabase access tokens against the project JWKS.
 * Attaches { id: sub, email } to request.nafUser on success.
 */
@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  /** Per-process memo so repeat requests skip the provisioning query. */
  private readonly knownUsers = new Set<string>();

  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();

    const header = request.headers['authorization'];
    const token =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null;

    if (!token) {
      throw new UnauthorizedException({ code: 'MISSING_TOKEN', message: 'Missing bearer token' });
    }

    try {
      const { payload } = await jwtVerify(token, jwksFor(this.config.supabaseJwksUrl), {
        audience: 'authenticated',
        issuer: `${this.config.supabaseUrl.replace(/\/$/, '')}/auth/v1`,
      });

      if (typeof payload.sub !== 'string') {
        throw new UnauthorizedException({
          code: 'INVALID_TOKEN',
          message: 'Token missing subject',
        });
      }

      request.nafUser = {
        id: payload.sub,
        email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
      };

      // Auto-provision the local user row so FK-backed resources (connections,
      // nodes, sessions) can never reference a missing owner. Idempotent upsert,
      // memoized per process to keep the hot path at zero extra queries.
      if (!this.knownUsers.has(request.nafUser.id)) {
        await this.users.ensureUser(request.nafUser);
        this.knownUsers.add(request.nafUser.id);
      }

      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Token verification failed',
      });
    }
  }
}
