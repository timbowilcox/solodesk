import type { SectionRow } from "../section";

export function AgentNoteSection({
  section,
}: {
  section: SectionRow;
  editable: boolean;
}) {
  const content = section.content as {
    question?: string;
    decision?: string;
    alternatives?: string;
  } | null;
  const question = content?.question ?? "";
  const decision = content?.decision ?? "";
  const alternatives = content?.alternatives ?? "";

  if (!question && !decision) {
    return <p className="text-sm italic text-ink-faint">(empty)</p>;
  }

  return (
    <div className="space-y-3 border-l-2 border-caution pl-4">
      {question && (
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-wide text-caution">
            Ambiguity resolved
          </p>
          <p className="whitespace-pre-wrap text-base leading-[1.55] text-ink">
            {question}
          </p>
        </div>
      )}
      {decision && (
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Decision taken
          </p>
          <p className="whitespace-pre-wrap text-base leading-[1.55] text-ink">
            {decision}
          </p>
        </div>
      )}
      {alternatives && (
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Alternatives considered
          </p>
          <p className="whitespace-pre-wrap text-base leading-[1.55] text-ink">
            {alternatives}
          </p>
        </div>
      )}
    </div>
  );
}
