import type { SectionRow } from "../section";

const CHANNEL_LABEL: Record<string, string> = {
  email: "EMAIL",
  x: "X",
  linkedin: "LINKEDIN",
  blog: "BLOG",
};

export function ContentBlockSection({
  section,
}: {
  section: SectionRow;
  editable: boolean;
}) {
  const content = section.content as {
    channel?: string;
    subject?: string;
    body?: string;
    audience?: string;
    cta?: string;
  } | null;

  const channel = content?.channel ?? "";
  const subject = content?.subject ?? "";
  const body = content?.body ?? "";
  const audience = content?.audience ?? "";
  const cta = content?.cta ?? "";

  if (!body) {
    return <p className="text-sm italic text-ink-faint">(empty draft)</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
        {channel && (
          <span className="font-mono uppercase tracking-wide text-ink-faint">
            {CHANNEL_LABEL[channel] ?? channel.toUpperCase()}
          </span>
        )}
        {audience && (
          <span className="text-ink-mute">For: {audience}</span>
        )}
        {cta && <span className="text-ink-mute">CTA: {cta}</span>}
      </div>
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
            <p
              key={idx}
              data-paragraph-index={idx}
              className="whitespace-pre-wrap"
            >
              {para}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
