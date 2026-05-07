// StreamingSection — renders a single Section (live or static) plus any
// critic comments anchored to it.
//
// State pill semantics (per design-system.md streaming-sections section):
//   drafting -> ready -> critic_reviewing -> resolved

import type { CommentView, SectionView } from "./StreamingDocument";

const KIND_LABELS: Record<string, string> = {
  recommendation: "Recommendation",
  alternatives: "Alternatives",
  kill_criteria: "Kill criteria",
  evidence: "Evidence",
  risk: "Risk",
  agent_note: "Agent note",
  prose: "Prose",
};

export type StreamingSectionProps = {
  section: SectionView;
  comments: CommentView[];
};

export function StreamingSection({ section, comments }: StreamingSectionProps) {
  const label = KIND_LABELS[section.kind] ?? section.kind;
  return (
    <section
      data-section
      data-kind={section.kind}
      data-status={section.status}
      className="border border-rule bg-paper-card p-4"
    >
      <header className="flex items-center justify-between gap-3 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink-mute">
          {label}
        </h2>
        <StatusPill status={section.status} />
      </header>
      {section.body.length === 0 ? (
        <p className="text-sm italic text-ink-faint">Drafting…</p>
      ) : (
        <p className="whitespace-pre-wrap text-[14px] leading-[1.55] text-ink">
          {section.body}
        </p>
      )}
      {comments.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-rule pt-3">
          {comments.map((c, i) => (
            <li key={i} className="text-[13px] text-ink-mute">
              <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                Critic · {c.evidenceRef}
              </span>
              <p className="pt-0.5">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: SectionView["status"] }) {
  const text = status.replace("_", " ");
  return (
    <span
      data-status={status}
      className="border border-rule px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-mute"
    >
      {text}
    </span>
  );
}
