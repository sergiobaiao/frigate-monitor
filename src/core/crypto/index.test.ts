import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, deriveKey } from './index';

function makeKey(): Buffer {
  return Buffer.from('a'.repeat(32), 'utf8'); // 32 bytes
}

describe('encrypt / decrypt', () => {
  it('round-trip returns original plaintext', () => {
    const key = makeKey();
    const enc = encrypt('hello world', key);
    expect(decrypt(enc, key)).toBe('hello world');
  });

  it('tamper ciphertext → decrypt throws', () => {
    const key = makeKey();
    const enc = encrypt('secret', key);
    const tampered = {
      ...enc,
      ciphertext: Buffer.from('bad').toString('base64'),
    };
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it('tamper tag → decrypt throws', () => {
    const key = makeKey();
    const enc = encrypt('secret', key);
    const badTag = Buffer.alloc(16, 0xff).toString('base64');
    const tampered = { ...enc, tag: badTag };
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it('wrong key → decrypt throws', () => {
    const key = makeKey();
    const wrongKey = Buffer.from('b'.repeat(32), 'utf8');
    const enc = encrypt('secret', key);
    expect(() => decrypt(enc, wrongKey)).toThrow();
  });

  it('keyVersion defaults to 1', () => {
    const key = makeKey();
    const enc = encrypt('x', key);
    expect(enc.keyVersion).toBe(1);
  });

  it('respects explicit keyVersion', () => {
    const key = makeKey();
    const enc = encrypt('x', key, 3);
    expect(enc.keyVersion).toBe(3);
  });

  it('generates unique IVs on consecutive calls', () => {
    const key = makeKey();
    const a = encrypt('same', key);
    const b = encrypt('same', key);
    expect(a.iv).not.toBe(b.iv);
  });
});

describe('deriveKey', () => {
  it('is deterministic', () => {
    const master = Buffer.from('masterkey12345678901234567890123', 'utf8'); // 32 bytes
    const k1 = deriveKey(master, 'server-1');
    const k2 = deriveKey(master, 'server-1');
    expect(k1.equals(k2)).toBe(true);
  });

  it('different serverIds → different keys', () => {
    const master = Buffer.from('masterkey12345678901234567890123', 'utf8');
    const k1 = deriveKey(master, 'server-1');
    const k2 = deriveKey(master, 'server-2');
    expect(k1.equals(k2)).toBe(false);
  });

  it('returns 32-byte Buffer', () => {
    const master = Buffer.from('masterkey12345678901234567890123', 'utf8');
    const k = deriveKey(master, 'srv');
    expect(k).toBeInstanceOf(Buffer);
    expect(k.length).toBe(32);
  });
});
