import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import type { Session } from 'next-auth';

interface HeaderProps {
  session: Session;
}

export function Header({ session }: HeaderProps) {
  return (
    <header className="border-border flex h-12 items-center justify-between border-b px-6">
      <span className="text-muted-foreground text-sm">
        {session.user.email}
      </span>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/sign-in' });
        }}
      >
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </header>
  );
}
