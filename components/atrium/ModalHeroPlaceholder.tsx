"use client";

// Placeholder hero for archetypes requiring a visual library asset (not yet commissioned).
// Fills the top third of the modal, edge-to-edge.

type Props = {
  archetype: string;
  className?: string;
};

export function ModalHeroPlaceholder({ archetype, className }: Props) {
  return (
    <div
      className={className}
      style={{
        background: "var(--color-paper, #F7F6F1)",
        borderBottom: "1px solid var(--color-rule, #E5E3DB)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 180,
        userSelect: "none",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 11,
          color: "var(--color-ink-faint, #8C8C8C)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {archetype}
      </span>
    </div>
  );
}

// Placeholder for data-visual heroes (Insight, Alert, Promotion archetypes).
export function ModalChartPlaceholder({ label }: { label: string }) {
  return (
    <div
      style={{
        background: "var(--color-paper, #F7F6F1)",
        borderBottom: "1px solid var(--color-rule, #E5E3DB)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 180,
        gap: 8,
        userSelect: "none",
      }}
    >
      {/* Minimal chart silhouette */}
      <svg width={120} height={48} viewBox="0 0 120 48" fill="none">
        <polyline
          points="0,40 20,30 40,35 60,20 80,25 100,10 120,15"
          stroke="var(--color-rule-strong, #C4C2B7)"
          strokeWidth={1.5}
          fill="none"
        />
        <line x1={0} y1={47} x2={120} y2={47} stroke="var(--color-rule, #E5E3DB)" />
      </svg>
      <span
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 11,
          color: "var(--color-ink-faint, #8C8C8C)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}
