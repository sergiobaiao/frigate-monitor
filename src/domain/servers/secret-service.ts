import { $Enums } from '@/generated/prisma';
import { decrypt, deriveKey, encrypt } from '@/core/crypto';
import { db } from '@/lib/db';

export interface SecretPayload {
  sshKey?: string;
  sshPassword?: string;
  haToken?: string;
  frigateToken?: string;
}

const KIND_MAP: Record<keyof SecretPayload, $Enums.SecretKind> = {
  sshKey: 'ssh_key',
  sshPassword: 'ssh_password',
  haToken: 'ha_token',
  frigateToken: 'frigate_token',
};

const KIND_REVERSE: Partial<Record<$Enums.SecretKind, keyof SecretPayload>> = {
  ssh_key: 'sshKey',
  ssh_password: 'sshPassword',
  ha_token: 'haToken',
  frigate_token: 'frigateToken',
};

function getMasterKey(): Buffer {
  const raw = process.env.SECRET_ENC_KEY;
  if (!raw) {
    throw new Error('SECRET_ENC_KEY not configured');
  }
  return Buffer.from(raw, 'base64');
}

export class SecretService {
  static async saveSecrets(
    serverId: string,
    secrets: SecretPayload,
  ): Promise<void> {
    const masterKey = getMasterKey();
    const derivedKey = deriveKey(masterKey, serverId);

    const ops = (
      Object.entries(secrets) as [keyof SecretPayload, string | undefined][]
    )
      .filter(([, value]) => value !== undefined)
      .map(([field, value]) => {
        const kind = KIND_MAP[field];
        const enc = encrypt(value as string, derivedKey);
        return db.secret.upsert({
          where: { serverId_kind: { serverId, kind } },
          create: {
            serverId,
            kind,
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            tag: enc.tag,
            keyVersion: enc.keyVersion,
          },
          update: {
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            tag: enc.tag,
            keyVersion: enc.keyVersion,
          },
        });
      });

    await Promise.all(ops);
  }

  static async getSecrets(serverId: string): Promise<SecretPayload> {
    const rows = await db.secret.findMany({ where: { serverId } });
    if (rows.length === 0) return {};

    const masterKey = getMasterKey();
    const derivedKey = deriveKey(masterKey, serverId);

    const result: SecretPayload = {};
    for (const row of rows) {
      const field = KIND_REVERSE[row.kind];
      if (field) {
        result[field] = decrypt(
          {
            ciphertext: row.ciphertext,
            iv: row.iv,
            tag: row.tag,
            keyVersion: row.keyVersion,
          },
          derivedKey,
        );
      }
    }
    return result;
  }

  static async deleteSecrets(serverId: string): Promise<void> {
    await db.secret.deleteMany({ where: { serverId } });
  }
}
