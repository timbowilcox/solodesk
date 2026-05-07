"use client";

// ConversationThread — Loop 1 conversation surface.
//
// Renders prior messages (operator / agent / critic / inline Documents)
// from the server, then a textarea for the operator. On submit:
//   1. Append operator message via server action (so the message
//      survives a refresh)
//   2. Open SSE stream against /api/loops/01-strategy/invoke; on the
//      first run_started event we mount a StreamingDocument card
//      inline in the thread
//
// Membership scoping: parent passes ventureId; SSE endpoint enforces
// canAccessVenture; server action calls requireVentureAccess.

import { useEffect, useRef, useState } from "react";

import { StreamingDocument } from "@/components/document/StreamingDocument";
import {
  appendOperatorMessageAction,
} from "@/app/(authed)/ventures/[slug]/strategy/actions";

import { MessageBubble, type MessageView } from "./MessageBubble";

export type ConversationThreadProps = {
  slug: string;
  ventureId: string;
  ventureName: string;
  ventureAccent: string;
  threadId: string;
  messages: MessageView[];
};

type LiveDoc = {
  documentId: string;
  documentTitle: string;
  streamRequest: { url: string; body: Record<string, unknown> };
};

export function ConversationThread({
  slug,
  ventureId,
  ventureName,
  ventureAccent,
  threadId,
  messages,
}: ConversationThreadProps) {
  const [liveDoc, setLiveDoc] = useState<LiveDoc | null>(null);
  const [pendingTitle, setPendingTitle] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // When new messages arrive (after revalidatePath), we don't need
    // to do anything special — they'll render on the next paint.
  }, [messages]);

  function handleSubmit(formData: FormData) {
    const body = (formData.get("body") as string | null)?.trim() ?? "";
    if (!body) return;
    // Persist the operator message via server action.
    void appendOperatorMessageAction(formData);
    // Pick a title for the Document — first 8 words of the question.
    const title = body.split(/\s+/).slice(0, 8).join(" ");
    setPendingTitle(title);
    setLiveDoc({
      documentId: "pending",
      documentTitle: title,
      streamRequest: {
        url: `/api/loops/01-strategy/invoke`,
        body: {
          ventureId,
          task: body,
          threadId,
          title,
        },
      },
    });
    if (formRef.current) {
      formRef.current.reset();
    }
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-4">
        {messages.length === 0 && !liveDoc && (
          <li className="text-sm italic text-ink-faint">
            Start a strategy conversation.
          </li>
        )}
        {messages.map((m) => (
          <li key={m.id}>
            <MessageBubble
              message={m}
              ventureName={ventureName}
              ventureAccent={ventureAccent}
            />
          </li>
        ))}
        {liveDoc && (
          <li>
            <div className="border-l-2 px-4" style={{ borderColor: ventureAccent }}>
              <StreamingDocument
                documentId={liveDoc.documentId}
                documentTitle={pendingTitle || liveDoc.documentTitle}
                streamRequest={liveDoc.streamRequest}
              />
            </div>
          </li>
        )}
      </ul>

      <form
        ref={formRef}
        action={handleSubmit}
        className="space-y-2 border-t border-rule pt-4"
      >
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="threadId" value={threadId} />
        <label htmlFor="body" className="block font-mono text-[11px] uppercase tracking-wide text-ink-mute">
          Ask the strategy partner
        </label>
        <textarea
          id="body"
          name="body"
          rows={4}
          maxLength={8_000}
          required
          placeholder="What's the question?"
          className="block w-full border border-rule-strong bg-paper-card px-3 py-2 font-sans text-sm text-ink outline-none transition-[border-color] duration-[80ms] focus:border-accent"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-ink-strong px-4 py-2 text-sm font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
