import { getGroups } from '@/features/servers/group-actions';
import { ServerForm } from '@/features/servers/server-form';

export default async function NewServerPage() {
  const groups = await getGroups();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Add Server</h1>
        <p className="text-muted-foreground text-sm">
          Configure a new server to monitor.
        </p>
      </div>
      <ServerForm groups={groups} />
    </div>
  );
}
