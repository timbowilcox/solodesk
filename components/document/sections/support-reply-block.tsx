import type { SectionRow } from "../section";

export function SupportReplyBlockSection({
  section,
}: {
  section: SectionRow;
  editable: boolean;
}) {
  const content = section.content as {
    subject?: string;
    body?: string;
    send_when_approved?: boolean;
  } | null;
  const subject = content?.subject ?? "";
  const body = content?.body ?? "";
  const ready = content?.send_when_approved !== false;

  if (!body) {
    return <p className="text-sm italic text-ink-faint">(no draft)</p>;
  }

  return (
    <div className="space-y-4">
      {!ready && (
        <p className="text-sm text-caution">
          Draft flagged as needing operator changes before sending.
        </p>
      )}
      {subject && (
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Subject
          </p>
          <p className="text-md font-medium text-ink-strong">{subject}</p>
        </div>
      )}
      <div className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-mute">
          Body
        </p>
        <div className="space-y-3 text-md leading-[1.55] text-ink">
          {body.split(/\n\s*\n/).map((para, idx) => (
            <p key={idx} className="whitespace-pre-wrap">
              {para}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
