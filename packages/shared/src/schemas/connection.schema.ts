import { z } from 'zod';

import type { ProviderId } from './provider.schema';

export const CONNECTION_STATUSES = ['OK', 'EXPIRED', 'ERROR'] as const;
export const connectionStatusSchema = z.enum(CONNECTION_STATUSES);

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** User-set ceiling for how much of an account NAF Drive may consume (percent). */
export const capPctSchema = z.number().int().min(1).max(100);

export const updateConnectionInputSchema = z
  .object({
    capPct: capPctSchema,
  })
  .strict();

export type UpdateConnectionInput = z.infer<typeof updateConnectionInputSchema>;

/** API-facing shape — providerType uses the kebab-case provider id ('google-drive'). */
export interface ConnectionDto {
  readonly id: string;
  readonly providerType: ProviderId;
  readonly displayName: string;
  readonly capPct: number;
  readonly status: ConnectionStatus;
  readonly quotaTotalBytes: number | null;
  readonly quotaUsedBytes: number | null;
  readonly lastSyncedAt: string | null;
  readonly createdAt: string;
}
