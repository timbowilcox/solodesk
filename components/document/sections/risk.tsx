import { cn } from "@/lib/utils";

import type { SectionRow } from "../section";

const SEVERITY_BADGE = {
  low: { label: "LOW", cls: "bg-info-bg text-info" },
  medium: { label: "MEDIUM", cls: "bg-caution-bg text-caution" },
  high: { label: "HIGH", cls: "bg-negative-bg text-negative" },
} as const;

export function RiskSection({
  section,
}: {
  section: SectionRow;
  editable: boolean;
}) {
  const content = section.content as {
    text?: string;
    severity?: keyof typeof SEVERITY_BADGE;
    mitigation?: string;
  } | null;
  const text = content?.text ?? "";
  const severity = content?.severity;
  const mitigation = content?.mitigation ?? "";

  if (!text && !mitigation) {
    return <p className="text-sm italic text-ink-faint">(empty)</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        {severity && SEVERITY_BADGE[severity] && (
          <span
            className={cn(
              "shrink-0 px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide",
              SEVERITY_BADGE[severity].cls,
            )}
          >
            {SEVERITY_BADGE[severity].label}
          </span>
        )}
        {text && (
          <p className="whitespace-pre-wrap text-md leading-[1.55] text-ink">
            {text}
          </p>
        )}
      </div>
      {mitigation && (
        <div className="space-y-1 border-l-2 border-rule pl-4">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Mitigation
          </p>
          <p className="whitespace-pre-wrap text-base leading-[1.55] text-ink">
            {mitigation}
          </p>
        </div>
      )}
    </div>
  );
}
