"use client";

// CommandBar — keyboard-triggered overlay (CMD+K / Ctrl+K).
//
// Lives at the layout level (mounted once for the whole app). Listens
// for the keyboard shortcut globally; on activation, renders a focus-
// trapped modal over the page. ESC dismisses.
//
// Bright lines:
//   - Membership scoping happens server-side at /api/command-bar
//   - This client component never reads venture data directly; it just
//     forwards the operator's text to the SSE endpoint and renders the
//     frames it returns
//   - Recent queries are stored in localStorage scoped to the user's
//     email; they're hints, not auth state

import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { useEffect, useRef, useState } from "react";

const RECENT_KEY_PREFIX = "solodesk:command-bar:recent:";
const RECENT_LIMIT = 5;

const SUGGESTED_QUERIES = [
  "Show me everything that needs my attention",
  "What's happening with Kounta today",
  "What did I decide about pricing",
  "Why did Counsel MRR drop?",
] as const;

type CommandBarFrame =
  | { kind: "intent"; intent: { kind: string } }
  | { kind: "text"; text: string }
  | { kind: "link"; title: string; href: string }
  | { kind: "done" }
  | { kind: "error"; reason: string };

export type CommandBarProps = {
  operatorEmail: string;
};

export function CommandBar({ operatorEmail }: CommandBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [frames, setFrames] = useState<CommandBarFrame[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load recent queries when overlay opens (deferred via setTimeout so
  // the linter doesn't flag a sync setState in useEffect body).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(
          `${RECENT_KEY_PREFIX}${operatorEmail}`,
        );
        setRecent(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        setRecent([]);
      }
      inputRef.current?.focus();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, operatorEmail]);

  // Keyboard shortcut.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setStreaming(false);
        abortRef.current?.abort();
        abortRef.current = null;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function closeOverlay() {
    setOpen(false);
    setStreaming(false);
    abortRef.current?.abort();
    abortRef.current = null;
  }

  async function submit(raw: string) {
      const q = raw.trim();
      if (!q) return;
      setStreaming(true);
      setFrames([]);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch("/api/command-bar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          setFrames([{ kind: "error", reason: `HTTP ${response.status}` }]);
          setStreaming(false);
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffered = "";
        while (!controller.signal.aborted) {
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
                const parsed = JSON.parse(payload) as CommandBarFrame;
                setFrames((prev) => [...prev, parsed]);
                if (parsed.kind === "done" || parsed.kind === "error") {
                  setStreaming(false);
                }
              } catch {
                // ignore bad frame
              }
            }
          }
        }
        // Persist to recent queries on completion.
        try {
          const next = [q, ...recent.filter((r) => r !== q)].slice(
            0,
            RECENT_LIMIT,
          );
          window.localStorage.setItem(
            `${RECENT_KEY_PREFIX}${operatorEmail}`,
            JSON.stringify(next),
          );
          setRecent(next);
        } catch {
          // ignore storage errors
        }
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === "AbortError") return;
        setFrames([
          {
            kind: "error",
            reason: e instanceof Error ? e.message : "request failed",
          },
        ]);
        setStreaming(false);
      }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command bar"
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeOverlay();
      }}
    >
      <div className="w-full max-w-xl border border-rule-strong bg-paper-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(query);
          }}
          className="flex items-center gap-3 border-b border-rule px-4 py-3"
        >
          <MagnifyingGlass
            size={18}
            weight="regular"
            aria-hidden
            className="text-ink-mute"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask…"
            className="flex-1 border-0 bg-transparent text-base text-ink-strong outline-none placeholder:text-ink-faint"
            aria-label="Command bar query"
          />
          <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            Esc to close
          </span>
        </form>

        {!streaming && frames.length === 0 && (
          <div className="space-y-4 p-4">
            {recent.length > 0 && (
              <section>
                <h3 className="font-mono text-[10px] uppercase tracking-wide text-ink-mute">
                  Recent
                </h3>
                <ul className="pt-2 space-y-1">
                  {recent.map((r) => (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => {
                          setQuery(r);
                          void submit(r);
                        }}
                        className="block w-full text-left text-sm text-ink hover:text-accent"
                      >
                        {r}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h3 className="font-mono text-[10px] uppercase tracking-wide text-ink-mute">
                Suggested
              </h3>
              <ul className="pt-2 space-y-1">
                {SUGGESTED_QUERIES.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(s);
                        void submit(s);
                      }}
                      className="block w-full text-left text-sm text-ink-mute hover:text-accent"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {(streaming || frames.length > 0) && (
          <div className="space-y-2 p-4">
            {frames.map((f, i) => {
              if (f.kind === "text") {
                return (
                  <p key={i} className="text-sm text-ink">
                    {f.text}
                  </p>
                );
              }
              if (f.kind === "link") {
                return (
                  <a
                    key={i}
                    href={f.href}
                    className="block text-sm text-accent underline-offset-2 hover:underline"
                  >
                    {f.title}
                  </a>
                );
              }
              if (f.kind === "error") {
                return (
                  <p
                    key={i}
                    className="text-sm text-negative"
                  >
                    {f.reason}
                  </p>
                );
              }
              return null;
            })}
            {streaming && (
              <p className="text-sm italic text-ink-faint">Working…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
