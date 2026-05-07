import Link from "next/link";

import { PhaseBadge } from "@/components/phase-badge";
import { StateDot, VentureMark } from "@/components/venture";
import { filterVisibleVentures, requireUserContext } from "@/lib/auth/guard";
import { listVentures } from "@/lib/db/ventures";

// Map venture phase -> StateDot state. discovery + dormant read as
// quiet; build/launch are active; scale is idle (steady-state).
function phaseToStateDot(phase: string): "active" | "idle" | "quiet" {
  if (phase === "build" || phase === "launch") return "active";
  if (phase === "scale") return "idle";
  return "quiet";
}

export const metadata = {
  title: "Ventures — SoloDesk",
};

export default async function VenturesPage() {
  const user = await requireUserContext();
  const allVentures = await listVentures();
  const ventures = await filterVisibleVentures(allVentures, user);

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
            Ventures
          </h1>
          <div className="h-px w-12 bg-accent opacity-50" />
          <p className="pt-2 text-sm text-ink-mute">
            Every active or dormant venture. One row per slug.
          </p>
        </div>
        <Link
          href="/ventures/new"
          className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
        >
          New venture
        </Link>
      </header>

      {ventures.length === 0 ? (
        <p className="py-4 text-sm text-ink-mute">
          No ventures yet.{" "}
          <Link
            href="/ventures/new"
            className="text-accent underline-offset-2 hover:underline"
          >
            Create the first.
          </Link>
        </p>
      ) : (
        <ul>
          {ventures.map((v) => (
            <li key={v.id} className="border-b border-rule">
              <Link
                href={`/ventures/${v.slug}`}
                className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-4 px-3 py-3 transition-colors duration-[80ms] hover:bg-paper-card"
              >
                <span style={{ color: v.accent_color }} className="shrink-0">
                  <VentureMark
                    slug={v.mark_slug}
                    size={22}
                    accentColor={v.accent_color}
                  />
                </span>
                <StateDot
                  state={phaseToStateDot(v.phase)}
                  accentColor={v.accent_color}
                  ariaLabel={`${v.name} ${phaseToStateDot(v.phase)}`}
                />
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-base font-medium text-ink">
                    {v.name}
                  </p>
                  <p className="truncate font-mono text-xs text-ink-mute">
                    {v.slug}
                    {v.north_star ? ` · ${v.north_star}` : ""}
                  </p>
                </div>
                <PhaseBadge phase={v.phase} />
                <span className="text-xs text-ink-faint">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
