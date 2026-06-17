-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'operator', 'viewer');

-- CreateEnum
CREATE TYPE "ServerType" AS ENUM ('ubuntu', 'haos');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('ok', 'warning', 'critical', 'unknown', 'resolved');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('sent', 'failed', 'retrying');

-- CreateEnum
CREATE TYPE "SecretKind" AS ENUM ('ssh_key', 'ssh_password', 'ha_token', 'frigate_token', 'notify_telegram', 'notify_whatsapp');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" TEXT NOT NULL,
    "groupId" TEXT,
    "name" TEXT NOT NULL,
    "type" "ServerType" NOT NULL,
    "host" TEXT NOT NULL,
    "sshPort" INTEGER DEFAULT 22,
    "haPort" INTEGER DEFAULT 8123,
    "frigatePort" INTEGER DEFAULT 5000,
    "intervalSec" INTEGER NOT NULL DEFAULT 300,
    "minSeverity" "Severity" NOT NULL DEFAULT 'warning',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channels" JSONB NOT NULL DEFAULT '[]',
    "thresholds" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secrets" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "kind" "SecretKind" NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_runs" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "summary" TEXT NOT NULL,
    "metrics" JSONB,
    "stdout" TEXT,
    "stderr" TEXT,
    "exitCode" INTEGER,
    "error" TEXT,
    "durationMs" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "correlationId" TEXT NOT NULL,

    CONSTRAINT "check_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "checkType" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'retrying',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payloadRedacted" JSONB NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camera_stats" (
    "id" TEXT NOT NULL,
    "checkRunId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "cameraName" TEXT NOT NULL,
    "storageBytes" BIGINT NOT NULL DEFAULT 0,
    "pctTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bandwidthKbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cameraFps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detectionFps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasImage" BOOLEAN NOT NULL DEFAULT false,
    "lastFrameAt" TIMESTAMP(3),

    CONSTRAINT "camera_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_stats" (
    "id" TEXT NOT NULL,
    "checkRunId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "mount" TEXT NOT NULL,
    "totalBytes" BIGINT NOT NULL,
    "freeBytes" BIGINT NOT NULL,
    "usedBytes" BIGINT NOT NULL,
    "usedPct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "disk_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "server_groups_name_key" ON "server_groups"("name");

-- CreateIndex
CREATE INDEX "servers_enabled_idx" ON "servers"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "secrets_serverId_kind_key" ON "secrets"("serverId", "kind");

-- CreateIndex
CREATE INDEX "check_runs_serverId_startedAt_idx" ON "check_runs"("serverId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "check_runs_correlationId_idx" ON "check_runs"("correlationId");

-- CreateIndex
CREATE INDEX "events_serverId_status_idx" ON "events"("serverId", "status");

-- CreateIndex
CREATE INDEX "events_dedupeKey_idx" ON "events"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_eventId_idx" ON "notifications"("eventId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "camera_stats_serverId_cameraName_checkRunId_idx" ON "camera_stats"("serverId", "cameraName", "checkRunId");

-- CreateIndex
CREATE INDEX "disk_stats_serverId_mount_checkRunId_idx" ON "disk_stats"("serverId", "mount", "checkRunId");

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "server_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_runs" ADD CONSTRAINT "check_runs_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camera_stats" ADD CONSTRAINT "camera_stats_checkRunId_fkey" FOREIGN KEY ("checkRunId") REFERENCES "check_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camera_stats" ADD CONSTRAINT "camera_stats_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_stats" ADD CONSTRAINT "disk_stats_checkRunId_fkey" FOREIGN KEY ("checkRunId") REFERENCES "check_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disk_stats" ADD CONSTRAINT "disk_stats_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
