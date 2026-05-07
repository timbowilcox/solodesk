"use client";

// StreamingDocument — client component that subscribes to an SSE stream
// from /api/loops/[loopId]/invoke and renders Sections as they arrive.
//
// Two use cases:
//   1. Initial invocation: parent posts to the SSE endpoint; the response
//      stream is read here, and Sections appear in real time.
//   2. Resume / view-only: parent passes initial sections from the DB
//      (Document already in 'reviewing' / 'cancelled' / 'drafting_orphaned')
//      and no streamUrl — we render the static set.
//
// Pause: stops reading the SSE stream client-side; the server completes
// idempotently.
// Cancel: posts to /api/loops/runs/[runId]/cancel.

import { useEffect, useRef, useState } from "react";

import { StreamingSection } from "./StreamingSection";

export type SectionView = {
  id: string | null; // null until section_end (DB row not yet created)
  ord: number;
  kind: string;
  body: string;
  status: "drafting" | "ready" | "critic_reviewing" | "resolved";
};

export type CommentView = {
  sectionRef: string;
  evidenceRef: string;
  body: string;
};

export type StreamingDocumentProps = {
  documentId: string;
  documentTitle: string;
  /** Optional pre-existing sections (resume / view-only mode). */
  initialSections?: SectionView[];
  /** When set, the component fetches this URL and reads SSE. */
  streamRequest?: {
    url: string;
    body: Record<string, unknown>;
  };
  /** Required if streamRequest is set, so we can post to /cancel. */
  initialRunId?: string;
};

type SseEvent =
  | { type: "run_started"; runId: string; documentId: string }
  | { type: "section_start"; documentId: string; ord: number; sectionKind: string }
  | { type: "section_token"; documentId: string; ord: number; text: string }
  | { type: "section_end"; documentId: string; ord: number; sectionId: string }
  | {
      type: "comment_added";
      documentId: string;
      sectionRef: string;
      evidenceRef: string;
      body: string;
    }
  | { type: "done"; documentId: string; runId: string; status: string }
  | { type: "error"; runId: string; reason: string };

export function StreamingDocument({
  documentId,
  documentTitle,
  initialSections = [],
  streamRequest,
  initialRunId,
}: StreamingDocumentProps) {
  const [sections, setSections] = useState<SectionView[]>(initialSections);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [runId, setRunId] = useState<string | null>(initialRunId ?? null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!streamRequest) return;
    const controller = new AbortController();
    abortRef.current = controller;
    pausedRef.current = false;

    function handleSseEvent(event: SseEvent) {
      switch (event.type) {
        case "run_started":
          setRunId(event.runId);
          return;
        case "section_start":
          setSections((prev) => {
            if (prev.some((s) => s.ord === event.ord)) return prev;
            return [
              ...prev,
              {
                id: null,
                ord: event.ord,
                kind: event.sectionKind,
                body: "",
                status: "drafting",
              },
            ];
          });
          return;
        case "section_token":
          setSections((prev) =>
            prev.map((s) =>
              s.ord === event.ord ? { ...s, body: s.body + event.text } : s,
            ),
          );
          return;
        case "section_end":
          setSections((prev) =>
            prev.map((s) =>
              s.ord === event.ord
                ? { ...s, id: event.sectionId, status: "ready" }
                : s,
            ),
          );
          return;
        case "comment_added":
          setComments((prev) => [
            ...prev,
            {
              sectionRef: event.sectionRef,
              evidenceRef: event.evidenceRef,
              body: event.body,
            },
          ]);
          return;
        case "done":
          setStatus(event.status);
          return;
        case "error":
          setError(event.reason);
          return;
      }
    }

    void (async () => {
      try {
        const response = await fetch(streamRequest.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(streamRequest.body),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          setError(`SSE response error: ${response.status}`);
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffered = "";
        // SSE frames terminate with a blank line.
        while (!controller.signal.aborted) {
          if (pausedRef.current) {
            // Pause = stop consuming the stream. Server keeps writing.
            await new Promise((r) => setTimeout(r, 200));
            continue;
          }
          const { done, value } = await reader.read();
          if (done) break;
          buffered += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffered.indexOf("\n\n")) !== -1) {
            const frame = buffered.slice(0, idx);
            buffered = buffered.slice(idx + 2);
            for (const line of frame.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload) continue;
              try {
                handleSseEvent(JSON.parse(payload) as SseEvent);
              } catch (e) {
                console.error("[streaming-doc] bad sse frame", e);
              }
            }
          }
        }
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "stream failed");
      }
    })();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamRequest?.url]);

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }

  async function handleCancel() {
    if (!runId) return;
    await fetch(`/api/loops/runs/${runId}/cancel`, { method: "POST" });
    abortRef.current?.abort();
  }

  const isStreaming = streamRequest && !status && !error;

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
            {documentTitle}
          </h1>
          {isStreaming && (
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-ink-mute">
              <button
                type="button"
                onClick={togglePause}
                className="border border-rule-strong px-2 py-1 hover:border-accent"
              >
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="border border-rule-strong px-2 py-1 hover:border-negative"
              >
                Cancel
              </button>
            </div>
          )}
          {status && (
            <span className="font-mono text-[11px] uppercase tracking-wide text-ink-mute">
              {status}
            </span>
          )}
        </div>
        <div className="h-px w-12 bg-accent opacity-50" />
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
          Document {documentId.slice(0, 8)}
        </p>
      </header>

      {error && (
        <div className="border border-negative bg-paper-card p-4">
          <p className="font-mono text-[11px] uppercase tracking-wide text-negative">
            Error
          </p>
          <p className="pt-1 text-sm text-ink">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        {sections.length === 0 && !error && (
          <p className="text-sm italic text-ink-mute">Loading…</p>
        )}
        {sections.map((section) => (
          <StreamingSection
            key={`s-${section.ord}`}
            section={section}
            comments={comments.filter((c) => c.sectionRef === section.kind)}
          />
        ))}
      </div>
    </article>
  );
}
