import { requireUserContext } from "@/lib/auth/guard";
import { listBridgeTiles } from "@/lib/db/bridge";
import { listVentures } from "@/lib/db/ventures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AutonomyPill } from "@/components/v2/AutonomyPill";

export const metadata = {
  title: "Workflows — SoloDesk v2",
};

// All known loops with specialist agent names per sprint spec
const WORKFLOWS = [
  {
    id: "office-hours",
    name: "Strategist",
    skill: "office-hours",
    description: "Six-question reframe for strategic decisions. Produces a Decision Document with recommendation, alternatives, kill criteria, evidence, and risk.",
    category: "Strategy",
    budget: "$1.00 / run",
  },
  {
    id: "adversarial-strategy",
    name: "Strategist (critic)",
    skill: "adversarial-strategy",
    description: "Adversarial review of Decision Documents. Anchors comments to specific Sections with evidence pointers.",
    category: "Strategy",
    budget: "$0.50 / run",
  },
  {
    id: "intel-scout",
    name: "Analyst",
    skill: "intel-scout",
    description: "Weekly competitive and market intelligence scan across configured sources. Tags signals as threat, opportunity, or noise.",
    category: "Strategy",
    budget: "$2.00 / venture / week",
  },
  {
    id: "intel-critic",
    name: "Analyst (critic)",
    skill: "intel-critic",
    description: "Kills noise misclassified as signal. Demotes low-evidence signals. Flags real ones the scout under-rated.",
    category: "Strategy",
    budget: "$0.50 / run",
  },
  {
    id: "content-writer",
    name: "Storyteller",
    skill: "content-writer",
    description: "Drafts content (posts, emails, threads) from a brief. Loads venture voice from COMPANY.md.",
    category: "Content",
    budget: "$0.60 / draft",
  },
  {
    id: "content-critic",
    name: "Storyteller (critic)",
    skill: "content-critic",
    description: "Reviews content against ICP, voice, and COMPANY.md anti-patterns. Anchors comments to specific paragraphs.",
    category: "Content",
    budget: "$0.25 / review",
  },
  {
    id: "support-triage",
    name: "Operator (triage)",
    skill: "support-triage",
    description: "Classifies inbound support tickets as bug, question, churn-risk, feature-request, spam, or unclear. Fast Haiku-based classifier.",
    category: "Operations",
    budget: "$0.05 / ticket",
  },
  {
    id: "support-replier",
    name: "Operator (reply)",
    skill: "support-replier",
    description: "Drafts replies to support tickets using ticket context and venture COMPANY.md. Reply requires explicit operator approval before send.",
    category: "Operations",
    budget: "$0.40 / draft",
  },
] as const;

const CATEGORIES = ["Strategy", "Content", "Operations"] as const;

export default async function V2WorkflowsPage() {
  const user = await requireUserContext();
  const supabase = createSupabaseAdminClient();

  const [ventures, tilesResult, recentRunsResult] = await Promise.all([
    listVentures(),
    listBridgeTiles({ userId: user.userId, isAdmin: user.isAdmin }),
    supabase
      .from("loop_runs")
      .select("loop_name, status, ts, venture_id")
      .order("ts", { ascending: false })
      .limit(200),
  ]);

  const tiles = tilesResult.ok ? tilesResult.tiles : [];

  // Build per-skill stats
  const runsBySkill = new Map<
    string,
    { total: number; lastRun: string; succeeded: number; failed: number }
  >();
  for (const run of recentRunsResult.data ?? []) {
    const existing = runsBySkill.get(run.loop_name);
    if (!existing) {
      runsBySkill.set(run.loop_name, {
        total: 1,
        lastRun: run.ts,
        succeeded: run.status === "succeeded" ? 1 : 0,
        failed: run.status === "failed" ? 1 : 0,
      });
    } else {
      existing.total++;
      if (run.status === "succeeded") existing.succeeded++;
      if (run.status === "failed") existing.failed++;
    }
  }

  // Count ventures with each skill enabled
  const venturesBySkill = new Map<string, string[]>();
  for (const v of ventures) {
    const enabled: string[] = Array.isArray(v.loops_enabled)
      ? (v.loops_enabled as string[])
      : [];
    for (const skill of enabled) {
      const existing = venturesBySkill.get(skill) ?? [];
      existing.push(v.slug);
      venturesBySkill.set(skill, existing);
    }
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "40px 32px" }}>
      <header style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: "#0A0A0A",
            margin: 0,
            letterSpacing: "-0.03em",
          }}
        >
          Workflows
        </h1>
        <p style={{ fontSize: 13, color: "#999", margin: "4px 0 0" }}>
          {WORKFLOWS.length} skills across {CATEGORIES.length} categories
        </p>
      </header>

      {CATEGORIES.map((category) => {
        const categoryWorkflows = WORKFLOWS.filter(
          (w) => w.category === category,
        );
        return (
          <section key={category} style={{ marginBottom: 40 }}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "#999",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                margin: "0 0 12px",
              }}
            >
              {category}
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {categoryWorkflows.map((workflow) => {
                const stats = runsBySkill.get(workflow.skill);
                const scopedVentures = venturesBySkill.get(workflow.skill) ?? [];
                const allTileStates = tiles.filter((t) =>
                  scopedVentures.includes(t.slug),
                );
                const hasActiveVenture = allTileStates.some(
                  (t) => t.state === "active",
                );
                const autonomy = hasActiveVenture ? "Operate" : "Advise";

                return (
                  <div
                    key={workflow.id}
                    style={{
                      border: "1px solid #EAEAEA",
                      borderRadius: 4,
                      padding: "18px 20px",
                      background: "#FAFAFA",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <p
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                            color: "#0A0A0A",
                            margin: 0,
                          }}
                        >
                          {workflow.name}
                        </p>
                        <p
                          style={{
                            fontSize: 11,
                            color: "#999",
                            margin: "2px 0 0",
                            fontFamily: "monospace",
                          }}
                        >
                          {workflow.skill}
                        </p>
                      </div>
                      <AutonomyPill mode={autonomy} />
                    </div>
                    <p
                      style={{
                        fontSize: 12,
                        color: "#525252",
                        margin: "0 0 12px",
                        lineHeight: 1.5,
                      }}
                    >
                      {workflow.description}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      {stats ? (
                        <>
                          <span style={{ fontSize: 11, color: "#999" }}>
                            {stats.total} runs
                          </span>
                          <span style={{ fontSize: 11, color: "#999" }}>
                            {formatRelative(stats.lastRun)}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: "#999" }}>
                          no runs yet
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: "#999" }}>
                        {workflow.budget}
                      </span>
                      {scopedVentures.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {scopedVentures.slice(0, 3).map((slug) => (
                            <span
                              key={slug}
                              style={{
                                padding: "1px 6px",
                                background: "#EFF6FF",
                                color: "#1D4ED8",
                                fontSize: 10,
                                fontWeight: 500,
                                borderRadius: 99,
                                border: "1px solid #BFDBFE",
                              }}
                            >
                              {slug}
                            </span>
                          ))}
                          {scopedVentures.length > 3 && (
                            <span style={{ fontSize: 10, color: "#999" }}>
                              +{scopedVentures.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
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
