import Link from "next/link";

import type { BridgeTile } from "@/lib/db/bridge";
import { bridgeStateToAutonomy } from "./AutonomyPill";

// Two gradient presets — applied to the 2 featured tiles.
const GRADIENTS = [
  "linear-gradient(135deg, #1D4ED8 0%, #0F766E 100%)",
  "linear-gradient(135deg, #D97706 0%, #DC2626 100%)",
];

export function FeaturedVentureCard({
  tile,
  index,
}: {
  tile: BridgeTile;
  index: number;
}) {
  const gradient = GRADIENTS[index % GRADIENTS.length];
  const autonomy = bridgeStateToAutonomy(tile.state);

  return (
    <Link
      href={`/v2/v/${tile.slug}`}
      style={{
        display: "block",
        borderRadius: 6,
        background: gradient,
        padding: "28px 24px",
        textDecoration: "none",
        color: "#fff",
        transition: "opacity 150ms ease-out",
        minHeight: 160,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Venture name + autonomy */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          {tile.name}
        </h2>
        {/* White-tinted pill on gradient */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 10px",
            borderRadius: 99,
            background: "rgba(255,255,255,0.22)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 500,
            backdropFilter: "blur(4px)",
          }}
        >
          {autonomy}
        </span>
      </div>

      {/* Phase + vital sign */}
      <p
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.8)",
          margin: "0 0 16px",
          textTransform: "capitalize",
        }}
      >
        {tile.phase}
        {tile.vitalSign ? ` · ${tile.vitalSign}` : ""}
      </p>

      {/* Pending + last activity */}
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        {tile.pendingCount > 0 && (
          <span
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            {tile.pendingCount} pending
          </span>
        )}
        {tile.lastActivityAt && (
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.65)",
            }}
          >
            {formatRelative(tile.lastActivityAt)}
          </span>
        )}
      </div>
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
