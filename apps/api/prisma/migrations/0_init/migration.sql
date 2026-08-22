-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "StorageMode" AS ENUM ('STANDARD', 'VAULT');

-- CreateEnum
CREATE TYPE "ProviderTypeEnum" AS ENUM ('GOOGLE_DRIVE', 'DROPBOX', 'ONEDRIVE', 'PCLOUD', 'BOX');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('OK', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "NodeTypeEnum" AS ENUM ('FILE', 'FOLDER');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('STAGED', 'ACTIVE', 'TRASHED', 'DELETED');

-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "UploadSessionStatus" AS ENUM ('ACTIVE', 'COMPLETING', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supabaseUserId" UUID NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "storageMode" "StorageMode" NOT NULL DEFAULT 'STANDARD',
    "role" "Role" NOT NULL DEFAULT 'USER',
    "wrappedWithPassphrase" BYTEA,
    "wrappedWithPhrase" BYTEA,
    "phraseCheckSha256" CHAR(64),
    "vaultInitializedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "providerType" "ProviderTypeEnum" NOT NULL,
    "displayName" TEXT NOT NULL,
    "encryptedTokensJson" BYTEA NOT NULL,
    "capPct" INTEGER NOT NULL DEFAULT 100,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'OK',
    "quotaTotalBytes" BIGINT,
    "quotaUsedBytes" BIGINT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Node" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parentId" UUID,
    "ownerId" UUID NOT NULL,
    "type" "NodeTypeEnum" NOT NULL,
    "name" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "mimeType" TEXT,
    "status" "NodeStatus" NOT NULL DEFAULT 'STAGED',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileLocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nodeId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "remoteFileId" TEXT NOT NULL,
    "remotePath" TEXT,
    "sizeBytes" BIGINT,
    "sha256Ciphertext" CHAR(64),
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "status" "LocationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "nodeId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "targetRemoteFolder" TEXT,
    "totalBytes" BIGINT NOT NULL,
    "chunkSizeBytes" INTEGER NOT NULL,
    "receivedChunks" JSONB NOT NULL DEFAULT '[]',
    "status" "UploadSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Share" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nodeId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageDaily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "uploadBytes" BIGINT NOT NULL DEFAULT 0,
    "downloadBytes" BIGINT NOT NULL DEFAULT 0,
    "apiRequests" INTEGER NOT NULL DEFAULT 0,
    "storageBytes" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "UsageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseUserId_key" ON "User"("supabaseUserId");

-- CreateIndex
CREATE INDEX "ProviderConnection_userId_idx" ON "ProviderConnection"("userId");

-- CreateIndex
CREATE INDEX "Node_ownerId_parentId_status_idx" ON "Node"("ownerId", "parentId", "status");

-- CreateIndex
CREATE INDEX "FileLocation_nodeId_idx" ON "FileLocation"("nodeId");

-- CreateIndex
CREATE INDEX "UploadSession_userId_status_idx" ON "UploadSession"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Share_tokenHash_key" ON "Share"("tokenHash");

-- CreateIndex
CREATE INDEX "Share_nodeId_idx" ON "Share"("nodeId");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageDaily_userId_date_key" ON "UsageDaily"("userId", "date");

-- AddForeignKey
ALTER TABLE "ProviderConnection" ADD CONSTRAINT "ProviderConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Node"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileLocation" ADD CONSTRAINT "FileLocation_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileLocation" ADD CONSTRAINT "FileLocation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageDaily" ADD CONSTRAINT "UsageDaily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

