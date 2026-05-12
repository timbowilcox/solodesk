// Maps bridge tile state → autonomy display mode for v2.
// Advise = agent suggests but doesn't act (idle/quiet ventures)
// Operate = agent runs loops actively (active state)
// Steward = agent monitors and maintains (fallback)

export type AutonomyMode = "Advise" | "Operate" | "Steward";

const PILL_STYLES: Record<AutonomyMode, { bg: string; color: string }> = {
  Advise: { bg: "#FEE2E2", color: "#991B1B" },
  Operate: { bg: "#DBEAFE", color: "#1D4ED8" },
  Steward: { bg: "#DCFCE7", color: "#166534" },
};

export function bridgeStateToAutonomy(state: string): AutonomyMode {
  if (state === "active") return "Operate";
  if (state === "idle") return "Advise";
  return "Steward";
}

export function AutonomyPill({ mode }: { mode: AutonomyMode }) {
  const s = PILL_STYLES[mode];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 99,
        background: s.bg,
        color: s.color,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.02em",
      }}
    >
      {mode}
    </span>
  );
}
