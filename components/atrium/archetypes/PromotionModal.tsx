"use client";

import { ModalHeroPlaceholder } from "@/components/atrium/ModalHeroPlaceholder";
import {
  ModalBody,
  ModalHeadline,
  ModalActionBar,
} from "@/components/atrium/ModalContainer";
import type { AtriumModalEvent, AtriumModalAction } from "@/lib/atrium/types";

type Props = {
  event: AtriumModalEvent;
  onPromote: () => void;
  onKeep: () => void;
  onDefer: () => void;
};

export function PromotionModal({ event, onPromote, onKeep, onDefer }: Props) {
  const skillName  = (event.meta?.skillName  as string | undefined) ?? "Skill";
  const nextLevel  = (event.meta?.nextLevel  as string | undefined) ?? "Operate";
  const approved   = (event.meta?.approved   as number | undefined) ?? 0;
  const threshold  = (event.meta?.threshold  as number | undefined) ?? 20;
  const headline   = `${skillName} is ready for ${nextLevel}`;
  const context    = `${approved} of your last ${threshold} runs approved — promote to ${nextLevel}?`;

  const actions: AtriumModalAction[] = [
    { label: `Promote to ${nextLevel}`, shortcut: "1", variant: "primary",   onAction: onPromote },
    { label: "Keep current level",      shortcut: "2", variant: "secondary", onAction: onKeep },
    { label: "Decide later",            shortcut: "3", variant: "secondary", onAction: onDefer },
  ];

  const pct = Math.min(100, Math.round((approved / Math.max(1, threshold)) * 100));

  return (
    <>
      <ModalHeroPlaceholder archetype="promotion" />
      <ModalHeadline
        headline={headline}
        context={context}
        accentColor="var(--color-positive, #2D5F3F)"
      />
      <ModalBody>
        {/* Trust ratchet bar */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono, monospace)",
              color: "var(--color-ink-mute, #595959)",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            trust score
          </div>
          <div
            style={{
              height: 4,
              background: "var(--color-rule, #E5E3DB)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: "var(--color-positive, #2D5F3F)",
                borderRadius: 2,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              fontFamily: "var(--font-mono, monospace)",
              color: "var(--color-ink-mute, #595959)",
            }}
          >
            {approved} / {threshold} toward {nextLevel}
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-ink-mute, #595959)" }}>
          At {nextLevel} level, the skill continues inside all existing guardrails.
          The kill switch remains available at any time.
        </p>
      </ModalBody>
      <ModalActionBar actions={actions} onAction={(a) => a.onAction()} />
    </>
  );
}
