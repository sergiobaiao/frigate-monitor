import { z } from 'zod';
import {
  FrigateCameraStatsSchema,
  FrigateConfigSchema,
  FrigateStatsSchema,
  FrigateVersionSchema,
  type FrigateCameraStats,
  type FrigateStats,
  type FrigateVersion,
} from './schemas';

export interface FrigateClientConfig {
  host: string;
  port: number; // default 5000
  token?: string; // Bearer token if auth enabled
  timeoutMs?: number; // default 10_000
}

export class FrigateError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'HTTP_ERROR'
      | 'PARSE_ERROR'
      | 'TIMEOUT'
      | 'NETWORK_ERROR',
  ) {
    super(message);
    this.name = 'FrigateError';
  }
}

const NON_CAMERA_KEYS = new Set([
  'detectors',
  'service',
  'cpu_usages',
  'gpu_usages',
  'processes',
]);

export class FrigateClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: FrigateClientConfig) {
    this.baseUrl = `http://${config.host}:${config.port}`;
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  private buildHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }
    return headers;
  }

  private async fetchJson(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: this.buildHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new FrigateError(`HTTP ${response.status}`, 'HTTP_ERROR');
      }

      return await response.json();
    } catch (err) {
      if (err instanceof FrigateError) throw err;

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new FrigateError(
          `Request timed out after ${this.timeoutMs}ms`,
          'TIMEOUT',
        );
      }

      throw new FrigateError(
        err instanceof Error ? err.message : String(err),
        'NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timerId);
    }
  }

  private parseWith<Output>(
    schema: z.ZodType<Output, z.ZodTypeDef, unknown>,
    data: unknown,
  ): Output {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new FrigateError(
        `Parse failed: ${result.error.message}`,
        'PARSE_ERROR',
      );
    }
    return result.data;
  }

  async getVersion(): Promise<FrigateVersion> {
    const data = await this.fetchJson('/api/version');
    return this.parseWith(FrigateVersionSchema, data);
  }

  async getStats(): Promise<FrigateStats> {
    const data = await this.fetchJson('/api/stats');
    return this.parseWith(FrigateStatsSchema, data);
  }

  async getConfig(): Promise<z.output<typeof FrigateConfigSchema>> {
    const data = await this.fetchJson('/api/config');
    return this.parseWith(FrigateConfigSchema, data);
  }

  extractCameras(stats: FrigateStats): Record<string, FrigateCameraStats> {
    const cameras: Record<string, FrigateCameraStats> = {};

    for (const [key, value] of Object.entries(stats)) {
      if (NON_CAMERA_KEYS.has(key)) continue;

      const result = FrigateCameraStatsSchema.safeParse(value);
      if (result.success) {
        cameras[key] = result.data;
      }
    }

    return cameras;
  }
}
