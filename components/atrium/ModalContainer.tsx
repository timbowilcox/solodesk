"use client";

// Atrium glass modal container primitive.
// Design spec: MODAL-ARCHETYPES.md §2 shared properties.
//
// Note: this is the one surface in SoloDesk that deliberately uses backdrop-blur
// and a warm shadow. The Atrium modal spec (Phase B) explicitly calls for the
// glass card treatment as its own design language. See DECISIONS-UNATTENDED.md B.2-D2.

import React, { useEffect, useRef } from "react";
import type { AtriumModalAction } from "@/lib/atrium/types";

type Props = {
  children: React.ReactNode;
  onBackdropClick?: () => void;
  queueCount?: number;  // number of additional modals waiting
};

type ActionBarProps = {
  actions: AtriumModalAction[];
  onAction: (action: AtriumModalAction) => void;
};

// ─── Atrium glass card ────────────────────────────────────────────────────────

export function ModalContainer({ children, onBackdropClick, queueCount = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus trap: when modal opens, focus the container.
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onBackdropClick}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.30)",
          zIndex: 40,
          animation: "atrium-backdrop-in 240ms ease-out both",
        }}
      />

      {/* Glass card */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{
          position: "fixed",
          top: "12vh",
          left: "50%",
          transform: "translateX(-50%)",
          width: 480,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "80vh",
          background: "rgba(255, 255, 255, 0.70)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 20,
          boxShadow: "0 8px 24px 0 rgba(47, 38, 20, 0.12)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "atrium-modal-in 240ms ease-out both",
          outline: "none",
        }}
      >
        {/* Queue indicator */}
        {queueCount > 0 && (
          <div
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              background: "var(--color-ink-mute, #595959)",
              color: "#fff",
              fontSize: 11,
              fontFamily: "var(--font-mono, monospace)",
              padding: "2px 7px",
              borderRadius: 20,
              zIndex: 1,
              pointerEvents: "none",
            }}
          >
            +{queueCount} more
          </div>
        )}

        {children}
      </div>

      <style>{`
        @keyframes atrium-modal-in {
          from { opacity: 0; transform: translateX(-50%) scale(0.96); }
          to   { opacity: 1; transform: translateX(-50%) scale(1); }
        }
        @keyframes atrium-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ─── Shared structural sections ───────────────────────────────────────────────

export function ModalBody({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 24px",
        color: "var(--color-ink, #1A1A1A)",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

export function ModalHeadline({ headline, context, accentColor }: {
  headline: string;
  context: string;
  accentColor?: string;
}) {
  return (
    <div style={{ padding: "18px 24px 12px", borderBottom: "1px solid var(--color-rule, #E5E3DB)" }}>
      <h2
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 500,
          color: accentColor ?? "var(--color-ink-strong, #000000)",
          lineHeight: 1.25,
        }}
      >
        {headline}
      </h2>
      <p
        style={{
          margin: "6px 0 0",
          fontSize: 13,
          color: "var(--color-ink-mute, #595959)",
          lineHeight: 1.4,
        }}
      >
        {context}
      </p>
    </div>
  );
}

export function ModalActionBar({ actions, onAction }: ActionBarProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "14px 24px",
        borderTop: "1px solid var(--color-rule, #E5E3DB)",
        background: "rgba(247, 246, 241, 0.60)",
      }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction(action)}
          style={{
            flex: action.variant === "primary" ? 1 : undefined,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
            border: action.variant === "primary"
              ? "1px solid var(--color-accent, #1F3A5F)"
              : "1px solid var(--color-rule-strong, #C4C2B7)",
            borderRadius: 4,
            background: action.variant === "primary"
              ? "var(--color-accent, #1F3A5F)"
              : action.variant === "destructive"
                ? "var(--color-negative, #6B1F1F)"
                : "transparent",
            color: action.variant === "primary" || action.variant === "destructive"
              ? "#fff"
              : "var(--color-ink, #1A1A1A)",
          }}
        >
          {action.shortcut && (
            <span style={{ opacity: 0.5, marginRight: 6, fontSize: 11 }}>
              {action.shortcut}
            </span>
          )}
          {action.label}
        </button>
      ))}
    </div>
  );
}
