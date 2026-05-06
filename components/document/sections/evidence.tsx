import type { SectionRow } from "../section";

type EvidenceItem = { text: string; source?: string };

export function EvidenceSection({
  section,
}: {
  section: SectionRow;
  editable: boolean;
}) {
  const content = section.content as {
    text?: string;
    items?: EvidenceItem[];
  } | null;
  const text = content?.text ?? "";
  const items = Array.isArray(content?.items) ? content.items : [];

  if (!text && items.length === 0) {
    return <p className="text-sm italic text-ink-faint">(empty)</p>;
  }

  return (
    <div className="space-y-3">
      {text && (
        <p className="whitespace-pre-wrap text-md leading-[1.55] text-ink">
          {text}
        </p>
      )}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-3 text-base">
              <span className="font-mono text-ink-faint">[{idx + 1}]</span>
              <span className="flex-1 text-ink">
                {item.text}
                {item.source && (
                  <span className="ml-2 text-ink-mute">— {item.source}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
