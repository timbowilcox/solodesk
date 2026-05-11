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
  onSnooze: () => void;
  onDismiss: () => void;
};

export function InsightModal({ event, onTakeAction, onSnooze, onDismiss }: Props) {
  const headline = (event.meta?.headline as string | undefined) ?? "Pattern detected";
  const context  = (event.meta?.context  as string | undefined) ?? "A cross-venture signal was observed.";
  const body     = (event.meta?.body     as string | undefined) ?? "";

  const actions: AtriumModalAction[] = [
    { label: "Take action", shortcut: "1", variant: "primary",   onAction: onTakeAction },
    { label: "Snooze 24h",  shortcut: "2", variant: "secondary", onAction: onSnooze },
    { label: "Dismiss",     shortcut: "3", variant: "secondary", onAction: onDismiss },
  ];

  return (
    <>
      <ModalChartPlaceholder label="insight chart" />
      <ModalHeadline headline={headline} context={context} />
      <ModalBody>
        {body && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{body}</p>}
      </ModalBody>
      <ModalActionBar actions={actions} onAction={(a) => a.onAction()} />
    </>
  );
}
