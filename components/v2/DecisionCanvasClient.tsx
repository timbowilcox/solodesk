"use client";

import { useState } from "react";

import type { DocumentRow, SectionRow, CommentRow, AgentNoteContent } from "@/lib/db/documents";

// Minimal canvas doc renderer for the v2 split-pane view.
// The full v1 document.tsx handles all section kinds + editing.
// This surfaces the sections inline in a white canvas pane.

type Props = {
  document: DocumentRow;
  sections: SectionRow[];
  comments: CommentRow[];
  ventureSlug: string;
  unresolvedCount: number;
  isApprovable: boolean;
};

const SECTION_LABELS: Record<string, string> = {
  prose: "Prose",
  recommendation: "Recommendation",
  alternatives: "Alternatives",
  kill_criteria: "Kill criteria",
  evidence: "Evidence",
  risk: "Risk",
  agent_note: "Agent assumed",
  metric_block: "Metrics",
  content_block: "Content",
  intel_signals_table: "Signals",
  support_reply_block: "Reply",
};

export function DecisionCanvasClient({
  document: doc,
  sections,
  comments,
  ventureSlug,
  unresolvedCount,
  isApprovable,
}: Props) {
  const [localResolved, setLocalResolved] = useState<Set<string>>(new Set());

  const effectiveUnresolved = unresolvedCount - localResolved.size;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Document header */}
      <div
        style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid #EAEAEA",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ flex: 1 }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "#0A0A0A",
              margin: "0 0 4px",
              letterSpacing: "-0.02em",
            }}
          >
            {doc.title}
          </h2>
          <p style={{ fontSize: 12, color: "#999", margin: 0 }}>
            {doc.loop_name} · {doc.status}
          </p>
        </div>
        {isApprovable && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {effectiveUnresolved > 0 && (
              <span style={{ fontSize: 12, color: "#D97706" }}>
                {effectiveUnresolved} to resolve
              </span>
            )}
            <a
              href={`/ventures/${ventureSlug}/decisions/${doc.id}`}
              style={{
                padding: "8px 16px",
                background: effectiveUnresolved > 0 ? "#EAEAEA" : "#2563EB",
                color: effectiveUnresolved > 0 ? "#999" : "#fff",
                textDecoration: "none",
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 500,
                pointerEvents: effectiveUnresolved > 0 ? "none" : "auto",
              }}
            >
              {effectiveUnresolved > 0
                ? `Approve (${effectiveUnresolved} to resolve)`
                : "Approve decision"}
            </a>
          </div>
        )}
      </div>

      {/* Sections */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {sections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            comments={comments.filter((c) => c.section_id === section.id)}
            onResolve={(sectionId) => {
              setLocalResolved((prev) => new Set([...prev, sectionId]));
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SectionCard({
  section,
  comments,
  onResolve,
}: {
  section: SectionRow;
  comments: CommentRow[];
  onResolve: (id: string) => void;
}) {
  const label = SECTION_LABELS[section.kind] ?? section.kind;
  const content = section.content as Record<string, unknown> | null;

  // Agent note handling
  if (section.kind === "agent_note") {
    const noteContent = content as AgentNoteContent | null;
    const isResolved =
      noteContent?.decision && noteContent.decision !== "";

    return (
      <div
        style={{
          border: `1px solid ${isResolved ? "#EAEAEA" : "#FCD34D"}`,
          borderRadius: 4,
          background: isResolved ? "#FAFAFA" : "#FFFBEB",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${isResolved ? "#EAEAEA" : "#FCD34D"}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: isResolved ? "#999" : "#92400E",
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
          {isResolved && (
            <span style={{ fontSize: 10, color: "#16A34A", fontWeight: 500 }}>
              ✓ resolved
            </span>
          )}
        </div>
        <div style={{ padding: "12px 14px" }}>
          {noteContent?.question && (
            <p
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#0A0A0A",
                margin: "0 0 6px",
              }}
            >
              {noteContent.question}
            </p>
          )}
          {noteContent?.assumption && (
            <p
              style={{
                fontSize: 12,
                color: "#525252",
                margin: "0 0 8px",
                fontStyle: "italic",
              }}
            >
              Agent assumed: {noteContent.assumption}
            </p>
          )}
          {!isResolved && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <a
                href={`/ventures/${section.id}`}
                style={{
                  padding: "5px 12px",
                  background: "#2563EB",
                  color: "#fff",
                  textDecoration: "none",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500,
                }}
                onClick={(e) => {
                  e.preventDefault();
                  onResolve(section.id);
                }}
              >
                Confirm
              </a>
              <a
                href={`/ventures/${section.id}`}
                style={{
                  padding: "5px 12px",
                  border: "1px solid #EAEAEA",
                  color: "#525252",
                  textDecoration: "none",
                  borderRadius: 4,
                  fontSize: 12,
                }}
                onClick={(e) => {
                  e.preventDefault();
                  // Open full doc for full Revise flow
                  window.location.href = `/ventures/${section.document_id}`;
                }}
              >
                Revise in full view
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Recommendation — accent card
  if (section.kind === "recommendation") {
    return (
      <div
        style={{
          border: "1px solid #BFDBFE",
          borderRadius: 4,
          background: "#EFF6FF",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid #BFDBFE",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "#1D4ED8",
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
        </div>
        <div style={{ padding: "14px 14px" }}>
          <p style={{ fontSize: 14, color: "#0A0A0A", margin: 0, lineHeight: 1.5 }}>
            {String(content?.text ?? "")}
          </p>
        </div>
      </div>
    );
  }

  // Risk — coral card
  if (section.kind === "risk") {
    return (
      <div
        style={{
          border: "1px solid #FECACA",
          borderRadius: 4,
          background: "#FFF5F5",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid #FECACA",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "#991B1B",
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
        </div>
        <div style={{ padding: "14px 14px" }}>
          <p style={{ fontSize: 14, color: "#0A0A0A", margin: 0, lineHeight: 1.5 }}>
            {String(content?.text ?? "")}
          </p>
        </div>
      </div>
    );
  }

  // Default — neutral card
  return (
    <div
      style={{
        border: "1px solid #EAEAEA",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid #EAEAEA",
          background: "#FAFAFA",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "#999",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ padding: "14px 14px" }}>
        {content?.text !== undefined && (
          <p
            style={{
              fontSize: 14,
              color: "#0A0A0A",
              margin: 0,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {String(content.text)}
          </p>
        )}
        {comments.length > 0 && (
          <div style={{ marginTop: 12, borderTop: "1px solid #EAEAEA", paddingTop: 10 }}>
            {comments.map((c) => (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#2563EB", fontFamily: "monospace" }}>
                  {c.author}
                </span>
                <span style={{ fontSize: 12, color: "#525252", marginLeft: 8 }}>
                  {typeof c.body === "string" ? c.body : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
