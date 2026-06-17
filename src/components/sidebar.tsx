'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Video,
  Bell,
  List,
  Server,
  Folder,
  Send,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: Home },
  { href: '/cameras', label: 'Cameras', icon: Video },
  { href: '/events', label: 'Events', icon: Bell },
  { href: '/logs', label: 'Logs', icon: List },
] as const;

const SETTINGS_ITEMS = [
  { href: '/settings/servers', label: 'Servers', icon: Server },
  { href: '/settings/groups', label: 'Groups', icon: Folder },
  { href: '/settings/notifications', label: 'Notifications', icon: Send },
  { href: '/settings/users', label: 'Users', icon: Users },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <aside className="border-border bg-sidebar flex h-screen w-56 flex-col border-r">
      <div className="border-border flex h-12 items-center border-b px-4">
        <span className="text-sm font-semibold tracking-tight">FleetWatch</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive(href)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        ))}

        <div className="border-border my-2 border-t" />

        <p className="text-muted-foreground px-3 pb-1 text-xs font-medium tracking-wider uppercase">
          Settings
        </p>

        {SETTINGS_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive(href)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
