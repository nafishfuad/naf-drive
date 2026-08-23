-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "storage_mode" AS ENUM ('STANDARD', 'VAULT');

-- CreateEnum
CREATE TYPE "provider_type" AS ENUM ('GOOGLE_DRIVE', 'DROPBOX', 'ONEDRIVE', 'PCLOUD', 'BOX');

-- CreateEnum
CREATE TYPE "connection_status" AS ENUM ('OK', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "node_type" AS ENUM ('FILE', 'FOLDER');

-- CreateEnum
CREATE TYPE "node_status" AS ENUM ('STAGED', 'ACTIVE', 'TRASHED', 'DELETED');

-- CreateEnum
CREATE TYPE "location_status" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "upload_session_status" AS ENUM ('ACTIVE', 'COMPLETING', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supabase_user_id" UUID NOT NULL,
    "email" TEXT,
    "display_name" TEXT,
    "storage_mode" "storage_mode" NOT NULL DEFAULT 'STANDARD',
    "role" "role" NOT NULL DEFAULT 'USER',
    "wrapped_with_passphrase" BYTEA,
    "wrapped_with_phrase" BYTEA,
    "phrase_check_sha256" CHAR(64),
    "vault_initialized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider_type" "provider_type" NOT NULL,
    "display_name" TEXT NOT NULL,
    "encrypted_tokens_json" BYTEA NOT NULL,
    "remote_root_folder" TEXT,
    "cap_pct" INTEGER NOT NULL DEFAULT 100,
    "status" "connection_status" NOT NULL DEFAULT 'OK',
    "quota_total_bytes" BIGINT,
    "quota_used_bytes" BIGINT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID,
    "owner_id" UUID NOT NULL,
    "type" "node_type" NOT NULL,
    "name" TEXT NOT NULL,
    "size_bytes" BIGINT,
    "mime_type" TEXT,
    "status" "node_status" NOT NULL DEFAULT 'STAGED',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "remote_file_id" TEXT NOT NULL,
    "remote_path" TEXT,
    "size_bytes" BIGINT,
    "sha256_ciphertext" CHAR(64),
    "chunk_index" INTEGER NOT NULL DEFAULT 0,
    "status" "location_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "target_remote_folder" TEXT,
    "total_bytes" BIGINT NOT NULL,
    "chunk_size_bytes" INTEGER NOT NULL,
    "received_chunks" JSONB NOT NULL DEFAULT '[]',
    "status" "upload_session_status" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "password_hash" TEXT,
    "expires_at" TIMESTAMP(3),
    "max_downloads" INTEGER,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "meta_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_daily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "upload_bytes" BIGINT NOT NULL DEFAULT 0,
    "download_bytes" BIGINT NOT NULL DEFAULT 0,
    "api_requests" INTEGER NOT NULL DEFAULT 0,
    "storage_bytes" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_supabase_user_id_key" ON "users"("supabase_user_id");

-- CreateIndex
CREATE INDEX "provider_connections_user_id_idx" ON "provider_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_connections_user_id_provider_type_key" ON "provider_connections"("user_id", "provider_type");

-- CreateIndex
CREATE INDEX "nodes_owner_id_parent_id_status_idx" ON "nodes"("owner_id", "parent_id", "status");

-- CreateIndex
CREATE INDEX "file_locations_node_id_idx" ON "file_locations"("node_id");

-- CreateIndex
CREATE INDEX "upload_sessions_user_id_status_idx" ON "upload_sessions"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "shares_token_hash_key" ON "shares"("token_hash");

-- CreateIndex
CREATE INDEX "shares_node_id_idx" ON "shares"("node_id");

-- CreateIndex
CREATE INDEX "activity_log_user_id_created_at_idx" ON "activity_log"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_daily_user_id_date_key" ON "usage_daily"("user_id", "date");

-- AddForeignKey
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_locations" ADD CONSTRAINT "file_locations_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_locations" ADD CONSTRAINT "file_locations_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

