import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Valid base64-encoded 32-byte key
const TEST_KEY = Buffer.from('a'.repeat(32)).toString('base64');

// Hoist mock so it's available before module imports
const mockDb = vi.hoisted(() => ({
  secret: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

// Import after mocks
import { SecretService } from './secret-service';

describe('SecretService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SECRET_ENC_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.SECRET_ENC_KEY;
  });

  describe('saveSecrets', () => {
    it('calls db.secret.upsert for each provided secret kind', async () => {
      mockDb.secret.upsert.mockResolvedValue({});

      await SecretService.saveSecrets('server-1', {
        sshKey: 'my-ssh-key',
        haToken: 'my-ha-token',
      });

      expect(mockDb.secret.upsert).toHaveBeenCalledTimes(2);

      const calls = mockDb.secret.upsert.mock.calls;
      const kinds = calls.map(
        (c: { where: { serverId_kind: { kind: string } } }[]) =>
          c[0].where.serverId_kind.kind,
      );
      expect(kinds).toContain('ssh_key');
      expect(kinds).toContain('ha_token');
    });

    it('skips undefined secrets (no DB call for missing kinds)', async () => {
      mockDb.secret.upsert.mockResolvedValue({});

      await SecretService.saveSecrets('server-1', {
        sshKey: 'my-ssh-key',
        sshPassword: undefined,
        haToken: undefined,
        frigateToken: undefined,
      });

      expect(mockDb.secret.upsert).toHaveBeenCalledTimes(1);
      const call = mockDb.secret.upsert.mock.calls[0][0];
      expect(call.where.serverId_kind.kind).toBe('ssh_key');
    });

    it('throws if SECRET_ENC_KEY not set', async () => {
      delete process.env.SECRET_ENC_KEY;

      await expect(
        SecretService.saveSecrets('server-1', { sshKey: 'key' }),
      ).rejects.toThrow('SECRET_ENC_KEY not configured');
    });
  });

  describe('getSecrets', () => {
    it('decrypts and returns correct plaintext', async () => {
      // Encrypt real values so we can verify round-trip
      const { encrypt, deriveKey } = await import('@/core/crypto');
      const masterKey = Buffer.from(TEST_KEY, 'base64');
      const derived = deriveKey(masterKey, 'server-2');

      const encSshKey = encrypt('my-ssh-key', derived);
      const encHaToken = encrypt('my-ha-token', derived);

      mockDb.secret.findMany.mockResolvedValue([
        { kind: 'ssh_key', ...encSshKey },
        { kind: 'ha_token', ...encHaToken },
      ]);

      const result = await SecretService.getSecrets('server-2');

      expect(result.sshKey).toBe('my-ssh-key');
      expect(result.haToken).toBe('my-ha-token');
      expect(result.sshPassword).toBeUndefined();
      expect(result.frigateToken).toBeUndefined();
    });

    it('returns empty object when no secrets exist', async () => {
      mockDb.secret.findMany.mockResolvedValue([]);

      const result = await SecretService.getSecrets('server-3');

      expect(result).toEqual({});
      // getMasterKey should not be called — no rows to decrypt
    });
  });

  describe('deleteSecrets', () => {
    it('calls db.secret.deleteMany with serverId', async () => {
      mockDb.secret.deleteMany.mockResolvedValue({ count: 2 });

      await SecretService.deleteSecrets('server-4');

      expect(mockDb.secret.deleteMany).toHaveBeenCalledOnce();
      expect(mockDb.secret.deleteMany).toHaveBeenCalledWith({
        where: { serverId: 'server-4' },
      });
    });
  });
});
