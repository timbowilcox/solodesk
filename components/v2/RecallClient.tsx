"use client";

import { useState, useTransition } from "react";

import { crossVentureRecallAction } from "@/app/v2/recall/actions";
import type { CrossVentureHit } from "@/lib/chat/cross-venture";

export function RecallClient({ initialQuery }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<CrossVentureHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!q || isPending) return;

    const formData = new FormData();
    formData.set("query", q);
    setError(null);

    startTransition(async () => {
      const result = await crossVentureRecallAction(formData);
      if (result.ok) {
        setResults(result.hits);
      } else {
        setError(result.error);
        setResults([]);
      }
    });
  }

  return (
    <div>
      {/* Search bar */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 28,
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search across all ventures — try "pricing", "risk", "strategy"…'
          disabled={isPending}
          style={{
            flex: 1,
            padding: "12px 16px",
            fontSize: 14,
            border: "1px solid #EAEAEA",
            borderRadius: 4,
            outline: "none",
            background: "#fff",
            color: "#0A0A0A",
          }}
        />
        <button
          type="submit"
          disabled={isPending || !query.trim()}
          style={{
            padding: "12px 24px",
            background: isPending || !query.trim() ? "#EAEAEA" : "#2563EB",
            color: isPending || !query.trim() ? "#999" : "#fff",
            border: "none",
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 500,
            cursor: isPending || !query.trim() ? "not-allowed" : "pointer",
          }}
        >
          {isPending ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <p style={{ fontSize: 13, color: "#991B1B", marginBottom: 16 }}>
          {error}
        </p>
      )}

      {/* Results */}
      {results !== null && (
        <>
          <p
            style={{
              fontSize: 12,
              color: "#999",
              marginBottom: 14,
              fontWeight: 500,
            }}
          >
            {results.length === 0
              ? "No results."
              : `${results.length} result${results.length !== 1 ? "s" : ""}`}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {results.map((hit, i) => (
              <RecallResultRow key={hit.id} hit={hit} index={i} />
            ))}
          </div>
        </>
      )}

      {results === null && !isPending && (
        <p style={{ fontSize: 13, color: "#999" }}>
          Enter a search term to find decisions, memories, and context across your portfolio.
        </p>
      )}
    </div>
  );
}

function RecallResultRow({ hit, index }: { hit: CrossVentureHit; index: number }) {
  const sourceHref =
    hit.table === "decisions"
      ? `/ventures/${hit.ventureSlug}/decisions`
      : `/v2/v/${hit.ventureSlug}`;

  return (
    <div
      style={{
        border: "1px solid #EAEAEA",
        borderRadius: 4,
        padding: "14px 16px",
        background: "#FAFAFA",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 11, color: "#999", fontFamily: "monospace" }}>
          {index + 1}.
        </span>
        <a
          href={`/v2/v/${hit.ventureSlug}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: 99,
            background: "#EFF6FF",
            color: "#1D4ED8",
            fontSize: 11,
            fontWeight: 500,
            textDecoration: "none",
            border: "1px solid #BFDBFE",
          }}
        >
          {hit.ventureName}
        </a>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 99,
            background: "#F3F4F6",
            color: "#525252",
            fontSize: 11,
          }}
        >
          {hit.table}
        </span>
        <span
          style={{ fontSize: 11, color: "#999", marginLeft: "auto" }}
        >
          {Math.round(hit.similarity * 100)}% match
        </span>
        <span style={{ fontSize: 11, color: "#999" }}>
          {formatDate(hit.ts)}
        </span>
      </div>
      <p
        style={{
          fontSize: 13,
          color: "#0A0A0A",
          margin: "0 0 8px",
          lineHeight: 1.5,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {hit.text}
      </p>
      <a
        href={sourceHref}
        style={{
          fontSize: 11,
          color: "#2563EB",
          textDecoration: "none",
        }}
      >
        View in {hit.ventureName} →
      </a>
    </div>
  );
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
