import { z } from 'zod';
import {
  HaApiStatusSchema,
  HaAddonInfoSchema,
  HaHostInfoSchema,
  HaMountsResponseSchema,
  type HaAddonInfo,
  type HaHostInfo,
} from './schemas';

export interface HaClientConfig {
  host: string;
  port: number;
  token: string;
  timeoutMs?: number;
}

export class HaError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'HTTP_ERROR'
      | 'PARSE_ERROR'
      | 'TIMEOUT'
      | 'NETWORK_ERROR'
      | 'AUTH_ERROR',
  ) {
    super(message);
    this.name = 'HaError';
  }
}

export class HaClient {
  constructor(private readonly config: HaClientConfig) {}

  private get baseUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async request(path: string): Promise<unknown> {
    const timeoutMs = this.config.timeoutMs ?? 10_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: this.headers,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new HaError(`Request timed out after ${timeoutMs}ms`, 'TIMEOUT');
      }
      throw new HaError(
        err instanceof Error ? err.message : String(err),
        'NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401) {
      throw new HaError('Unauthorized', 'AUTH_ERROR');
    }
    if (!response.ok) {
      throw new HaError(`HTTP ${response.status}`, 'HTTP_ERROR');
    }

    return response.json();
  }

  private parse<T>(schema: z.ZodType<T>, data: unknown, path: string): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new HaError(
        `Parse failed: ${result.error.message} (path: ${path})`,
        'PARSE_ERROR',
      );
    }
    return result.data;
  }

  async ping(): Promise<boolean> {
    const data = await this.request('/api/');
    this.parse(HaApiStatusSchema, data, '/api/');
    return true;
  }

  async getMounts(): Promise<z.infer<typeof HaMountsResponseSchema>> {
    const data = await this.request('/api/hassio/mounts');
    return this.parse(HaMountsResponseSchema, data, '/api/hassio/mounts');
  }

  async getHostInfo(): Promise<HaHostInfo> {
    const data = await this.request('/api/hassio/host/info');
    return this.parse(HaHostInfoSchema, data, '/api/hassio/host/info');
  }

  async getAddonInfo(slug: string): Promise<HaAddonInfo> {
    const path = `/api/hassio/addons/${slug}/info`;
    const data = await this.request(path);
    return this.parse(HaAddonInfoSchema, data, path);
  }
}
