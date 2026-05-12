import type { Tables } from "@/lib/supabase/types";

import type { CommentRow } from "./comment";
import { Section, type SectionRow } from "./section";

export type DocumentRow = Tables<"documents">;

export function Document({
  document,
  sections,
  comments = [],
  editable = false,
  ventureSlug,
  documentId,
}: {
  document: DocumentRow;
  sections: SectionRow[];
  comments?: CommentRow[];
  editable?: boolean;
  ventureSlug?: string;
  documentId?: string;
}) {
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-ink-strong">
          {document.title}
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
      </header>
      <div className="space-y-8">
        {sections.length === 0 ? (
          <p className="py-4 text-sm italic text-ink-mute">
            No sections in this document.
          </p>
        ) : (
          sections.map((s) => (
            <Section
              key={s.id}
              section={s}
              editable={editable}
              comments={comments}
              ventureSlug={ventureSlug}
              documentId={documentId}
            />
          ))
        )}
      </div>
    </article>
  );
}
