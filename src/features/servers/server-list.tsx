'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { deleteServer } from '@/features/servers/actions';
import type { ServerWithGroup } from '@/features/servers/actions';

interface Props {
  servers: ServerWithGroup[];
}

export function ServerList({ servers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDeleteClick(id: string) {
    setConfirmId(id);
  }

  function handleConfirmDelete() {
    if (!confirmId) return;
    const id = confirmId;
    setConfirmId(null);
    startTransition(async () => {
      const result = await deleteServer(id);
      if (!result.success) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  if (servers.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No servers configured. Add one to get started.
      </p>
    );
  }

  return (
    <>
      {error && <p className="text-destructive mb-4 text-sm">{error}</p>}

      {/* Confirm dialog */}
      {confirmId && (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-card border-border w-full max-w-sm rounded-lg border p-6 shadow-lg">
            <h2 className="mb-2 text-base font-semibold">Delete server?</h2>
            <p className="text-muted-foreground mb-6 text-sm">
              This will permanently delete the server and all its data. This
              action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmId(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={pending}
              >
                {pending ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Host</th>
              <th className="px-4 py-3 text-left font-medium">Group</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server, idx) => (
              <tr
                key={server.id}
                className={idx % 2 === 0 ? '' : 'bg-muted/20'}
              >
                <td className="px-4 py-3 font-medium">{server.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      server.type === 'ubuntu'
                        ? 'bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-medium'
                        : 'rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    }
                  >
                    {server.type}
                  </span>
                </td>
                <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
                  {server.host}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {server.group?.name ?? '—'}
                </td>
                <td className="px-4 py-3">
                  {server.enabled ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                      Enabled
                    </span>
                  ) : (
                    <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-medium">
                      Disabled
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/settings/servers/${server.id}`}
                      className="border-border bg-background hover:bg-muted inline-flex h-7 items-center rounded-[min(var(--radius-md),12px)] border px-2.5 text-[0.8rem] font-medium"
                    >
                      Edit
                    </Link>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteClick(server.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
