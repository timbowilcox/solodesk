import Link from "next/link";

import { FeaturedVentureCard } from "@/components/v2/FeaturedVentureCard";
import { VentureRow } from "@/components/v2/VentureRow";
import { requireUserContext } from "@/lib/auth/guard";
import { listBridgeTiles } from "@/lib/db/bridge";

export const metadata = {
  title: "Bridge — SoloDesk v2",
};

export default async function V2BridgePage() {
  const user = await requireUserContext();

  const result = await listBridgeTiles({
    userId: user.userId,
    isAdmin: user.isAdmin,
  });

  const tiles = result.ok ? result.tiles : [];

  // Featured: top 2 by pendingCount, then by lastActivityAt
  const sorted = [...tiles].sort((a, b) => {
    const pendingDiff = b.pendingCount - a.pendingCount;
    if (pendingDiff !== 0) return pendingDiff;
    const aTs = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const bTs = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return bTs - aTs;
  });

  const featured = sorted.slice(0, 2);
  const rest = sorted.slice(2);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 32px" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "#0A0A0A",
              margin: 0,
              letterSpacing: "-0.03em",
            }}
          >
            Portfolio
          </h1>
          <p style={{ fontSize: 13, color: "#999", margin: "4px 0 0" }}>
            {tiles.length} ventures · {user.email}
          </p>
        </div>
        <Link
          href="/v2/chat"
          style={{
            fontSize: 13,
            color: "#2563EB",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Ask across portfolio →
        </Link>
      </header>

      {/* Featured gradient cards — max 2 */}
      {featured.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: featured.length === 1 ? "1fr" : "1fr 1fr",
            gap: 14,
            marginBottom: 32,
          }}
        >
          {featured.map((tile, i) => (
            <FeaturedVentureCard key={tile.ventureId} tile={tile} index={i} />
          ))}
        </div>
      )}

      {/* Rest as list rows */}
      {rest.length > 0 && (
        <div
          style={{
            border: "1px solid #EAEAEA",
            borderRadius: 6,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto auto",
              padding: "8px 16px",
              borderBottom: "1px solid #EAEAEA",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 500, color: "#999" }}>
              Venture
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: "#999" }}>Pending</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: "#999", marginLeft: 12 }}>Mode</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: "#999", marginLeft: 12 }}>Last activity</span>
          </div>
          {rest.map((tile) => (
            <VentureRow key={tile.ventureId} tile={tile} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {tiles.length === 0 && (
        <p style={{ fontSize: 14, color: "#999" }}>No ventures.</p>
      )}

      {/* Cross-venture chat input */}
      <div
        style={{
          marginTop: 40,
          padding: "20px 24px",
          background: "#FAFAFA",
          border: "1px solid #EAEAEA",
          borderRadius: 6,
        }}
      >
        <p style={{ fontSize: 12, color: "#999", marginBottom: 10, fontWeight: 500 }}>
          ASK ACROSS PORTFOLIO
        </p>
        <form action="/v2/chat" method="GET" style={{ display: "flex", gap: 10 }}>
          <input
            name="q"
            placeholder="What pricing decisions have I made across my ventures?"
            style={{
              flex: 1,
              padding: "10px 14px",
              fontSize: 14,
              border: "1px solid #EAEAEA",
              borderRadius: 4,
              outline: "none",
              background: "#fff",
              color: "#0A0A0A",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 20px",
              background: "#2563EB",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
