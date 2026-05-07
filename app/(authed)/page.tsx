import { Bridge } from "@/components/bridge/Bridge";
import { requireUserContext } from "@/lib/auth/guard";
import { listBridgeTiles } from "@/lib/db/bridge";
import { listEventsForVentures } from "@/lib/db/events";

export const metadata = {
  title: "Bridge — SoloDesk",
};

// The operator's home. Single SQL roundtrip via bridge_tiles RPC, fully
// server-rendered (no client skeleton flash). Membership scoping happens
// at the SQL layer — see lib/db/bridge.ts and migration 0009. Initial
// Watch snapshot is loaded server-side; The Watch then subscribes to
// realtime on mount.
export default async function BridgeHomePage() {
  const user = await requireUserContext();

  const result = await listBridgeTiles({
    userId: user.userId,
    isAdmin: user.isAdmin,
  });

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
          Bridge
        </h1>
        <div className="border border-rule bg-paper-card p-6">
          <p className="text-sm text-negative">
            Unable to load tiles: {result.error}
          </p>
        </div>
      </div>
    );
  }

  const ventureIds = result.tiles.map((t) => t.ventureId);
  const initialEvents = await listEventsForVentures({ ventureIds, limit: 25 });

  return (
    <Bridge
      tiles={result.tiles}
      operatorEmail={user.email}
      initialEvents={initialEvents}
    />
  );
}
