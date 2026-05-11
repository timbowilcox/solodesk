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
  onTakeAction: () => void;
  onAcknowledge: () => void;
};

export function AlertModal({ event, onTakeAction, onAcknowledge }: Props) {
  const headline = (event.meta?.headline as string | undefined) ?? "Threshold crossed";
  const context  = (event.meta?.context  as string | undefined) ?? "A metric crossed a monitored threshold.";
  const body     = (event.meta?.body     as string | undefined) ?? "";

  const actions: AtriumModalAction[] = [
    { label: "Take action",  shortcut: "1", variant: "primary",   onAction: onTakeAction },
    { label: "Acknowledge",  shortcut: "2", variant: "secondary", onAction: onAcknowledge },
  ];

  // Alert uses a warm coral accent on the headline (MODAL-ARCHETYPES.md §4).
  return (
    <>
      <ModalChartPlaceholder label="alert chart" />
      <ModalHeadline
        headline={headline}
        context={context}
        accentColor="var(--color-negative, #6B1F1F)"
      />
      <ModalBody>
        {body && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{body}</p>}
      </ModalBody>
      <ModalActionBar actions={actions} onAction={(a) => a.onAction()} />
    </>
  );
}
