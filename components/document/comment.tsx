import { cn } from "@/lib/utils";

import type { Tables } from "@/lib/supabase/types";

export type CommentRow = Tables<"comments">;

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  open: { label: "OPEN", cls: "bg-info-bg text-info" },
  accepted: { label: "ACCEPTED", cls: "bg-positive-bg text-positive" },
  dismissed: { label: "DISMISSED", cls: "text-ink-faint" },
  replied: { label: "REPLIED", cls: "bg-info-bg text-info" },
};

function authorTag(author: string): string {
  // 'tim' -> 'tim'; 'agent:adversarial-strategy' -> 'crt' for critics, 'agt' for others
  if (author === "tim") return "tim";
  if (author.startsWith("agent:")) {
    if (author.includes("critic") || author.includes("adversarial")) return "crt";
    return "agt";
  }
  return author.slice(0, 3).toLowerCase();
}

function authorTooltip(author: string): string {
  if (author === "tim") return "Tim Wilcox";
  if (author.startsWith("agent:")) return author.slice("agent:".length);
  return author;
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString("en-AU", { month: "short", day: "2-digit" });
}

type EvidencePointer = {
  kind?: string;
  ref?: string;
  label?: string;
};

function isEvidence(value: unknown): value is EvidencePointer[] {
  return (
    Array.isArray(value) &&
    value.every(
      (e) =>
        e !== null &&
        typeof e === "object" &&
        ("kind" in e || "ref" in e || "label" in e),
    )
  );
}

const EVIDENCE_KIND_LABEL: Record<string, string> = {
  anti_pattern: "anti-pattern",
  memory_hit: "memory",
  prior_decision: "prior decision",
  url: "url",
  first_principles: "first principles",
};

export function Comment({ comment }: { comment: CommentRow }) {
  const tag = authorTag(comment.author);
  const tooltip = authorTooltip(comment.author);
  const badge = STATUS_BADGE[comment.status];
  const evidence = isEvidence(comment.evidence) ? comment.evidence : [];

  return (
    <div className="space-y-2 border-l-2 border-rule pl-4 py-1">
      <div className="flex items-baseline gap-3 text-xs">
        <span className="font-mono text-ink-mute" title={tooltip}>
          {tag}
        </span>
        <span className="font-mono text-ink-faint">
          {formatTs(comment.created_at)}
        </span>
        {badge && comment.status !== "open" && (
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
      <p className="whitespace-pre-wrap text-sm leading-[1.55] text-ink">
        {comment.body}
      </p>
      {evidence.length > 0 && (
        <ul className="space-y-1">
          {evidence.map((e, idx) => {
            const kind = e.kind ?? "";
            const kindLabel = EVIDENCE_KIND_LABEL[kind] ?? kind;
            return (
              <li
                key={idx}
                className="font-mono text-xs text-ink-mute"
              >
                <span className="text-ink-faint">{kindLabel}: </span>
                {e.label ? (
                  <>
                    {e.label}
                    {e.ref ? <span className="text-ink-faint"> ({e.ref})</span> : null}
                  </>
                ) : (
                  e.ref
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
