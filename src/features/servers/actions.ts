'use server';

import * as net from 'net';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { withAudit } from '@/lib/audit';
import { logger } from '@/core/logger';
import {
  ServerCreateSchema,
  ServerUpdateSchema,
} from '@/features/servers/schemas';
import {
  SecretService,
  type SecretPayload,
} from '@/domain/servers/secret-service';
import type { Server, ServerGroup } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServerWithGroup = Server & { group: ServerGroup | null };

export type ConnectionTestResult =
  | { reachable: true; latencyMs: number }
  | { reachable: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSecrets(data: Record<string, unknown>): SecretPayload {
  return {
    sshKey: data['sshKey'] as string | undefined,
    sshPassword: data['sshPassword'] as string | undefined,
    haToken: data['haToken'] as string | undefined,
    frigateToken: data['frigateToken'] as string | undefined,
  };
}

async function tcpProbe(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('timeout'));
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(Date.now() - start);
    });

    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function httpProbe(url: string, timeoutMs: number): Promise<number> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { signal: controller.signal, cache: 'no-store' });
    return Date.now() - start;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// createServer
// ---------------------------------------------------------------------------

export async function createServer(
  data: unknown,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const user = await requireRole('operator');
    const parsed = ServerCreateSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? 'Invalid input',
      };
    }

    const {
      sshKey,
      sshPassword,
      haToken,
      frigateToken,
      sshHostFingerprint: _fp,
      ...fields
    } = parsed.data;

    const server = await withAudit(
      {
        action: 'server.create',
        entity: 'Server',
        entityId: (r: unknown) => (r as Server).id,
        after: (r: unknown) => r,
      },
      { actorId: user.id },
      () =>
        db.server.create({
          data: {
            name: fields.name,
            type: fields.type,
            host: fields.host,
            groupId: fields.groupId ?? null,
            sshPort: fields.sshPort,
            haPort: fields.haPort,
            frigatePort: fields.frigatePort,
            intervalSec: fields.intervalSec,
            minSeverity: fields.minSeverity,
            enabled: fields.enabled,
            channels: fields.channels,
            thresholds: fields.thresholds,
          },
        }),
    );

    await SecretService.saveSecrets(server.id, {
      sshKey,
      sshPassword,
      haToken,
      frigateToken,
    });

    return { success: true, id: server.id };
  } catch (err) {
    logger.error({ err }, 'createServer failed');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// updateServer
// ---------------------------------------------------------------------------

export async function updateServer(
  data: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await requireRole('operator');
    const parsed = ServerUpdateSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? 'Invalid input',
      };
    }

    const {
      id,
      sshKey,
      sshPassword,
      haToken,
      frigateToken,
      sshHostFingerprint: _fp,
      ...fields
    } = parsed.data;

    const before = await db.server.findUnique({ where: { id } });
    if (!before) return { success: false, error: 'Server not found' };

    await withAudit(
      {
        action: 'server.update',
        entity: 'Server',
        entityId: id,
        before,
        after: (r: unknown) => r,
      },
      { actorId: user.id },
      () => db.server.update({ where: { id }, data: fields }),
    );

    // Only save secrets that were actually provided (non-undefined)
    const secrets: SecretPayload = {};
    if (sshKey !== undefined) secrets.sshKey = sshKey;
    if (sshPassword !== undefined) secrets.sshPassword = sshPassword;
    if (haToken !== undefined) secrets.haToken = haToken;
    if (frigateToken !== undefined) secrets.frigateToken = frigateToken;
    if (Object.keys(secrets).length > 0) {
      await SecretService.saveSecrets(id, secrets);
    }

    return { success: true };
  } catch (err) {
    logger.error({ err }, 'updateServer failed');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// deleteServer
// ---------------------------------------------------------------------------

export async function deleteServer(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await requireRole('admin');

    const before = await db.server.findUnique({ where: { id } });
    if (!before) return { success: false, error: 'Server not found' };

    await withAudit(
      {
        action: 'server.delete',
        entity: 'Server',
        entityId: id,
        before,
      },
      { actorId: user.id },
      async () => {
        // Cascade handles secrets/events/checkRuns via DB FK
        await db.server.delete({ where: { id } });
      },
    );

    return { success: true };
  } catch (err) {
    logger.error({ err }, 'deleteServer failed');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// getServers
// ---------------------------------------------------------------------------

export async function getServers(): Promise<ServerWithGroup[]> {
  await requireRole('viewer');
  return db.server.findMany({
    include: { group: true },
    orderBy: { name: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// getServer
// ---------------------------------------------------------------------------

export async function getServer(id: string): Promise<ServerWithGroup | null> {
  await requireRole('viewer');
  return db.server.findUnique({
    where: { id },
    include: { group: true },
  });
}

// ---------------------------------------------------------------------------
// testConnection (T033) — lightweight TCP/HTTP probe, no SSH
// ---------------------------------------------------------------------------

export async function testConnection(
  id: string,
): Promise<ConnectionTestResult> {
  try {
    await requireRole('operator');

    const server = await db.server.findUnique({ where: { id } });
    if (!server) return { reachable: false, error: 'Server not found' };

    const haPort = server.haPort ?? 8123;
    const sshPort = server.sshPort ?? 22;
    const { host } = server;

    // Always probe HA port via HTTP
    try {
      const latencyMs = await httpProbe(`http://${host}:${haPort}/api/`, 5000);
      return { reachable: true, latencyMs };
    } catch {
      // HTTP probe failed — for ubuntu servers try TCP on sshPort
    }

    if (server.type === 'ubuntu') {
      try {
        const latencyMs = await tcpProbe(host, sshPort, 3000);
        return { reachable: true, latencyMs };
      } catch {
        // TCP also failed
      }
    }

    return { reachable: false, error: 'Connection failed' };
  } catch (err) {
    logger.error({ err }, 'testConnection failed');
    return { reachable: false, error: 'Connection failed' };
  }
}
