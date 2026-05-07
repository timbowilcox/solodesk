import { cn } from "@/lib/utils";

import type { SectionRow } from "../section";

const SEVERITY_CLASS = {
  positive: "text-positive",
  caution: "text-caution",
  negative: "text-negative",
  neutral: "text-ink",
} as const;

type Metric = {
  label: string;
  value: string;
  delta?: string;
  severity?: keyof typeof SEVERITY_CLASS;
};

export function MetricBlockSection({
  section,
}: {
  section: SectionRow;
  editable: boolean;
}) {
  const content = section.content as { metrics?: Metric[] } | null;
  const metrics = Array.isArray(content?.metrics) ? content.metrics : [];

  if (metrics.length === 0) {
    return <p className="text-sm italic text-ink-faint">(no metrics)</p>;
  }

  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
      {metrics.map((m, idx) => (
        <div key={idx} className="space-y-1">
          <dt className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            {m.label}
          </dt>
          <dd
            className={cn(
              "tabular text-2xl font-medium leading-none",
              m.severity ? SEVERITY_CLASS[m.severity] : "text-ink",
            )}
          >
            {m.value}
          </dd>
          {m.delta && (
            <p className="font-mono text-xs text-ink-mute">{m.delta}</p>
          )}
        </div>
      ))}
    </dl>
  );
}
