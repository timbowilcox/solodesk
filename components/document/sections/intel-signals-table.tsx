import { cn } from "@/lib/utils";

import type { SectionRow } from "../section";

const SEVERITY_BADGE = {
  low: { label: "LOW", cls: "bg-info-bg text-info" },
  medium: { label: "MEDIUM", cls: "bg-caution-bg text-caution" },
  high: { label: "HIGH", cls: "bg-negative-bg text-negative" },
} as const;

const TAG_BADGE = {
  threat: { label: "THREAT", cls: "bg-negative-bg text-negative" },
  opportunity: { label: "OPPORTUNITY", cls: "bg-positive-bg text-positive" },
  noise: { label: "NOISE", cls: "text-ink-faint" },
} as const;

const ACTION_LABEL = {
  continue_monitoring: "monitor",
  surface_to_strategy: "surface to strategy",
  kill: "kill",
  escalate: "escalate",
} as const;

export type IntelSignal = {
  source?: string;
  observation?: string;
  severity?: keyof typeof SEVERITY_BADGE;
  tag?: keyof typeof TAG_BADGE;
  suggested_action?: keyof typeof ACTION_LABEL;
  reasoning?: string;
};

export function IntelSignalsTableSection({
  section,
}: {
  section: SectionRow;
  editable: boolean;
}) {
  const content = section.content as { signals?: IntelSignal[] } | null;
  const signals = Array.isArray(content?.signals) ? content.signals : [];

  if (signals.length === 0) {
    return <p className="text-sm italic text-ink-faint">(no signals)</p>;
  }

  return (
    <table className="w-full text-base">
      <thead>
        <tr className="border-b border-rule text-left">
          <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
            #
          </th>
          <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
            Tag
          </th>
          <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
            Severity
          </th>
          <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
            Observation
          </th>
          <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
            Suggested
          </th>
        </tr>
      </thead>
      <tbody>
        {signals.map((s, idx) => {
          const tag = s.tag && TAG_BADGE[s.tag];
          const severity = s.severity && SEVERITY_BADGE[s.severity];
          const action = s.suggested_action && ACTION_LABEL[s.suggested_action];
          return (
            <tr
              key={idx}
              data-signal-index={idx}
              className="border-b border-rule align-top"
            >
              <td className="px-3 py-2 font-mono text-xs text-ink-faint">
                {idx + 1}
              </td>
              <td className="px-3 py-2">
                {tag && (
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide",
                      tag.cls,
                    )}
                  >
                    {tag.label}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                {severity && (
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide",
                      severity.cls,
                    )}
                  >
                    {severity.label}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="space-y-1">
                  <p className="text-base text-ink">{s.observation ?? ""}</p>
                  {s.source && (
                    <p className="font-mono text-xs text-ink-mute">
                      {s.source}
                    </p>
                  )}
                  {s.reasoning && (
                    <p className="text-sm italic text-ink-mute">
                      {s.reasoning}
                    </p>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-ink-mute">
                {action ?? "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
