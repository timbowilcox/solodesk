import { cn } from "@/lib/utils";

import type { SectionRow } from "../section";

const CONFIDENCE_LABEL = {
  low: "low confidence",
  medium: "medium confidence",
  high: "high confidence",
} as const;

const CONFIDENCE_CLASS = {
  low: "text-caution",
  medium: "text-info",
  high: "text-positive",
} as const;

export function RecommendationSection({
  section,
}: {
  section: SectionRow;
  editable: boolean;
}) {
  const content = section.content as {
    text?: string;
    confidence?: keyof typeof CONFIDENCE_LABEL;
  } | null;
  const text = content?.text ?? "";
  const confidence = content?.confidence;

  return (
    <div className="space-y-3">
      {text ? (
        <p className="whitespace-pre-wrap text-md leading-[1.55] text-ink">
          {text}
        </p>
      ) : (
        <p className="text-sm italic text-ink-faint">(empty)</p>
      )}
      {confidence && CONFIDENCE_LABEL[confidence] && (
        <p
          className={cn(
            "font-mono text-xs uppercase tracking-wide",
            CONFIDENCE_CLASS[confidence],
          )}
        >
          {CONFIDENCE_LABEL[confidence]}
        </p>
      )}
    </div>
  );
}
