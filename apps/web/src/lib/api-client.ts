import {
  API_PATHS,
  type ConnectionDto,
  type DownloadTicketResponse,
  type NodeDto,
  type ProviderId,
  type UploadCompleteRequest,
  type UploadInitRequest,
  type UploadInitResponse,
  type UploadStatusResponse,
  type VaultStatusResponse,
} from '@naf/shared';

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
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${await bearerToken()}`,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

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

// ── vault ────────────────────────────────────────────────────────────────
export function getVaultStatus(): Promise<VaultStatusResponse> {
  return apiFetch<VaultStatusResponse>(API_PATHS.vaultStatus);
}

// ── connections ──────────────────────────────────────────────────────────
export function listConnections(): Promise<ConnectionDto[]> {
  return apiFetch<ConnectionDto[]>(API_PATHS.connections);
}

export async function startConnect(providerId: ProviderId): Promise<void> {
  const { authUrl } = await apiFetch<{ authUrl: string }>(
    API_PATHS.connectionAuthUrl(providerId),
  );
  window.location.href = authUrl;
}

export function disconnectConnection(id: string): Promise<void> {
  return apiFetch<void>(API_PATHS.connectionById(id), { method: 'DELETE' });
}

export function setConnectionCap(id: string, capPct: number): Promise<ConnectionDto> {
  return apiFetch<ConnectionDto>(API_PATHS.connectionById(id), {
    method: 'PATCH',
    body: { capPct },
  });
}

// ── nodes ────────────────────────────────────────────────────────────────
export function listNodes(parentId: string | null): Promise<NodeDto[]> {
  const qs = parentId == null ? '' : `?parentId=${encodeURIComponent(parentId)}`;
  return apiFetch<NodeDto[]>(`${API_PATHS.nodes}${qs}`);
}

export function listTrash(): Promise<NodeDto[]> {
  return apiFetch<NodeDto[]>(`${API_PATHS.nodes}?trash=true`);
}

export function createFolder(parentId: string | null, name: string): Promise<NodeDto> {
  return apiFetch<NodeDto>(API_PATHS.nodes, { method: 'POST', body: { parentId, name } });
}

export function renameNode(id: string, name: string): Promise<NodeDto> {
  return apiFetch<NodeDto>(API_PATHS.nodeById(id), { method: 'PATCH', body: { name } });
}

export function moveNode(id: string, parentId: string | null): Promise<NodeDto> {
  return apiFetch<NodeDto>(API_PATHS.nodeById(id), { method: 'PATCH', body: { parentId } });
}

export function trashNode(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(API_PATHS.nodeTrash(id), { method: 'POST' });
}

export function restoreNode(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(API_PATHS.nodeRestore(id), { method: 'POST' });
}

export function purgeNode(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(API_PATHS.nodeById(id), { method: 'DELETE' });
}

// ── transfers ────────────────────────────────────────────────────────────
export function initUpload(dto: UploadInitRequest): Promise<UploadInitResponse> {
  return apiFetch<UploadInitResponse>(API_PATHS.uploadsInit, { method: 'POST', body: dto });
}

export function getUploadStatus(sessionId: string): Promise<UploadStatusResponse> {
  return apiFetch<UploadStatusResponse>(API_PATHS.uploadById(sessionId));
}

export function completeUpload(
  sessionId: string,
  dto: UploadCompleteRequest,
): Promise<{ nodeId: string }> {
  return apiFetch<{ nodeId: string }>(API_PATHS.uploadComplete(sessionId), {
    method: 'POST',
    body: dto,
  });
}

export function cancelUpload(sessionId: string): Promise<void> {
  return apiFetch<void>(API_PATHS.uploadById(sessionId), { method: 'DELETE' });
}

export function getDownloadTicket(nodeId: string): Promise<DownloadTicketResponse> {
  return apiFetch<DownloadTicketResponse>(API_PATHS.downloadTicket(nodeId));
}
