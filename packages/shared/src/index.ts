export * from './schemas/common.schema';
export * from './schemas/node.schema';
export * from './schemas/provider.schema';
export * from './schemas/storage-mode.schema';
export * from './schemas/vault.schema';

export const API_PATHS = {
  health: '/health',
  vaultInit: '/v1/vault/init',
  vaultStatus: '/v1/vault/status',
} as const;

export const API_PREFIX = '/v1';
