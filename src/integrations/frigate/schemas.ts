import { z } from 'zod';

// GET /api/version → { version: string }
export const FrigateVersionSchema = z.object({ version: z.string() });

// GET /api/stats — core fields we care about
export const FrigateCameraStatsSchema = z.object({
  camera_fps: z.number(),
  process_fps: z.number(),
  skipped_fps: z.number(),
  detection_fps: z.number(),
  pid: z.number().optional(),
  capture_pid: z.number().optional(),
});

export const FrigateDetectorStatsSchema = z.object({
  inference_speed: z.number(),
  detection_start: z.number(),
  pid: z.number().optional(),
});

export const FrigateServiceStatsSchema = z.object({
  uptime: z.number(),
  version: z.string(),
  latest_version: z.string().optional(),
  storage: z
    .record(
      z.object({
        total: z.number(),
        used: z.number(),
        free: z.number(),
        mount_type: z.string().optional(),
      }),
    )
    .optional(),
});

export const FrigateStatsSchema = z
  .object({
    detectors: z.record(FrigateDetectorStatsSchema),
    // cameras: dynamic key per camera name
    service: FrigateServiceStatsSchema,
    // Any extra camera keys are captured via passthrough — use .catchall for cameras
  })
  .catchall(z.unknown());

// Parsed cameras extracted from stats (separate from schema)
export type FrigateStats = z.infer<typeof FrigateStatsSchema>;
export type FrigateVersion = z.infer<typeof FrigateVersionSchema>;
export type FrigateCameraStats = z.infer<typeof FrigateCameraStatsSchema>;

// GET /api/config — minimal (we only use camera list + retention)
export const FrigateConfigCameraSchema = z.object({
  enabled: z.boolean().default(true),
  record: z
    .object({
      enabled: z.boolean().default(false),
      retain: z.object({ days: z.number().default(0) }).optional(),
    })
    .optional(),
});

export const FrigateConfigSchema = z
  .object({
    cameras: z.record(FrigateConfigCameraSchema),
    record: z
      .object({
        enabled: z.boolean().default(false),
        retain: z.object({ days: z.number().default(0) }).optional(),
      })
      .optional(),
  })
  .passthrough();
