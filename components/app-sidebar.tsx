"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { signOutAction } from "@/app/(authed)/actions";

type NavItem = { href: string; label: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/ventures", label: "Ventures" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/events", label: "Events" },
  { href: "/settings", label: "Settings" },
];

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-[220px] shrink-0 flex-col bg-paper px-4 py-8">
      <Link href="/dashboard" className="mb-8 block">
        <span className="font-mono text-sm tracking-tight text-ink-strong">
          SoloDesk
        </span>
      </Link>
      <nav className="flex flex-col">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "border-l-2 px-3 py-1.5 text-sm transition-colors duration-[80ms]",
                active
                  ? "border-accent font-medium text-ink-strong"
                  : "border-transparent text-ink-mute hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-2 pt-8">
        <p
          className="truncate font-mono text-xs text-ink-mute"
          title={email}
        >
          {email}
        </p>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-xs text-ink-mute transition-colors duration-[80ms] hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
