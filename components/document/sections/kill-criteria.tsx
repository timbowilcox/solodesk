import type { SectionRow } from "../section";

export function KillCriteriaSection({
  section,
}: {
  section: SectionRow;
  editable: boolean;
}) {
  const text = (section.content as { text?: string } | null)?.text ?? "";
  if (!text) {
    return <p className="text-sm italic text-ink-faint">(empty)</p>;
  }
  return (
    <p className="whitespace-pre-wrap text-md leading-[1.55] text-ink">
      {text}
    </p>
  );
}
