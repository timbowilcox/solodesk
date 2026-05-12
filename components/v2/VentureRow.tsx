"use client";

import Link from "next/link";

import type { BridgeTile } from "@/lib/db/bridge";
import { AutonomyPill, bridgeStateToAutonomy } from "./AutonomyPill";

export function VentureRow({ tile }: { tile: BridgeTile }) {
  const autonomy = bridgeStateToAutonomy(tile.state);

  return (
    <Link
      href={`/v2/v/${tile.slug}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid #EAEAEA",
        textDecoration: "none",
        transition: "background 150ms ease-out",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = "#FAFAFA";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
      }}
    >
      {/* Accent dot */}
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          flexShrink: 0,
          background: tile.accentColor,
        }}
      />

      {/* Name + phase */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "#0A0A0A",
            display: "block",
          }}
        >
          {tile.name}
        </span>
        <span
          style={{
            fontSize: 12,
            color: "#999",
            textTransform: "capitalize",
          }}
        >
          {tile.phase}
          {tile.vitalSign ? ` · ${tile.vitalSign}` : ""}
        </span>
      </div>

      {/* Pending count */}
      {tile.pendingCount > 0 && (
        <span
          style={{
            fontSize: 12,
            color: "#525252",
            whiteSpace: "nowrap",
          }}
        >
          {tile.pendingCount} pending
        </span>
      )}

      {/* Autonomy pill */}
      <AutonomyPill mode={autonomy} />

      {/* Last activity */}
      {tile.lastActivityAt && (
        <span
          style={{
            fontSize: 11,
            color: "#999",
            whiteSpace: "nowrap",
            width: 60,
            textAlign: "right",
          }}
        >
          {formatRelative(tile.lastActivityAt)}
        </span>
      )}
    </Link>
  );
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
