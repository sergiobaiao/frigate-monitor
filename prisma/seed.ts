/**
 * Dev seed — safe for CI; no real credentials.
 * Creates: 1 admin user (password: changeme), 1 server group, 1 ubuntu server.
 * Passwords hashed at runtime so seed file never contains plaintext. Hash is
 * done with a simple bcrypt-compatible approach — real argon2 lands in Fase 2.
 */
import 'dotenv/config';
import { PrismaClient, ServerType, Severity } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

// Placeholder hash until argon2 lands in Fase 2.
function devHash(password: string): string {
  return 'dev:sha256:' + createHash('sha256').update(password).digest('hex');
}

async function main() {
  // Idempotent — upsert so seed can run multiple times.
  const admin = await db.user.upsert({
    where: { email: 'admin@fleetwatch.local' },
    update: {},
    create: {
      email: 'admin@fleetwatch.local',
      passwordHash: devHash('changeme'),
      role: 'admin',
    },
  });

  const group = await db.serverGroup.upsert({
    where: { name: 'Exemplo' },
    update: {},
    create: { name: 'Exemplo' },
  });

  await db.server.upsert({
    where: { id: 'seed-server-001' },
    update: {},
    create: {
      id: 'seed-server-001',
      groupId: group.id,
      name: 'Servidor Exemplo (Ubuntu)',
      type: ServerType.ubuntu,
      host: '192.168.1.100',
      sshPort: 22,
      haPort: 8123,
      frigatePort: 5000,
      intervalSec: 300,
      minSeverity: Severity.warning,
      enabled: false, // disabled — no real creds
      channels: ['telegram'],
      thresholds: {
        warnPct: 75,
        critPct: 90,
        minFreePct: 15,
        emergencyPct: 95,
        staleFrameIntervals: 3,
        minRetentionDays: 1,
      },
    },
  });

  console.log(`Seed done. Admin: ${admin.email} / password: changeme`);
  console.log('NOTE: dev hash only — replace with argon2 in Fase 2.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
