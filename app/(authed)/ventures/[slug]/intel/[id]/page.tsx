import Link from "next/link";
import { notFound } from "next/navigation";

import { Document } from "@/components/document/document";
import {
  getDocumentWithSections,
  listCommentsForSections,
} from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  const ctx = await getDocumentWithSections({
    documentId: id,
    ventureId: venture.id,
  });
  if (!ctx) return { title: "Not found — SoloDesk" };
  return { title: `${ctx.document.title} — Intel — SoloDesk` };
}

export default async function IntelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) notFound();

  const ctx = await getDocumentWithSections({
    documentId: id,
    ventureId: venture.id,
  });
  if (!ctx) notFound();

  const comments = await listCommentsForSections(ctx.sections.map((s) => s.id));
  const sParams = await searchParams;
  const fresh = sParams.fresh === "1";

  return (
    <div className="space-y-10">
      <nav className="flex items-center gap-3 text-xs">
        <Link
          href={`/ventures/${slug}/intel`}
          className="text-accent underline-offset-2 hover:underline"
        >
          ← Intel
        </Link>
        <span className="text-ink-faint">·</span>
        <span className="font-mono text-ink-mute">{venture.name}</span>
      </nav>

      {fresh && (
        <p className="text-sm text-ink-mute">
          Digest saved. The intel-critic is reviewing — comments may appear on
          signal rows when its pass completes.
        </p>
      )}

      <Document
        document={ctx.document}
        sections={ctx.sections}
        comments={comments}
        editable={false}
      />
    </div>
  );
}
