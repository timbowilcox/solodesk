"use client";

import { useRef, useState } from "react";

import { resolveAgentNoteAction } from "@/app/(authed)/ventures/[slug]/decisions/actions";
import type { SectionRow } from "../section";

type AgentNoteContent = {
  question?: string;
  assumption?: string;
  decision?: string;        // legacy field: may hold LLM text on old-shape approved docs
  alternatives?: string;
  defer_count?: number;
};

function resolveLabel(section: SectionRow, content: AgentNoteContent): string | null {
  if (
    section.status === "approved" &&
    content.decision &&
    content.assumption &&
    content.decision === content.assumption
  ) {
    return "confirmed";
  }
  if (
    section.status === "approved" &&
    content.decision &&
    content.decision !== (content.assumption ?? "")
  ) {
    return "revised";
  }
  if (section.status === "deferred") {
    return "deferred";
  }
  return null;
}

export function AgentNoteSection({
  section,
  editable,
  ventureSlug,
  documentId,
}: {
  section: SectionRow;
  editable: boolean;
  ventureSlug?: string;
  documentId?: string;
}) {
  const content = section.content as AgentNoteContent | null;
  const question = content?.question ?? "";
  // Prefer assumption; fall back to decision for legacy approved Documents
  const assumption =
    content?.assumption ??
    (section.status === "approved" ? (content?.decision ?? "") : "");
  const alternatives = content?.alternatives ?? "";
  const deferCount = content?.defer_count ?? 0;

  const [showRevise, setShowRevise] = useState(false);
  const reviseRef = useRef<HTMLTextAreaElement>(null);

  const isResolved =
    section.status === "approved" ||
    section.status === "dismissed" ||
    section.status === "rejected";
  const isDeferred = section.status === "deferred";

  const label = resolveLabel(section, content ?? {});
  const canAct =
    editable &&
    ventureSlug &&
    documentId &&
    !isResolved &&
    !isDeferred;

  if (!question && !assumption) {
    return <p className="text-sm italic text-ink-faint">(empty)</p>;
  }

  return (
    <div className="space-y-3 border-l-2 border-caution pl-4">
      {question && (
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-wide text-caution">
            Ambiguity
          </p>
          <p className="whitespace-pre-wrap text-base leading-[1.55] text-ink">
            {question}
          </p>
        </div>
      )}
      {assumption && (
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Agent assumed
          </p>
          <p className="whitespace-pre-wrap text-base leading-[1.55] text-ink-mute">
            {assumption}
          </p>
        </div>
      )}
      {alternatives && (
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Alternatives considered
          </p>
          <p className="whitespace-pre-wrap text-base leading-[1.55] text-ink-mute">
            {alternatives}
          </p>
        </div>
      )}

      {/* Resolution state badge */}
      {label === "confirmed" && (
        <p className="font-mono text-xs text-positive">Confirmed</p>
      )}
      {label === "revised" && (
        <div className="space-y-1">
          <p className="font-mono text-xs text-positive">Revised</p>
          <p className="whitespace-pre-wrap text-sm leading-[1.55] text-ink">
            {content?.decision}
          </p>
        </div>
      )}
      {label === "deferred" && (
        <p className="font-mono text-xs text-caution">
          Deferred{deferCount > 1 ? ` (×${deferCount})` : ""}
        </p>
      )}

      {/* Action affordances — only on editable, unresolved, non-deferred sections */}
      {canAct && (
        <div className="pt-1">
          {!showRevise ? (
            <div className="flex items-center gap-4">
              <form action={resolveAgentNoteAction}>
                <input type="hidden" name="venture_slug" value={ventureSlug} />
                <input type="hidden" name="document_id" value={documentId} />
                <input type="hidden" name="section_id" value={section.id} />
                <input type="hidden" name="action_type" value="confirm" />
                <button
                  type="submit"
                  className="font-mono text-xs text-ink-mute underline-offset-2 hover:text-ink hover:underline"
                >
                  Confirm
                </button>
              </form>
              <button
                type="button"
                onClick={() => {
                  setShowRevise(true);
                  setTimeout(() => reviseRef.current?.focus(), 0);
                }}
                className="font-mono text-xs text-ink-mute underline-offset-2 hover:text-ink hover:underline"
              >
                Revise
              </button>
              <form action={resolveAgentNoteAction}>
                <input type="hidden" name="venture_slug" value={ventureSlug} />
                <input type="hidden" name="document_id" value={documentId} />
                <input type="hidden" name="section_id" value={section.id} />
                <input type="hidden" name="action_type" value="defer" />
                <button
                  type="submit"
                  className="font-mono text-xs text-ink-faint underline-offset-2 hover:text-ink-mute hover:underline"
                >
                  Defer
                </button>
              </form>
            </div>
          ) : (
            <form action={resolveAgentNoteAction} className="space-y-2">
              <input type="hidden" name="venture_slug" value={ventureSlug} />
              <input type="hidden" name="document_id" value={documentId} />
              <input type="hidden" name="section_id" value={section.id} />
              <input type="hidden" name="action_type" value="revise" />
              <textarea
                ref={reviseRef}
                name="decision_text"
                rows={3}
                placeholder="Your decision…"
                className="w-full rounded bg-paper-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="font-mono text-xs text-ink-mute underline-offset-2 hover:text-ink hover:underline"
                >
                  Save revision
                </button>
                <button
                  type="button"
                  onClick={() => setShowRevise(false)}
                  className="font-mono text-xs text-ink-faint underline-offset-2 hover:text-ink-mute hover:underline"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
