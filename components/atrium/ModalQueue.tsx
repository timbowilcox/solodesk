"use client";

// Atrium modal queue — context, provider, and renderer.
//
// The queue is client-side state loaded from modal_events (undismissed rows).
// High-priority archetypes (escalation, alert) jump to the front.
// Only one modal renders at a time; the rest wait in the queue.
// ⌘⇧. fires the kill switch from anywhere.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { loadPendingModalQueue, recordModalDismiss, checkFrequencyBudget } from "@/lib/atrium/telemetry";
import { triggerKillSwitch } from "@/lib/atrium/kill-switch";
import { ModalContainer } from "./ModalContainer";
import { DecisionModal }   from "./archetypes/DecisionModal";
import { BriefModal }      from "./archetypes/BriefModal";
import { InsightModal }    from "./archetypes/InsightModal";
import { AlertModal }      from "./archetypes/AlertModal";
import { CompletionModal } from "./archetypes/CompletionModal";
import { QuestionModal }   from "./archetypes/QuestionModal";
import { PromotionModal }  from "./archetypes/PromotionModal";
import { EscalationModal } from "./archetypes/EscalationModal";
import type { AtriumModalEvent, ModalArchetype } from "@/lib/atrium/types";
import { getModalPriority } from "@/lib/atrium/types";

// ─── Context ──────────────────────────────────────────────────────────────────

type QueueContextValue = {
  enqueue: (event: AtriumModalEvent) => void;
  dismiss: () => void;
  nextModal: () => void;
  prevModal: () => void;
  queueLength: number;
};

const QueueContext = createContext<QueueContextValue>({
  enqueue: () => {},
  dismiss: () => {},
  nextModal: () => {},
  prevModal: () => {},
  queueLength: 0,
});

export function useAtriumQueue() {
  return useContext(QueueContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AtriumModalProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<AtriumModalEvent[]>([]);
  const [cursor, setCursor] = useState(0); // index in queue of current modal
  const loaded = useRef(false);

  // Load pending queue from DB on mount.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    loadPendingModalQueue().then((rows) => {
      const events: AtriumModalEvent[] = rows.map((r) => ({
        id: r.id,
        archetype: r.archetype as ModalArchetype,
        scopeId: r.scope_id,
        scopeType: r.scope_type,
        actionId: r.action_id,
        firedAt: r.fired_at,
      }));
      setQueue(events);
    }).catch(() => {
      // Non-fatal — empty queue on error.
    });
  }, []);

  const enqueue = useCallback((event: AtriumModalEvent) => {
    setQueue((prev) => {
      const isHighPriority = getModalPriority(event.archetype) === "high";
      if (isHighPriority) {
        // Jump to front.
        return [event, ...prev];
      }
      return [...prev, event];
    });
    // Check frequency budget (non-blocking).
    checkFrequencyBudget(event.archetype).catch(() => {});
  }, []);

  const dismiss = useCallback(() => {
    const current = queue[cursor];
    if (!current) return;

    recordModalDismiss({
      modalEventId: current.id,
      actionTaken: "dismissed",
      firedAt: current.firedAt,
    }).catch(() => {});

    setQueue((prev) => prev.filter((_, i) => i !== cursor));
    setCursor((c) => Math.max(0, c - 1));
  }, [queue, cursor]);

  const dismissWithAction = useCallback((actionTaken: string) => {
    const current = queue[cursor];
    if (!current) return;

    recordModalDismiss({
      modalEventId: current.id,
      actionTaken,
      firedAt: current.firedAt,
    }).catch(() => {});

    setQueue((prev) => prev.filter((_, i) => i !== cursor));
    setCursor((c) => Math.max(0, c - 1));
  }, [queue, cursor]);

  const nextModal = useCallback(() => {
    setCursor((c) => Math.min(queue.length - 1, c + 1));
  }, [queue.length]);

  const prevModal = useCallback(() => {
    setCursor((c) => Math.max(0, c - 1));
  }, []);

  // ─── Keyboard navigation ──────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const current = queue[cursor];
      const isOpen = !!current;

      // ⌘⇧. — kill switch, always available.
      if (e.metaKey && e.shiftKey && e.key === ".") {
        e.preventDefault();
        triggerKillSwitch("operator kill switch — keyboard shortcut").catch(() => {});
        return;
      }

      if (!isOpen) return;

      // Non-dismissable archetypes: decision, escalation.
      const nonDismissable = current.archetype === "decision" || current.archetype === "escalation";

      switch (e.key) {
        case "Escape":
          if (!nonDismissable) dismiss();
          break;
        case "Enter":
          // Primary action — handled inside each archetype.
          break;
        case "ArrowRight":
          e.preventDefault();
          nextModal();
          break;
        case "ArrowLeft":
          e.preventDefault();
          prevModal();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [queue, cursor, dismiss, nextModal, prevModal]);

  // ─── Context value ────────────────────────────────────────────────────────

  const value: QueueContextValue = {
    enqueue,
    dismiss,
    nextModal,
    prevModal,
    queueLength: queue.length,
  };

  const current = queue[cursor] ?? null;
  const remaining = queue.length - cursor - 1;

  return (
    <QueueContext.Provider value={value}>
      {children}
      {current && (
        <ModalRenderer
          event={current}
          queueCount={Math.max(0, remaining)}
          onDismiss={dismiss}
          onDismissWithAction={dismissWithAction}
        />
      )}
    </QueueContext.Provider>
  );
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

function ModalRenderer({
  event,
  queueCount,
  onDismiss,
  onDismissWithAction,
}: {
  event: AtriumModalEvent;
  queueCount: number;
  onDismiss: () => void;
  onDismissWithAction: (action: string) => void;
}) {
  const nonDismissable = event.archetype === "decision" || event.archetype === "escalation";

  const containerProps = {
    queueCount,
    onBackdropClick: nonDismissable ? undefined : onDismiss,
  };

  return (
    <ModalContainer {...containerProps}>
      <ArchetypeRenderer
        event={event}
        onDismiss={onDismiss}
        onDismissWithAction={onDismissWithAction}
      />
    </ModalContainer>
  );
}

function ArchetypeRenderer({
  event,
  onDismiss,
  onDismissWithAction,
}: {
  event: AtriumModalEvent;
  onDismiss: () => void;
  onDismissWithAction: (action: string) => void;
}) {
  switch (event.archetype) {
    case "decision":
      return (
        <DecisionModal
          event={event}
          onApprove={() => onDismissWithAction("approved")}
          onRefine={() => onDismissWithAction("refine")}
          onReject={() => onDismissWithAction("rejected")}
        />
      );

    case "brief":
      return (
        <BriefModal
          event={event}
          onOpenQueue={() => onDismissWithAction("open_queue")}
          onMarkRead={() => onDismissWithAction("mark_read")}
          onDismiss={() => onDismissWithAction("dismissed")}
        />
      );

    case "insight":
      return (
        <InsightModal
          event={event}
          onTakeAction={() => onDismissWithAction("take_action")}
          onSnooze={() => onDismissWithAction("snoozed")}
          onDismiss={() => onDismissWithAction("dismissed")}
        />
      );

    case "alert":
      return (
        <AlertModal
          event={event}
          onTakeAction={() => onDismissWithAction("take_action")}
          onAcknowledge={() => onDismissWithAction("acknowledged")}
        />
      );

    case "completion":
      return (
        <CompletionModal
          event={event}
          onOpenCanvas={() => onDismissWithAction("open_canvas")}
          onDismiss={() => onDismissWithAction("dismissed")}
        />
      );

    case "question":
      return (
        <QuestionModal
          event={event}
          onPick={(optionId) => onDismissWithAction(`picked:${optionId}`)}
          onDefer={() => onDismissWithAction("deferred")}
        />
      );

    case "promotion":
      return (
        <PromotionModal
          event={event}
          onPromote={() => onDismissWithAction("promoted")}
          onKeep={() => onDismissWithAction("kept")}
          onDefer={() => onDismissWithAction("deferred")}
        />
      );

    case "escalation":
      return (
        <EscalationModal
          event={event}
          onApproveOnce={() => onDismissWithAction("approved_once")}
          onAdjustRule={() => onDismissWithAction("adjust_rule")}
          onReject={() => onDismissWithAction("rejected")}
          onDemote={() => onDismissWithAction("demoted")}
        />
      );

    default:
      onDismiss();
      return null;
  }
}
