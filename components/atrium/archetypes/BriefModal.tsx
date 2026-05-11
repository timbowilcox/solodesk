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
  onOpenQueue: () => void;
  onMarkRead: () => void;
  onDismiss: () => void;
};

export function BriefModal({ event, onOpenQueue, onMarkRead, onDismiss }: Props) {
  const period = (event.meta?.period as string | undefined) ?? "morning";
  const headline = `Your ${period} brief`;
  const topItem = (event.meta?.topItem as string | undefined)
    ?? "No outstanding items.";

  const actions: AtriumModalAction[] = [
    { label: "Open queue", shortcut: "1", variant: "primary",   onAction: onOpenQueue },
    { label: "Mark read",  shortcut: "2", variant: "secondary", onAction: onMarkRead },
    { label: "Dismiss",    shortcut: "3", variant: "secondary", onAction: onDismiss },
  ];

  const highlights = (event.meta?.highlights as string[] | undefined) ?? [];
  const stats = event.meta?.stats as { autonomous?: number; approved?: number; escalated?: number } | undefined;

  return (
    <>
      <ModalHeroPlaceholder archetype="brief" />
      <ModalHeadline headline={headline} context={topItem} />
      <ModalBody>
        {highlights.length > 0 && (
          <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 13, lineHeight: 1.6 }}>
            {highlights.map((h, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{h}</li>
            ))}
          </ul>
        )}
        {stats && (
          <p
            style={{
              marginTop: 14,
              fontSize: 12,
              fontFamily: "var(--font-mono, monospace)",
              color: "var(--color-ink-mute, #595959)",
            }}
          >
            {stats.autonomous ?? 0} autonomous · {stats.approved ?? 0} approved · {stats.escalated ?? 0} escalated
          </p>
        )}
      </ModalBody>
      <ModalActionBar actions={actions} onAction={(a) => a.onAction()} />
    </>
  );
}
