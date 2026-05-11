"use client";

import { useState } from "react";
import { ModalHeroPlaceholder } from "@/components/atrium/ModalHeroPlaceholder";
import {
  ModalBody,
  ModalHeadline,
  ModalActionBar,
} from "@/components/atrium/ModalContainer";
import type { AtriumModalEvent, AtriumModalAction } from "@/lib/atrium/types";

type QuestionOption = { id: string; label: string; description?: string };

type Props = {
  event: AtriumModalEvent;
  onPick: (optionId: string) => void;
  onDefer: () => void;
};

export function QuestionModal({ event, onPick, onDefer }: Props) {
  const question = (event.meta?.question as string | undefined) ?? "A decision is needed.";
  const context  = (event.meta?.context  as string | undefined) ?? "The system needs your input to proceed.";
  const options  = (event.meta?.options  as QuestionOption[] | undefined) ?? [];

  const [selected, setSelected] = useState<string | null>(null);

  const primaryAction: AtriumModalAction = {
    label: "Confirm",
    shortcut: "1",
    variant: "primary",
    onAction: () => { if (selected) onPick(selected); },
  };

  const deferAction: AtriumModalAction = {
    label: "Defer",
    shortcut: "2",
    variant: "secondary",
    onAction: onDefer,
  };

  return (
    <>
      <ModalHeroPlaceholder archetype="question" />
      <ModalHeadline headline={question} context={context} />
      <ModalBody>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              style={{
                textAlign: "left",
                padding: "10px 14px",
                border: selected === opt.id
                  ? "1px solid var(--color-accent, #1F3A5F)"
                  : "1px solid var(--color-rule, #E5E3DB)",
                borderRadius: 4,
                background: selected === opt.id
                  ? "rgba(31, 58, 95, 0.05)"
                  : "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                color: "var(--color-ink, #1A1A1A)",
              }}
            >
              <strong style={{ fontWeight: 500 }}>{opt.label}</strong>
              {opt.description && (
                <span
                  style={{
                    display: "block",
                    marginTop: 2,
                    fontSize: 12,
                    color: "var(--color-ink-mute, #595959)",
                  }}
                >
                  {opt.description}
                </span>
              )}
            </button>
          ))}
        </div>
      </ModalBody>
      <ModalActionBar
        actions={[primaryAction, deferAction]}
        onAction={(a) => a.onAction()}
      />
    </>
  );
}
