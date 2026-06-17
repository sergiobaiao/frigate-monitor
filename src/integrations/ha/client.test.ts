import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HaClient, HaError } from './client';
import mountsOk from './__fixtures__/mounts-ok.json';
import mountsWarning from './__fixtures__/mounts-warning.json';
import hostInfo from './__fixtures__/host-info.json';
import addonInfo from './__fixtures__/addon-info.json';

function makeClient(
  overrides: Partial<ConstructorParameters<typeof HaClient>[0]> = {},
) {
  return new HaClient({
    host: 'homeassistant.local',
    port: 8123,
    token: 'test-token',
    ...overrides,
  });
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

describe('HaClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ping() returns true when GET /api/ returns 200 + { message }', async () => {
    mockFetch(200, { message: 'API running.' });
    const client = makeClient();
    const result = await client.ping();
    expect(result).toBe(true);
  });

  it('getMounts() parses mounts-ok fixture — 2 active mounts', async () => {
    mockFetch(200, mountsOk);
    const client = makeClient();
    const result = await client.getMounts();
    expect(result.mounts).toHaveLength(2);
    expect(result.mounts.every((m) => m.state === 'active')).toBe(true);
  });

  it('getMounts() with mounts-warning — returns mounts including failed state', async () => {
    mockFetch(200, mountsWarning);
    const client = makeClient();
    const result = await client.getMounts();
    expect(result.mounts).toHaveLength(2);
    expect(result.mounts.some((m) => m.state === 'failed')).toBe(true);
    expect(result.mounts.some((m) => m.state === 'active')).toBe(true);
  });

  it('getHostInfo() parses host-info fixture', async () => {
    mockFetch(200, hostInfo);
    const client = makeClient();
    const result = await client.getHostInfo();
    expect(result.hostname).toBe('homeassistant');
    expect(result.operating_system).toBe('Home Assistant OS 13.1');
    expect(result.disk_total).toBe(250000000000);
  });

  it('getAddonInfo() parses addon-info fixture — state started', async () => {
    mockFetch(200, addonInfo);
    const client = makeClient();
    const result = await client.getAddonInfo('frigate');
    expect(result.state).toBe('started');
    expect(result.slug).toBe('frigate');
    expect(result.update_available).toBe(false);
  });

  it('401 response throws HaError with code AUTH_ERROR', async () => {
    mockFetch(401, { message: 'Unauthorized' });
    const client = makeClient();
    await expect(client.ping()).rejects.toBeInstanceOf(HaError);
    await expect(client.ping()).rejects.toMatchObject({ code: 'AUTH_ERROR' });
  });

  it('non-2xx response throws HaError with code HTTP_ERROR', async () => {
    mockFetch(503, { message: 'Service Unavailable' });
    const client = makeClient();
    await expect(client.getMounts()).rejects.toMatchObject({
      name: 'HaError',
      code: 'HTTP_ERROR',
    });
  });
});
