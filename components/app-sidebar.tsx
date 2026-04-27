"use client";

import {
  Activity,
  Briefcase,
  LayoutDashboard,
  Settings as SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { signOutAction } from "@/app/(authed)/actions";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ventures", label: "Ventures", icon: Briefcase },
  { href: "/events", label: "Events", icon: Activity },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/30 px-3 py-6">
      <Link href="/dashboard" className="px-2 pb-8">
        <span className="font-mono text-sm font-semibold tracking-tight">
          SoloDesk
        </span>
      </Link>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition",
                active
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-2 border-t border-border px-2 pt-4">
        <p
          className="truncate font-mono text-xs text-muted-foreground"
          title={email}
        >
          {email}
        </p>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-xs text-muted-foreground transition hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
