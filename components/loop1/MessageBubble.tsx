// MessageBubble — one row in the Loop 1 conversation thread.
//
// Visually distinct per role:
//   operator -> right-aligned plain bubble
//   agent    -> left-aligned card with mono role label
//   critic   -> left-aligned indented card with vertical accent bar
//   document -> placeholder for inline Document; the parent renders the
//               actual StreamingDocument elsewhere when this role appears

export type MessageView = {
  id: string;
  role: "operator" | "agent" | "critic" | "document";
  body: string;
  documentId: string | null;
  createdAt: string;
};

export type MessageBubbleProps = {
  message: MessageView;
  ventureName: string;
  ventureAccent: string;
};

export function MessageBubble({
  message,
  ventureAccent,
}: MessageBubbleProps) {
  if (message.role === "operator") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] border border-rule bg-paper-card px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            Operator
          </p>
          <p className="pt-1 whitespace-pre-wrap text-sm text-ink-strong">
            {message.body}
          </p>
        </div>
      </div>
    );
  }

  if (message.role === "agent") {
    return (
      <div className="border border-rule bg-paper-card p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink-mute">
          strategy.draft
        </p>
        <p className="pt-1 whitespace-pre-wrap text-sm text-ink">
          {message.body}
        </p>
      </div>
    );
  }

  if (message.role === "critic") {
    return (
      <div
        className="ml-6 border border-rule bg-paper-card p-4"
        style={{ borderLeft: `2px solid ${ventureAccent}` }}
      >
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink-mute">
          strategy.critic
        </p>
        <p className="pt-1 whitespace-pre-wrap text-sm text-ink-mute">
          {message.body}
        </p>
      </div>
    );
  }

  // role === 'document' — placeholder; inline Document is rendered by
  // parent at the right point in the message order
  return (
    <div className="border border-dashed border-rule bg-paper-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
        Document {message.documentId?.slice(0, 8) ?? "unknown"}
      </p>
    </div>
  );
}
