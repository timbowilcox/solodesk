// /admin/identity-preview — Sprint 7 visual reference + manual smoke.
//
// Per spec: admin-only via requireAdminContext (already exists from
// team-inbound substrate). Renders all six ventures × all five identity
// components in both light + dark mode for visual reference.
//
// This is the only page in the app that may render in both light and
// dark mode simultaneously — the dark-mode block is wrapped in `dark`
// to flip the CSS custom properties from globals.css.

import { requireAdminContext } from "@/lib/auth/guard";
import { listVentures } from "@/lib/db/ventures";
import {
  ConnectionChip,
  Sparkline,
  StateDot,
  VentureMark,
  VentureStripe,
  type StateDotState,
} from "@/components/venture";
import { MARKS } from "@/lib/venture/marks";
import type { VentureMarkSlug } from "@/lib/supabase/types";

export const metadata = {
  title: "Identity preview — SoloDesk",
};

const STATE_SEQUENCE: StateDotState[] = ["active", "idle", "quiet"];

const SAMPLE_PROVIDERS = ["stripe", "resend", "vercel", "github", "none"];

// Distinct sparkline shapes per venture so visual smoke catches when a
// component breaks for one specific venture's data.
function sparkData(slug: string): number[] {
  switch (slug) {
    case "kounta":
      return [3, 5, 4, 7, 9, 8, 11, 14]; // gentle rise
    case "corum":
      return [10, 9, 11, 10, 12, 11, 10, 11]; // mostly flat
    case "counsel":
      return [7, 8, 6, 9, 5, 11, 7, 13]; // jagged
    case "canemate":
      return [2, 4, 7, 10, 14, 18, 21, 24]; // strong upward
    case "realstyler":
      return [12, 11, 13, 10, 14, 9, 12, 8]; // downtrend
    case "realtelligence":
      return [-3, -1, 0, 2, 1, 3, 4, 6]; // negatives -> normalized
    default:
      return [4, 4, 4, 4, 4, 4, 4, 4]; // generic = flat
  }
}

type VenturePreviewRow = {
  id: string;
  slug: string;
  name: string;
  accent_color: string;
  mark_slug: VentureMarkSlug;
};

function VenturePreviewBlock({
  ventures,
  themeLabel,
}: {
  ventures: VenturePreviewRow[];
  themeLabel: "light" | "dark";
}) {
  return (
    <div
      className={
        themeLabel === "dark"
          ? "dark space-y-8 border border-rule bg-paper p-6 text-ink"
          : "space-y-8 border border-rule p-6"
      }
    >
      <h2 className="font-mono text-xs uppercase tracking-wide text-ink-mute">
        {themeLabel} mode
      </h2>

      {/* Edge-case panel up top so visual diff catches regressions */}
      <section className="space-y-4">
        <h3 className="font-mono text-xs uppercase tracking-wide text-ink-faint">
          Sparkline edge cases
        </h3>
        <table className="text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-3 py-1 font-medium text-ink-mute">Case</th>
              <th className="px-3 py-1 font-medium text-ink-mute">Render</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-1 font-mono text-xs">empty</td>
              <td className="px-3 py-1">
                <Sparkline data={[]} accentColor="#1F3A5F" />
                <span className="ml-2 text-xs text-ink-faint">
                  (renders nothing)
                </span>
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1 font-mono text-xs">single point</td>
              <td className="px-3 py-1">
                <Sparkline data={[5]} accentColor="#1F3A5F" />
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1 font-mono text-xs">flat (all 7)</td>
              <td className="px-3 py-1">
                <Sparkline data={[7, 7, 7, 7, 7, 7, 7, 7]} accentColor="#1F3A5F" />
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1 font-mono text-xs">all zero</td>
              <td className="px-3 py-1">
                <Sparkline data={[0, 0, 0, 0, 0, 0, 0, 0]} accentColor="#1F3A5F" />
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1 font-mono text-xs">negative</td>
              <td className="px-3 py-1">
                <Sparkline data={[-5, -2, 0, 1, -3, 2, 4, -1]} accentColor="#1F3A5F" />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* StateDot states */}
      <section className="space-y-3">
        <h3 className="font-mono text-xs uppercase tracking-wide text-ink-faint">
          StateDot states
        </h3>
        <div className="flex items-center gap-6 text-sm">
          {STATE_SEQUENCE.map((s) => (
            <span key={s} className="flex items-center gap-2 text-ink-mute">
              <StateDot state={s} accentColor="#1F3A5F" />
              <span className="font-mono text-xs">{s}</span>
            </span>
          ))}
        </div>
      </section>

      {/* ConnectionChip rendering */}
      <section className="space-y-3">
        <h3 className="font-mono text-xs uppercase tracking-wide text-ink-faint">
          ConnectionChip
        </h3>
        <div className="flex items-center gap-2">
          {SAMPLE_PROVIDERS.map((p) => (
            <ConnectionChip key={p} provider={p} dimmed={p === "none"} />
          ))}
        </div>
      </section>

      {/* Venture grid — every mark at every used size + sparkline + stripe */}
      <section className="space-y-4">
        <h3 className="font-mono text-xs uppercase tracking-wide text-ink-faint">
          Per-venture identity grid
        </h3>
        <ul className="divide-y divide-rule border border-rule">
          {ventures.map((v) => (
            <li
              key={v.id}
              className="flex items-stretch gap-4"
              style={{ minHeight: "64px" }}
            >
              <VentureStripe accentColor={v.accent_color} />
              <div className="flex flex-1 items-center gap-6 px-4 py-3">
                <div
                  className="flex items-center gap-3"
                  style={{ color: v.accent_color }}
                >
                  <VentureMark slug={v.mark_slug} size={16} />
                  <VentureMark slug={v.mark_slug} size={22} />
                  <VentureMark slug={v.mark_slug} size={34} />
                </div>
                <div className="min-w-[140px] space-y-0.5">
                  <p className="text-sm font-medium text-ink">{v.name}</p>
                  <p className="font-mono text-xs text-ink-mute">
                    {v.slug} · <span style={{ color: v.accent_color }}>{v.accent_color}</span>
                  </p>
                </div>
                <div style={{ color: v.accent_color }}>
                  <Sparkline data={sparkData(v.slug)} />
                </div>
                <div className="flex items-center gap-2">
                  <StateDot
                    state="active"
                    accentColor={v.accent_color}
                    ariaLabel={`${v.name} active`}
                  />
                  <StateDot
                    state="idle"
                    accentColor={v.accent_color}
                    ariaLabel={`${v.name} idle`}
                  />
                  <StateDot
                    state="quiet"
                    accentColor={v.accent_color}
                    ariaLabel={`${v.name} quiet`}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <ConnectionChip provider="stripe" />
                  <ConnectionChip provider="resend" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default async function IdentityPreviewPage() {
  await requireAdminContext();

  const liveVentures = await listVentures();

  // Synthesize a "generic fallback" demo row even if no venture in DB
  // uses mark_slug='generic', so the showcase always covers all seven
  // marks (six known + generic).
  const knownSlugs = new Set(Object.keys(MARKS));
  const genericPresent = liveVentures.some((v) => v.mark_slug === "generic");
  const ventures: VenturePreviewRow[] = liveVentures
    .filter((v) => knownSlugs.has(v.mark_slug))
    .map((v) => ({
      id: v.id,
      slug: v.slug,
      name: v.name,
      accent_color: v.accent_color,
      mark_slug: v.mark_slug as VentureMarkSlug,
    }));
  if (!genericPresent) {
    ventures.push({
      id: "synthetic-generic",
      slug: "synthetic-generic",
      name: "(generic fallback)",
      accent_color: "#595959",
      mark_slug: "generic",
    });
  }

  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
          Identity preview
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
        <p className="pt-2 text-sm text-ink-mute">
          Sprint 7 / experience layer reference. All six ventures × five
          identity components, light + dark. Edge cases for{" "}
          <span className="font-mono">Sparkline</span> at the top of each
          panel. Admin-only.
        </p>
      </header>

      <VenturePreviewBlock ventures={ventures} themeLabel="light" />
      <VenturePreviewBlock ventures={ventures} themeLabel="dark" />
    </div>
  );
}
