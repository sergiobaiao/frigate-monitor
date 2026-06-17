import { z } from 'zod';

export const ChannelSchema = z.enum(['telegram', 'whatsapp']);

export const ThresholdsSchema = z
  .object({
    warnPct: z.number().min(1).max(99).optional(),
    critPct: z.number().min(1).max(99).optional(),
    minFreePct: z.number().min(1).max(99).optional(),
    emergencyPct: z.number().min(1).max(99).optional(),
    staleFrameIntervals: z.number().int().min(1).optional(),
    minRetentionDays: z.number().int().min(0).optional(),
  })
  .refine((v) => !v.warnPct || !v.critPct || v.warnPct < v.critPct, {
    message: 'warnPct must be less than critPct',
    path: ['critPct'],
  });

export const ServerCreateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['ubuntu', 'haos']),
  host: z.string().min(1).max(255),
  groupId: z.string().cuid().optional().nullable(),
  sshPort: z.number().int().min(1).max(65535).default(22),
  haPort: z.number().int().min(1).max(65535).default(8123),
  frigatePort: z.number().int().min(1).max(65535).default(5000),
  intervalSec: z.number().int().min(30).max(86400).default(300),
  minSeverity: z
    .enum(['ok', 'warning', 'critical', 'unknown', 'resolved'])
    .default('warning'),
  enabled: z.boolean().default(true),
  channels: z.array(ChannelSchema).default([]),
  thresholds: ThresholdsSchema.default({}),
  // Secrets — optional, only persisted if provided
  sshKey: z.string().optional(),
  sshPassword: z.string().optional(),
  haToken: z.string().optional(),
  frigateToken: z.string().optional(),
  // SSH host key fingerprint for MITM prevention
  sshHostFingerprint: z.string().optional(),
});

export const ServerUpdateSchema = ServerCreateSchema.partial().extend({
  id: z.string().cuid(),
});

export const ServerGroupCreateSchema = z.object({
  name: z.string().min(1).max(100),
});

export const ServerGroupUpdateSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(100),
});

export type ServerCreate = z.infer<typeof ServerCreateSchema>;
export type ServerUpdate = z.infer<typeof ServerUpdateSchema>;
export type ServerGroupCreate = z.infer<typeof ServerGroupCreateSchema>;
export type ServerGroupUpdate = z.infer<typeof ServerGroupUpdateSchema>;
