"use client";

import { ModalChartPlaceholder } from "@/components/atrium/ModalHeroPlaceholder";
import {
  ModalBody,
  ModalHeadline,
  ModalActionBar,
} from "@/components/atrium/ModalContainer";
import type { AtriumModalEvent, AtriumModalAction } from "@/lib/atrium/types";

type Props = {
  event: AtriumModalEvent;
  onApproveOnce: () => void;
  onAdjustRule: () => void;
  onReject: () => void;
  onDemote: () => void;
};

export function EscalationModal({
  event,
  onApproveOnce,
  onAdjustRule,
  onReject,
  onDemote,
}: Props) {
  const skillId = (event.meta?.skillId    as string | undefined) ?? event.scopeId;
  const reason  = (event.meta?.reason     as string | undefined) ?? "an anomaly or guardrail breach";
  const tool    = (event.meta?.tool       as string | undefined) ?? "unknown tool";
  const headline = `${skillId} paused`;
  const context  = `Stopped before ${tool} — ${reason}.`;

  const actions: AtriumModalAction[] = [
    { label: "Approve once", shortcut: "1", variant: "primary",     onAction: onApproveOnce },
    { label: "Adjust rule",  shortcut: "2", variant: "secondary",   onAction: onAdjustRule },
    { label: "Reject",       shortcut: "3", variant: "secondary",   onAction: onReject },
    { label: "Demote",                      variant: "destructive",  onAction: onDemote },
  ];

  return (
    <>
      {/* Escalation modal: warm border treatment per MODAL-ARCHETYPES.md §3 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: "2px solid var(--color-negative, #6B1F1F)",
          borderRadius: 20,
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      <ModalChartPlaceholder label="escalation context" />
      <ModalHeadline
        headline={headline}
        context={context}
        accentColor="var(--color-negative, #6B1F1F)"
      />
      <ModalBody>
        <dl
          style={{
            margin: 0,
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "6px 12px",
            fontSize: 12,
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          <dt style={{ color: "var(--color-ink-faint, #8C8C8C)" }}>skill</dt>
          <dd style={{ margin: 0 }}>{skillId}</dd>
          <dt style={{ color: "var(--color-ink-faint, #8C8C8C)" }}>tool</dt>
          <dd style={{ margin: 0 }}>{tool}</dd>
          <dt style={{ color: "var(--color-ink-faint, #8C8C8C)" }}>reason</dt>
          <dd style={{ margin: 0 }}>{reason}</dd>
          {event.actionId && (
            <>
              <dt style={{ color: "var(--color-ink-faint, #8C8C8C)" }}>action</dt>
              <dd style={{ margin: 0 }}>{event.actionId}</dd>
            </>
          )}
        </dl>
      </ModalBody>
      <ModalActionBar actions={actions} onAction={(a) => a.onAction()} />
    </>
  );
}
