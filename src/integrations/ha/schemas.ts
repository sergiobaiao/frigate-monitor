import { z } from 'zod';

export const HaApiStatusSchema = z.object({ message: z.string() });

export const HaMountSchema = z.object({
  name: z.string(),
  type: z.enum(['cifs', 'nfs']),
  state: z.enum(['active', 'failed', 'unknown']),
  path: z.string().optional(),
  server: z.string().optional(),
  share: z.string().optional(),
  usage: z
    .object({
      total: z.number(),
      used: z.number(),
      free: z.number(),
    })
    .optional(),
});

export const HaMountsResponseSchema = z.object({
  mounts: z.array(HaMountSchema),
});

export const HaHostInfoSchema = z
  .object({
    hostname: z.string(),
    operating_system: z.string().optional(),
    kernel: z.string().optional(),
    disk_total: z.number().optional(),
    disk_used: z.number().optional(),
    disk_free: z.number().optional(),
  })
  .passthrough();

export const HaAddonInfoSchema = z
  .object({
    name: z.string(),
    slug: z.string(),
    state: z.enum(['started', 'stopped', 'unknown']),
    version: z.string().optional(),
    version_latest: z.string().optional(),
    update_available: z.boolean().optional(),
  })
  .passthrough();

export type HaMount = z.infer<typeof HaMountSchema>;
export type HaHostInfo = z.infer<typeof HaHostInfoSchema>;
export type HaAddonInfo = z.infer<typeof HaAddonInfoSchema>;
