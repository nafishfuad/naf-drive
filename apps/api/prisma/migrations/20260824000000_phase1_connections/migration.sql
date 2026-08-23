-- Phase 1: per-account NAF root folder + one connection per provider per user.
ALTER TABLE "provider_connections" ADD COLUMN "remote_root_folder" TEXT;
CREATE UNIQUE INDEX "provider_connections_user_id_provider_type_key"
  ON "provider_connections"("user_id", "provider_type");
