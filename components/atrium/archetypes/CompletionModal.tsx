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
  onOpenCanvas: () => void;
  onDismiss: () => void;
};

export function CompletionModal({ event, onOpenCanvas, onDismiss }: Props) {
  const artefact    = (event.meta?.artefact    as string | undefined) ?? "Artefact";
  const ventureSlug = (event.meta?.ventureSlug as string | undefined) ?? "venture";
  const summary     = (event.meta?.summary     as string | undefined) ?? "";
  const headline    = `${artefact} is ready for ${ventureSlug}`;
  const context     = (event.meta?.context     as string | undefined)
    ?? "Review and decide what to do with it.";

  const actions: AtriumModalAction[] = [
    { label: "Open on canvas", shortcut: "1", variant: "primary",   onAction: onOpenCanvas },
    { label: "Dismiss",        shortcut: "2", variant: "secondary", onAction: onDismiss },
  ];

  return (
    <>
      <ModalHeroPlaceholder archetype="completion" />
      <ModalHeadline headline={headline} context={context} />
      <ModalBody>
        {summary && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{summary}</p>}
      </ModalBody>
      <ModalActionBar actions={actions} onAction={(a) => a.onAction()} />
    </>
  );
}
