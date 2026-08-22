import { API_PATHS, type VaultStatusResponse } from '@naf/shared';

import { createSupabaseBrowserClient } from './supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function bearerToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, 'NOT_SIGNED_IN', 'Sign in to continue');
  return token;
}

export async function apiFetch<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${await bearerToken()}`,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    let code = 'REQUEST_FAILED';
    let message = `Request failed with ${res.status}`;
    let details: unknown;
    try {
      const parsed = (await res.json()) as { code?: string; message?: string; details?: unknown };
      code = parsed.code ?? code;
      message = parsed.message ?? message;
      details = parsed.details;
    } catch {
      // Non-JSON error body — keep defaults.
    }
    throw new ApiError(res.status, code, message, details);
  }

  return (await res.json()) as T;
}

export function getVaultStatus(): Promise<VaultStatusResponse> {
  return apiFetch<VaultStatusResponse>(API_PATHS.vaultStatus);
}
