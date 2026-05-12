"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/v2", label: "Bridge" },
  { href: "/v2/chat", label: "Chat" },
  { href: "/v2/workflows", label: "Workflows" },
  { href: "/v2/recall", label: "Recall" },
];

export function V2Rail({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "#FAFAFA",
        borderRight: "1px solid #EAEAEA",
        padding: "28px 16px",
        minHeight: "100vh",
      }}
    >
      {/* Wordmark */}
      <Link
        href="/v2"
        style={{
          display: "block",
          marginBottom: 32,
          fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: "#0A0A0A",
          textDecoration: "none",
        }}
      >
        SoloDesk
      </Link>

      {/* Primary nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/v2"
              ? pathname === "/v2"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "6px 10px",
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: active ? "#0A0A0A" : "#525252",
                borderRadius: 4,
                background: active ? "#EAEAEA" : "transparent",
                textDecoration: "none",
                transition: "background 150ms ease-out, color 150ms ease-out",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ marginTop: "auto", paddingTop: 24 }}>
        <p
          style={{
            fontSize: 11,
            color: "#999",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: 8,
          }}
          title={email}
        >
          {email}
        </p>
        <Link
          href="/"
          style={{
            fontSize: 11,
            color: "#999",
            textDecoration: "none",
          }}
        >
          Open legacy ↗
        </Link>
      </div>
    </aside>
  );
}
