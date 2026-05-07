import { cn } from "@/lib/utils";
import type {
  SectionKind,
  SectionStatus,
  Tables,
} from "@/lib/supabase/types";

import { Comment, type CommentRow } from "./comment";
import { ProseSection } from "./sections/prose";
import { RecommendationSection } from "./sections/recommendation";
import { EvidenceSection } from "./sections/evidence";
import { RiskSection } from "./sections/risk";
import { AgentNoteSection } from "./sections/agent-note";
import { AlternativesSection } from "./sections/alternatives";
import { KillCriteriaSection } from "./sections/kill-criteria";
import { MetricBlockSection } from "./sections/metric-block";
import { ContentBlockSection } from "./sections/content-block";
import { IntelSignalsTableSection } from "./sections/intel-signals-table";
import { SupportReplyBlockSection } from "./sections/support-reply-block";

const KIND_LABEL: Record<SectionKind, string> = {
  prose: "PROSE",
  recommendation: "RECOMMENDATION",
  alternatives: "ALTERNATIVES",
  kill_criteria: "KILL CRITERIA",
  evidence: "EVIDENCE",
  risk: "RISK",
  agent_note: "AGENT NOTE",
  comment_thread: "COMMENTS",
  metric_block: "METRICS",
  intel_signal: "SIGNAL",
  intel_signals_table: "SIGNALS",
  support_reply_block: "REPLY",
  content_block: "CONTENT",
};

export type SectionRow = Tables<"sections">;

export type SectionProps = {
  section: SectionRow;
  editable: boolean;
  comments?: CommentRow[];
};

const STATUS_BADGE: Partial<Record<SectionStatus, { label: string; cls: string }>> = {
  draft: { label: "DRAFT", cls: "bg-caution-bg text-caution" },
  reviewing: { label: "REVIEW", cls: "bg-info-bg text-info" },
  approved: { label: "APPROVED", cls: "bg-positive-bg text-positive" },
  revising: { label: "REVISING", cls: "bg-caution-bg text-caution" },
  rejected: { label: "REJECTED", cls: "bg-negative-bg text-negative" },
  dismissed: { label: "DISMISSED", cls: "text-ink-faint" },
};

export function Section({ section, editable, comments = [] }: SectionProps) {
  const label = KIND_LABEL[section.kind] ?? section.kind.toUpperCase();
  const badge = STATUS_BADGE[section.status];
  const visibleComments = comments.filter((c) => c.section_id === section.id);

  return (
    <section
      data-section-id={section.id}
      data-section-kind={section.kind}
      className="grid grid-cols-[60px_1fr] gap-6 border-b border-rule pb-8 last:border-b-0"
    >
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-faint">
          {label}
        </p>
        {badge && section.status !== "draft" && (
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide",
              badge.cls,
            )}
          >
            {badge.label}
          </span>
        )}
      </div>
      <div className="min-w-0 space-y-4">
        <SectionBody section={section} editable={editable} />
        {visibleComments.length > 0 && (
          <div className="space-y-3 pt-2">
            {visibleComments.map((c) => (
              <Comment key={c.id} comment={c} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SectionBody({ section, editable }: SectionProps) {
  switch (section.kind) {
    case "prose":
      return <ProseSection section={section} editable={editable} />;
    case "recommendation":
      return <RecommendationSection section={section} editable={editable} />;
    case "alternatives":
      return <AlternativesSection section={section} editable={editable} />;
    case "kill_criteria":
      return <KillCriteriaSection section={section} editable={editable} />;
    case "evidence":
      return <EvidenceSection section={section} editable={editable} />;
    case "risk":
      return <RiskSection section={section} editable={editable} />;
    case "agent_note":
      return <AgentNoteSection section={section} editable={editable} />;
    case "metric_block":
      return <MetricBlockSection section={section} editable={editable} />;
    case "content_block":
      return <ContentBlockSection section={section} editable={editable} />;
    case "intel_signals_table":
      return <IntelSignalsTableSection section={section} editable={editable} />;
    case "support_reply_block":
      return <SupportReplyBlockSection section={section} editable={editable} />;
    default:
      return (
        <p className="text-sm italic text-ink-mute">
          Section kind {section.kind} not yet implemented in the renderer.
        </p>
      );
  }
}
