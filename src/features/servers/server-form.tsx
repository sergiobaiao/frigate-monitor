'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createServer,
  updateServer,
  testConnection,
} from '@/features/servers/actions';
import type {
  ServerWithGroup,
  ConnectionTestResult,
} from '@/features/servers/actions';

interface Group {
  id: string;
  name: string;
}

interface Props {
  server?: ServerWithGroup;
  groups: Group[];
}

const CHANNELS = ['telegram', 'whatsapp'] as const;
const SEVERITIES = [
  'ok',
  'warning',
  'critical',
  'unknown',
  'resolved',
] as const;

export function ServerForm({ server, groups }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(
    null,
  );
  const [testing, setTesting] = useState(false);

  // Form state
  const [name, setName] = useState(server?.name ?? '');
  const [type, setType] = useState<'ubuntu' | 'haos'>(server?.type ?? 'ubuntu');
  const [host, setHost] = useState(server?.host ?? '');
  const [groupId, setGroupId] = useState(server?.groupId ?? '');
  const [sshPort, setSshPort] = useState(String(server?.sshPort ?? 22));
  const [haPort, setHaPort] = useState(String(server?.haPort ?? 8123));
  const [frigatePort, setFrigatePort] = useState(
    String(server?.frigatePort ?? 5000),
  );
  const [intervalSec, setIntervalSec] = useState(
    String(server?.intervalSec ?? 300),
  );
  const [minSeverity, setMinSeverity] = useState<(typeof SEVERITIES)[number]>(
    (server?.minSeverity as (typeof SEVERITIES)[number]) ?? 'warning',
  );
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [channels, setChannels] = useState<string[]>(
    Array.isArray(server?.channels) ? (server.channels as string[]) : [],
  );

  // Secret fields
  const [sshKey, setSshKey] = useState('');
  const [sshPassword, setSshPassword] = useState('');
  const [haToken, setHaToken] = useState('');
  const [frigateToken, setFrigateToken] = useState('');

  const isEdit = !!server;

  function toggleChannel(ch: string) {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  }

  function buildPayload() {
    return {
      ...(isEdit ? { id: server!.id } : {}),
      name,
      type,
      host,
      groupId: groupId || null,
      sshPort: parseInt(sshPort, 10),
      haPort: parseInt(haPort, 10),
      frigatePort: parseInt(frigatePort, 10),
      intervalSec: parseInt(intervalSec, 10),
      minSeverity,
      enabled,
      channels,
      thresholds: {},
      // Secrets — only sent if non-empty
      ...(sshKey ? { sshKey } : {}),
      ...(sshPassword ? { sshPassword } : {}),
      ...(haToken ? { haToken } : {}),
      ...(frigateToken ? { frigateToken } : {}),
    };
  }

  async function handleTestConnection() {
    if (!server) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection(server.id);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const payload = buildPayload();
      const result = isEdit
        ? await updateServer(payload)
        : await createServer(payload);

      if (!result.success) {
        setError(result.error);
      } else {
        router.push('/settings/servers');
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-6">
      {/* Basic fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as 'ubuntu' | 'haos')}
            className="border-input bg-background rounded-lg border px-3 py-1.5 text-sm"
          >
            <option value="ubuntu">Ubuntu</option>
            <option value="haos">HAOS</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="host">Host / IP</Label>
          <Input
            id="host"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            required
            maxLength={255}
            placeholder="192.168.1.100"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="groupId">Group</Label>
          <select
            id="groupId"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="border-input bg-background rounded-lg border px-3 py-1.5 text-sm"
          >
            <option value="">— None —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ports */}
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sshPort">SSH Port</Label>
          <Input
            id="sshPort"
            type="number"
            min={1}
            max={65535}
            value={sshPort}
            onChange={(e) => setSshPort(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="haPort">HA Port</Label>
          <Input
            id="haPort"
            type="number"
            min={1}
            max={65535}
            value={haPort}
            onChange={(e) => setHaPort(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="frigatePort">Frigate Port</Label>
          <Input
            id="frigatePort"
            type="number"
            min={1}
            max={65535}
            value={frigatePort}
            onChange={(e) => setFrigatePort(e.target.value)}
          />
        </div>
      </div>

      {/* Monitoring settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="intervalSec">Check Interval (seconds)</Label>
          <Input
            id="intervalSec"
            type="number"
            min={30}
            max={86400}
            value={intervalSec}
            onChange={(e) => setIntervalSec(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="minSeverity">Min Severity</Label>
          <select
            id="minSeverity"
            value={minSeverity}
            onChange={(e) =>
              setMinSeverity(e.target.value as (typeof SEVERITIES)[number])
            }
            className="border-input bg-background rounded-lg border px-3 py-1.5 text-sm"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 translate-x-1 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : ''
            }`}
          />
        </button>
        <Label>Enabled</Label>
      </div>

      {/* Channels */}
      <div className="flex flex-col gap-2">
        <Label>Notification Channels</Label>
        <div className="flex gap-4">
          {CHANNELS.map((ch) => (
            <label key={ch} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={channels.includes(ch)}
                onChange={() => toggleChannel(ch)}
                className="h-4 w-4 rounded"
              />
              {ch.charAt(0).toUpperCase() + ch.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {/* Secrets */}
      <fieldset className="border-border rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">
          Credentials{' '}
          {isEdit && (
            <span className="text-muted-foreground font-normal">
              (leave blank to keep existing)
            </span>
          )}
        </legend>
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sshKey">SSH Private Key</Label>
            <textarea
              id="sshKey"
              value={sshKey}
              onChange={(e) => setSshKey(e.target.value)}
              rows={4}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              className="border-input bg-background w-full rounded-lg border px-3 py-1.5 font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sshPassword">SSH Password</Label>
              <Input
                id="sshPassword"
                type="password"
                value={sshPassword}
                onChange={(e) => setSshPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="haToken">HA Token</Label>
              <Input
                id="haToken"
                type="password"
                value={haToken}
                onChange={(e) => setHaToken(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="frigateToken">Frigate Token</Label>
            <Input
              id="frigateToken"
              type="password"
              value={frigateToken}
              onChange={(e) => setFrigateToken(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
      </fieldset>

      {/* Test connection (edit only) */}
      {isEdit && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing}
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </Button>
            {testResult && (
              <span
                className={`text-sm ${
                  testResult.reachable
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-destructive'
                }`}
              >
                {testResult.reachable
                  ? `Reachable — ${testResult.latencyMs}ms`
                  : `Unreachable: ${testResult.error}`}
              </span>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Server'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/settings/servers')}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
