import Link from 'next/link';
import { getServers } from '@/features/servers/actions';
import { ServerList } from '@/features/servers/server-list';

export default async function ServersPage() {
  const servers = await getServers();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Servers</h1>
          <p className="text-muted-foreground text-sm">
            Manage monitored servers.
          </p>
        </div>
        <Link
          href="/settings/servers/new"
          className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium"
        >
          Add Server
        </Link>
      </div>

      <ServerList servers={servers} />
    </div>
  );
}
