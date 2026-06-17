import {
  getGroups,
  createGroup,
  deleteGroup,
} from '@/features/servers/group-actions';
import { Button } from '@/components/ui/button';
import { revalidatePath } from 'next/cache';

export default async function GroupsPage() {
  const groups = await getGroups();

  async function handleCreate(formData: FormData) {
    'use server';
    const name = formData.get('name');
    await createGroup({ name });
    revalidatePath('/settings/groups');
  }

  async function handleDelete(id: string) {
    'use server';
    await deleteGroup(id);
    revalidatePath('/settings/groups');
  }

  return (
    <div className="max-w-2xl p-6">
      <h1 className="mb-6 text-xl font-semibold">Server Groups</h1>

      <form action={handleCreate} className="mb-8 flex gap-2">
        <input
          name="name"
          type="text"
          placeholder="Group name"
          required
          maxLength={100}
          className="border-border bg-background focus-visible:ring-ring flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none focus-visible:ring-2"
        />
        <Button type="submit">Create</Button>
      </form>

      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">No groups yet.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li
              key={group.id}
              className="border-border bg-card flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div>
                <span className="text-sm font-medium">{group.name}</span>
                <span className="text-muted-foreground ml-3 text-xs">
                  {group.serverCount} server{group.serverCount !== 1 ? 's' : ''}
                </span>
              </div>
              <form
                action={async () => {
                  'use server';
                  await handleDelete(group.id);
                }}
              >
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={group.serverCount > 0}
                  title={
                    group.serverCount > 0
                      ? 'Remove all servers before deleting'
                      : undefined
                  }
                >
                  Delete
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
