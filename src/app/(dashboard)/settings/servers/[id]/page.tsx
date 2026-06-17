import { notFound } from 'next/navigation';
import { getServer } from '@/features/servers/actions';
import { getGroups } from '@/features/servers/group-actions';
import { ServerForm } from '@/features/servers/server-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditServerPage({ params }: Props) {
  const { id } = await params;
  const [server, groups] = await Promise.all([getServer(id), getGroups()]);

  if (!server) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Edit Server</h1>
        <p className="text-muted-foreground text-sm">{server.name}</p>
      </div>
      <ServerForm server={server} groups={groups} />
    </div>
  );
}
