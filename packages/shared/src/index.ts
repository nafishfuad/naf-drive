export * from './schemas/common.schema';
export * from './schemas/connection.schema';
export * from './schemas/node.schema';
export * from './schemas/provider.schema';
export * from './schemas/storage-mode.schema';
export * from './schemas/transfer.schema';
export * from './schemas/vault.schema';

export const API_PREFIX = '/v1';

export const API_PATHS = {
  health: '/health',
  vaultInit: '/v1/vault/init',
  vaultStatus: '/v1/vault/status',
  connections: '/v1/connections',
  connectionAuthUrl: (providerId: string) => `/v1/connections/${providerId}/auth-url`,
  connectionCallback: (providerId: string) => `/v1/connections/callback/${providerId}`,
  connectionById: (id: string) => `/v1/connections/${id}`,
  nodes: '/v1/nodes',
  nodeById: (id: string) => `/v1/nodes/${id}`,
  nodeTrash: (id: string) => `/v1/nodes/${id}/trash`,
  nodeRestore: (id: string) => `/v1/nodes/${id}/restore`,
  uploadsInit: '/v1/uploads/init',
  uploadById: (id: string) => `/v1/uploads/${id}`,
  uploadComplete: (id: string) => `/v1/uploads/${id}/complete`,
  downloadTicket: (nodeId: string) => `/v1/downloads/${nodeId}`,
} as const;
