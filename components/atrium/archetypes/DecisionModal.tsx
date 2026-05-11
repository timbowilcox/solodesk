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
  onApprove: () => void;
  onRefine: () => void;
  onReject: () => void;
};

export function DecisionModal({ event, onApprove, onRefine, onReject }: Props) {
  const skillId = (event.meta?.skillId as string | undefined) ?? event.scopeId;
  const ventureSlug = (event.meta?.ventureSlug as string | undefined) ?? "this venture";
  const headline = `Approve action for ${ventureSlug}?`;
  const context = `${skillId} is waiting on your decision before proceeding.`;

  const actions: AtriumModalAction[] = [
    { label: "Approve",  shortcut: "1", variant: "primary",   onAction: onApprove },
    { label: "Refine",   shortcut: "2", variant: "secondary", onAction: onRefine },
    { label: "Reject",   shortcut: "3", variant: "secondary", onAction: onReject },
  ];

  return (
    <>
      <ModalHeroPlaceholder archetype="decision" />
      <ModalHeadline headline={headline} context={context} />
      <ModalBody>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-ink-mute, #595959)" }}>
          Review the proposed action, then approve, refine, or reject.
        </p>
        {event.meta?.detail != null && (
          <pre
            style={{
              marginTop: 12,
              fontSize: 12,
              fontFamily: "var(--font-mono, monospace)",
              background: "var(--color-paper, #F7F6F1)",
              border: "1px solid var(--color-rule, #E5E3DB)",
              borderRadius: 4,
              padding: "10px 12px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(event.meta.detail, null, 2)}
          </pre>
        )}
      </ModalBody>
      <ModalActionBar actions={actions} onAction={(a) => a.onAction()} />
    </>
  );
}
