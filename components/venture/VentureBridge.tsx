// VentureBridge — per-venture canvas at /ventures/[slug].
//
// Header: large VentureMark (34px) + venture name + phase + slug.
// Function grid: 6 FunctionTiles (Strategy, Metrics, Content, Customers,
// Compliance, Operations). Each tile maps to an existing per-domain
// route. Phosphor regular weight icons throughout (CLAUDE.md bright
// line — no Tabler, no Lucide).
//
// Pure presentational. The parent (server component) passes in the
// venture row and the per-function state lines (counts of pending docs,
// etc.). No fetch path here, so no cross-venture leak surface.

import Link from "next/link";
// Per-icon imports for tree-shaking. SSR-safe variants (the /csr/ tree
// pulls IconContext via createContext, which can't run in a Server
// Component). Phosphor regular weight (the package default).
// NEVER swap in Lucide or Tabler — CLAUDE.md icon bright line.
import { Compass } from "@phosphor-icons/react/dist/ssr/Compass";
import { ChartLine } from "@phosphor-icons/react/dist/ssr/ChartLine";
import { Megaphone } from "@phosphor-icons/react/dist/ssr/Megaphone";
import { Lifebuoy } from "@phosphor-icons/react/dist/ssr/Lifebuoy";
import { Shield } from "@phosphor-icons/react/dist/ssr/Shield";
import { Wrench } from "@phosphor-icons/react/dist/ssr/Wrench";

import { PhaseBadge } from "@/components/phase-badge";
import { FunctionTile } from "@/components/venture/FunctionTile";
import { VentureMark } from "@/components/venture/VentureMark";
import { VentureStripe } from "@/components/venture/VentureStripe";
import type { VentureRow } from "@/lib/db/ventures";

export type VentureFunctionState = {
  strategy: string | null;
  metrics: string | null;
  content: string | null;
  customers: string | null;
  compliance: string | null;
  operations: string | null;
};

export type VentureBridgeProps = {
  venture: VentureRow;
  functionState: VentureFunctionState;
};

export function VentureBridge({ venture, functionState }: VentureBridgeProps) {
  return (
    <div className="space-y-10">
      <header className="flex gap-4">
        <VentureStripe accentColor={venture.accent_color} className="self-stretch" />
        <div className="flex flex-1 flex-col gap-3">
          <p className="text-xs">
            <Link
              href="/"
              className="text-accent underline-offset-2 hover:underline"
            >
              ← Bridge
            </Link>
          </p>
          <div className="flex items-center gap-3">
            <VentureMark
              slug={venture.mark_slug}
              size={34}
              accentColor={venture.accent_color}
            />
            <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
              {venture.name}
            </h1>
            <PhaseBadge phase={venture.phase} />
            <span className="font-mono text-xs text-ink-mute">
              {venture.slug}
            </span>
          </div>
          {venture.north_star && (
            <p className="text-sm text-ink-mute">
              North-star:{" "}
              <span className="font-medium text-ink">{venture.north_star}</span>
            </p>
          )}
        </div>
      </header>

      <section
        aria-label="Function grid"
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        <FunctionTile
          icon={Compass}
          label="Strategy"
          stateLine={functionState.strategy}
          href={`/ventures/${venture.slug}/strategy`}
        />
        <FunctionTile
          icon={ChartLine}
          label="Metrics"
          stateLine={functionState.metrics}
          href={`/ventures/${venture.slug}/digests`}
        />
        <FunctionTile
          icon={Megaphone}
          label="Content"
          stateLine={functionState.content}
          href={`/ventures/${venture.slug}/content`}
        />
        <FunctionTile
          icon={Lifebuoy}
          label="Customers"
          stateLine={functionState.customers}
          href={`/ventures/${venture.slug}/support`}
        />
        <FunctionTile
          icon={Shield}
          label="Compliance"
          stateLine={functionState.compliance}
          href={`/ventures/${venture.slug}/settings/connections`}
        />
        <FunctionTile
          icon={Wrench}
          label="Operations"
          stateLine={functionState.operations}
          href={`/ventures/${venture.slug}/memories`}
        />
      </section>
    </div>
  );
}
