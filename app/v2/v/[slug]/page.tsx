import Link from "next/link";

import { AutonomyPill, bridgeStateToAutonomy } from "@/components/v2/AutonomyPill";
import { requireVentureAccess } from "@/lib/auth/guard";
import { listBridgeTiles } from "@/lib/db/bridge";
import { listDocumentsByVenture } from "@/lib/db/documents";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Specialist agent mapping per sprint spec
const SPECIALIST_MAP: Record<string, { name: string; category: string }> = {
  "office-hours": { name: "Strategist", category: "Strategy" },
  "adversarial-strategy": { name: "Strategist (critic)", category: "Strategy" },
  "content-writer": { name: "Storyteller", category: "Content" },
  "content-critic": { name: "Storyteller (critic)", category: "Content" },
  "support-triage": { name: "Operator (support)", category: "Operations" },
  "support-replier": { name: "Operator (support)", category: "Operations" },
  "intel-scout": { name: "Analyst", category: "Strategy" },
  "intel-critic": { name: "Analyst (critic)", category: "Strategy" },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: `${slug} — SoloDesk v2` };
}

export default async function V2VentureDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { venture, user } = await requireVentureAccess(slug);

  // Fetch in parallel
  const supabase = createSupabaseAdminClient();

  const [tilesResult, pendingDocs, recentDocs, loopRunsResult] =
    await Promise.all([
      listBridgeTiles({ userId: user.userId, isAdmin: user.isAdmin }),
      // Pending decisions for "Now"
      listDocumentsByVenture({
        ventureId: venture.id,
        type: "decision",
        status: ["draft", "reviewing"],
        limit: 5,
      }),
      // Recent approved for overview count
      listDocumentsByVenture({
        ventureId: venture.id,
        status: "approved",
        limit: 100,
      }),
      // Recent loop runs for Team section
      supabase
        .from("loop_runs")
        .select("loop_name, status, ts")
        .eq("venture_id", venture.id)
        .order("ts", { ascending: false })
        .limit(50),
    ]);

  const tile = tilesResult.ok
    ? tilesResult.tiles.find((t) => t.slug === slug)
    : null;
  const autonomy = tile ? bridgeStateToAutonomy(tile.state) : "Advise";

  // Overview counts
  const totalDecisions = recentDocs.length;
  const pendingCount = pendingDocs.length;

  // Loop runs by skill for Team section
  const runsBySkill = new Map<
    string,
    { lastRun: string; status: string; totalRuns: number }
  >();
  for (const run of loopRunsResult.data ?? []) {
    if (!runsBySkill.has(run.loop_name)) {
      runsBySkill.set(run.loop_name, {
        lastRun: run.ts,
        status: run.status,
        totalRuns: 0,
      });
    }
    runsBySkill.get(run.loop_name)!.totalRuns++;
  }

  // Enabled loops from venture.loops_enabled
  const loopsEnabled: string[] = Array.isArray(venture.loops_enabled)
    ? (venture.loops_enabled as string[])
    : typeof venture.loops_enabled === "object" && venture.loops_enabled
      ? Object.keys(venture.loops_enabled as Record<string, unknown>)
      : [];

  // Build team members — all known skills, filtered to enabled
  const teamMembers = Object.entries(SPECIALIST_MAP)
    .filter(
      ([loopName]) =>
        loopsEnabled.length === 0 || loopsEnabled.includes(loopName),
    )
    .map(([loopName, info]) => ({
      loopName,
      ...info,
      runInfo: runsBySkill.get(loopName) ?? null,
    }));

  // For "Now" section — use pending decisions
  const nowItems = pendingDocs.slice(0, 5);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "40px 32px" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 36,
        }}
      >
        <div>
          <p
            style={{
              fontSize: 12,
              color: "#999",
              margin: "0 0 6px",
            }}
          >
            <Link
              href="/v2"
              style={{ color: "#2563EB", textDecoration: "none" }}
            >
              Portfolio
            </Link>{" "}
            /
          </p>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "#0A0A0A",
              margin: "0 0 8px",
              letterSpacing: "-0.03em",
            }}
          >
            {venture.name}
          </h1>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <AutonomyPill mode={autonomy} />
            <span
              style={{
                fontSize: 12,
                color: "#999",
                textTransform: "capitalize",
              }}
            >
              {venture.phase}
            </span>
          </div>
        </div>

        {/* Primary action */}
        <Link
          href={`/ventures/${slug}/office-hours`}
          style={{
            padding: "10px 20px",
            background: "#2563EB",
            color: "#fff",
            textDecoration: "none",
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Ask Strategist
        </Link>
      </header>

      {/* Four anchored sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        {/* OVERVIEW */}
        <section>
          <SectionHeader title="Overview" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <MetricCard label="Approved decisions" value={String(totalDecisions)} />
            <MetricCard label="Pending review" value={String(pendingCount)} />
            <MetricCard
              label="Connections"
              value={String(tile?.connections.length ?? 0)}
            />
            <MetricCard
              label="Phase"
              value={venture.phase}
              style={{ textTransform: "capitalize" }}
            />
          </div>
          {venture.north_star && (
            <p
              style={{
                marginTop: 12,
                fontSize: 13,
                color: "#525252",
                fontStyle: "italic",
              }}
            >
              North star: {venture.north_star}
            </p>
          )}
        </section>

        {/* ROADMAP */}
        <section>
          <SectionHeader title="Roadmap" />
          <div
            style={{
              border: "1px solid #EAEAEA",
              borderRadius: 4,
              padding: "16px 20px",
            }}
          >
            <p style={{ fontSize: 13, color: "#525252", margin: 0 }}>
              Phase: <strong style={{ color: "#0A0A0A", textTransform: "capitalize" }}>{venture.phase}</strong>
            </p>
            {venture.north_star && (
              <p style={{ fontSize: 13, color: "#525252", marginTop: 6 }}>
                North star: {venture.north_star}
              </p>
            )}
            <p
              style={{
                fontSize: 12,
                color: "#999",
                marginTop: 12,
              }}
            >
              Sprint-level roadmap items ship in Sprint D.2 when the roadmap_items table lands.
            </p>
          </div>
        </section>

        {/* NOW */}
        <section>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <SectionHeader title="Now" inline />
            <Link
              href={`/ventures/${slug}/decisions`}
              style={{ fontSize: 12, color: "#2563EB", textDecoration: "none" }}
            >
              View all
            </Link>
          </div>

          {nowItems.length === 0 ? (
            <p style={{ fontSize: 13, color: "#999" }}>No pending decisions.</p>
          ) : (
            <div
              style={{
                border: "1px solid #EAEAEA",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              {nowItems.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderBottom: "1px solid #EAEAEA",
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#0A0A0A",
                        margin: 0,
                      }}
                    >
                      {doc.title}
                    </p>
                    <p style={{ fontSize: 12, color: "#999", margin: "2px 0 0" }}>
                      {doc.loop_name} · {doc.status}
                    </p>
                  </div>
                  <Link
                    href={`/v2/v/${slug}/d/${doc.id}`}
                    style={{
                      fontSize: 12,
                      color: "#2563EB",
                      textDecoration: "none",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Review →
                  </Link>
                </div>
              ))}
            </div>
          )}

          {/* Start a new session */}
          <div
            style={{
              marginTop: 14,
              padding: "14px 16px",
              background: "#FAFAFA",
              border: "1px solid #EAEAEA",
              borderRadius: 4,
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <form
              action={`/ventures/${slug}/office-hours`}
              style={{ flex: 1, display: "flex", gap: 10 }}
            >
              <input
                name="redirect_to"
                type="hidden"
                value={`/v2/v/${slug}`}
              />
              <input
                name="question"
                placeholder={`Ask a question about ${venture.name}…`}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  fontSize: 13,
                  border: "1px solid #EAEAEA",
                  borderRadius: 4,
                  outline: "none",
                  background: "#fff",
                }}
              />
              <Link
                href={`/ventures/${slug}/office-hours`}
                style={{
                  padding: "8px 16px",
                  background: "#2563EB",
                  color: "#fff",
                  textDecoration: "none",
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                Start session →
              </Link>
            </form>
          </div>
        </section>

        {/* TEAM */}
        <section>
          <SectionHeader title="Team" />
          <div
            style={{
              border: "1px solid #EAEAEA",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            {teamMembers.length === 0 ? (
              <p style={{ fontSize: 13, color: "#999", padding: "12px 16px" }}>
                No agents enabled for this venture.
              </p>
            ) : (
              teamMembers.map((member) => (
                <div
                  key={member.loopName}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderBottom: "1px solid #EAEAEA",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#0A0A0A",
                        margin: 0,
                      }}
                    >
                      {member.name}
                    </p>
                    <p style={{ fontSize: 12, color: "#999", margin: "2px 0 0" }}>
                      {member.category} · {member.loopName}
                    </p>
                  </div>
                  <AutonomyPill
                    mode={
                      member.runInfo
                        ? member.runInfo.status === "succeeded"
                          ? "Operate"
                          : "Advise"
                        : "Advise"
                    }
                  />
                  {member.runInfo ? (
                    <span style={{ fontSize: 11, color: "#999", width: 80, textAlign: "right" }}>
                      {formatRelative(member.runInfo.lastRun)}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: "#999", width: 80, textAlign: "right" }}>
                      never
                    </span>
                  )}
                  <Link
                    href={`/v2/workflows`}
                    style={{ fontSize: 12, color: "#2563EB", textDecoration: "none" }}
                  >
                    →
                  </Link>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  inline,
}: {
  title: string;
  inline?: boolean;
}) {
  const el = (
    <h2
      style={{
        fontSize: 11,
        fontWeight: 500,
        color: "#999",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        margin: 0,
      }}
    >
      {title}
    </h2>
  );
  if (inline) return el;
  return <div style={{ marginBottom: 12 }}>{el}</div>;
}

function MetricCard({
  label,
  value,
  style: extraStyle,
}: {
  label: string;
  value: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        padding: "16px 18px",
        border: "1px solid #EAEAEA",
        borderRadius: 4,
        background: "#FAFAFA",
      }}
    >
      <p
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: "#0A0A0A",
          margin: "0 0 4px",
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          ...extraStyle,
        }}
      >
        {value}
      </p>
      <p style={{ fontSize: 11, color: "#999", margin: 0, fontWeight: 500 }}>
        {label}
      </p>
    </div>
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
