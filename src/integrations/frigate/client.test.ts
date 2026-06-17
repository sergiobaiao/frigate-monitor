import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FrigateClient, FrigateError } from './client';
import statsOk from './__fixtures__/stats-ok.json';
import statsMalformed from './__fixtures__/stats-malformed.json';
import versionOk from './__fixtures__/version-ok.json';
import configOk from './__fixtures__/config-ok.json';

function makeFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function makeClient(overrides: { timeoutMs?: number; token?: string } = {}) {
  return new FrigateClient({ host: 'localhost', port: 5000, ...overrides });
}

describe('FrigateClient', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('getVersion() parses version-ok fixture', async () => {
    vi.stubGlobal('fetch', makeFetch(versionOk));
    const client = makeClient();
    const result = await client.getVersion();
    expect(result).toEqual({ version: '0.17.1' });
  });

  it('getStats() parses stats-ok fixture — detectors + service present', async () => {
    vi.stubGlobal('fetch', makeFetch(statsOk));
    const client = makeClient();
    const result = await client.getStats();
    expect(result.detectors).toBeDefined();
    expect(result.service).toBeDefined();
    expect(result.service.version).toBe('0.17.1');
    expect(result.service.uptime).toBe(86400);
  });

  it('extractCameras() returns front_door + backyard, skips detectors/service', async () => {
    vi.stubGlobal('fetch', makeFetch(statsOk));
    const client = makeClient();
    const stats = await client.getStats();
    const cameras = client.extractCameras(stats);

    expect(Object.keys(cameras).sort()).toEqual(['backyard', 'front_door']);
    expect(cameras['front_door'].camera_fps).toBe(5.0);
    expect(cameras['backyard'].process_fps).toBe(4.8);
    expect(cameras['detectors' as string]).toBeUndefined();
    expect(cameras['service' as string]).toBeUndefined();
  });

  it('getStats() parses stats-malformed without throwing', async () => {
    vi.stubGlobal('fetch', makeFetch(statsMalformed));
    const client = makeClient();
    await expect(client.getStats()).resolves.toBeDefined();
  });

  it('non-2xx response throws FrigateError with code HTTP_ERROR', async () => {
    vi.stubGlobal('fetch', makeFetch({ detail: 'Not Found' }, 404));
    const client = makeClient();
    await expect(client.getStats()).rejects.toMatchObject({
      name: 'FrigateError',
      code: 'HTTP_ERROR',
      message: 'HTTP 404',
    });
  });

  it('fetch abort throws FrigateError with code TIMEOUT or NETWORK_ERROR', async () => {
    const abortError = new DOMException(
      'The operation was aborted.',
      'AbortError',
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
    const client = makeClient({ timeoutMs: 1 });
    const err = await client.getStats().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FrigateError);
    const frigateErr = err as FrigateError;
    expect(['TIMEOUT', 'NETWORK_ERROR']).toContain(frigateErr.code);
  });

  it('getConfig() parses config-ok — returns cameras map', async () => {
    vi.stubGlobal('fetch', makeFetch(configOk));
    const client = makeClient();
    const result = await client.getConfig();
    expect(result.cameras).toBeDefined();
    expect(Object.keys(result.cameras).sort()).toEqual([
      'backyard',
      'front_door',
    ]);
    expect(result.cameras['front_door'].record?.enabled).toBe(true);
    expect(result.cameras['front_door'].record?.retain?.days).toBe(7);
  });
});
