"use client";

import { useState, useTransition } from "react";

import { crossVentureChatAction } from "@/app/v2/chat/actions";
import type { CrossVentureHit } from "@/lib/chat/cross-venture";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  hits?: CrossVentureHit[];
  ventureSources?: string[];
  error?: string;
};

export function CrossVentureChatClient({
  initialQuery,
}: {
  initialQuery?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!q || isPending) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: q,
    };
    setMessages((prev) => [...prev, userMsg]);
    setQuery("");

    const formData = new FormData();
    formData.set("query", q);

    startTransition(async () => {
      const result = await crossVentureChatAction(formData);
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.ok ? result.answer : "",
        hits: result.ok ? result.hits : undefined,
        ventureSources: result.ok ? result.ventureSources : undefined,
        error: result.ok ? undefined : result.error,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    });
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 80px)",
        maxWidth: 760,
        margin: "0 auto",
        padding: "0 32px",
      }}
    >
      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 24, paddingBottom: 16 }}>
        {messages.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 8,
            }}
          >
            <p style={{ fontSize: 16, fontWeight: 500, color: "#0A0A0A" }}>
              Ask across your portfolio
            </p>
            <p style={{ fontSize: 13, color: "#999", textAlign: "center" }}>
              Questions are answered using semantic search across all your ventures&rsquo; decisions and context.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => setQuery(q)}
                  style={{
                    padding: "8px 14px",
                    background: "#FAFAFA",
                    border: "1px solid #EAEAEA",
                    borderRadius: 4,
                    fontSize: 13,
                    color: "#525252",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isPending && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#EAEAEA",
                    flexShrink: 0,
                    fontSize: 11,
                    lineHeight: "20px",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  A
                </span>
                <p
                  style={{
                    fontSize: 13,
                    color: "#999",
                    fontStyle: "italic",
                    margin: 0,
                  }}
                >
                  Loading&hellip;
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: 10,
          paddingTop: 16,
          paddingBottom: 24,
          borderTop: "1px solid #EAEAEA",
        }}
      >
        <input
          name="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything across your portfolio…"
          disabled={isPending}
          style={{
            flex: 1,
            padding: "10px 14px",
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
            padding: "10px 20px",
            background: isPending || !query.trim() ? "#EAEAEA" : "#2563EB",
            color: isPending || !query.trim() ? "#999" : "#fff",
            border: "none",
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 500,
            cursor: isPending || !query.trim() ? "not-allowed" : "pointer",
          }}
        >
          {isPending ? "Thinking…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function ChatMessage({ message: msg }: { message: Message }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      {/* Author tag */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: msg.role === "user" ? "#2563EB" : "#EAEAEA",
          color: msg.role === "user" ? "#fff" : "#525252",
          fontSize: 10,
          fontWeight: 700,
          flexShrink: 0,
          marginTop: 2,
          fontFamily: "monospace",
        }}
      >
        {msg.role === "user" ? "T" : "A"}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {msg.error ? (
          <p style={{ fontSize: 14, color: "#991B1B", margin: 0 }}>
            Error: {msg.error}
          </p>
        ) : (
          <p
            style={{
              fontSize: 14,
              color: "#0A0A0A",
              margin: 0,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {msg.content}
          </p>
        )}

        {/* Source pills */}
        {msg.ventureSources && msg.ventureSources.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginTop: 10,
            }}
          >
            {msg.ventureSources.map((slug) => (
              <a
                key={slug}
                href={`/v2/v/${slug}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 10px",
                  borderRadius: 99,
                  background: "#EFF6FF",
                  color: "#1D4ED8",
                  fontSize: 11,
                  fontWeight: 500,
                  textDecoration: "none",
                  border: "1px solid #BFDBFE",
                }}
              >
                {slug}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const EXAMPLE_QUERIES = [
  "What pricing decisions have I made across my ventures?",
  "Which ventures have the most pending decisions?",
  "What are the key risks identified across the portfolio?",
];
