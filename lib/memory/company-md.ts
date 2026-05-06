import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { embedRow } from "@/lib/memory/embed";
import { chunkMarkdown } from "@/lib/memory/chunk";

/**
 * Chunk a venture's COMPANY.md into venture_chunks rows and fire-and-forget
 * embeddings. Called after venture create / update when company_md is set.
 *
 * Strategy: bump source_version, insert new chunks, leave old chunks in place
 * (the recall query filters by `source_version = max`). For v0 we just delete
 * old + insert new since rolling history isn't load-bearing yet.
 */
export async function indexCompanyMd(opts: {
  ventureId: string;
  companyMd: string;
}): Promise<{ ok: true; chunks: number } | { ok: false; error: string }> {
  const text = opts.companyMd?.trim() ?? "";
  if (text.length === 0) return { ok: true, chunks: 0 };

  const supabase = createSupabaseAdminClient();

  // Look up max existing source_version for this (venture, source) so we can
  // bump it. v0 keeps history flat — delete-and-replace is fine.
  const { data: prior } = await supabase
    .from("venture_chunks")
    .select("source_version")
    .eq("venture_id", opts.ventureId)
    .eq("source", "company_md")
    .order("source_version", { ascending: false })
    .limit(1);

  const nextVersion =
    prior && prior.length > 0 && prior[0]
      ? (prior[0].source_version ?? 0) + 1
      : 1;

  // Drop prior chunks for this venture+source (v0 simplification)
  if (nextVersion > 1) {
    await supabase
      .from("venture_chunks")
      .delete()
      .eq("venture_id", opts.ventureId)
      .eq("source", "company_md");
  }

  const chunks = chunkMarkdown(text);
  if (chunks.length === 0) return { ok: true, chunks: 0 };

  const { data, error } = await supabase
    .from("venture_chunks")
    .insert(
      chunks.map((c) => ({
        venture_id: opts.ventureId,
        source: "company_md" as const,
        source_version: nextVersion,
        ord: c.ord,
        text: c.text,
      })),
    )
    .select("id");

  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }

  // Fire-and-forget embeddings. Cron is the safety net.
  for (const row of data) {
    void embedRow("venture_chunks", row.id).catch((e: unknown) => {
      console.error(
        "[indexCompanyMd] chunk embed failed (cron will retry)",
        e instanceof Error ? e.message : e,
      );
    });
  }

  return { ok: true, chunks: chunks.length };
}
