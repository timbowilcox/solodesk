"use server";

import { crossVentureSearch } from "@/lib/chat/cross-venture";
import type { CrossVentureHit } from "@/lib/chat/cross-venture";

type RecallResult =
  | { ok: true; hits: CrossVentureHit[] }
  | { ok: false; error: string };

export async function crossVentureRecallAction(
  formData: FormData,
): Promise<RecallResult> {
  const query = (formData.get("query") as string | null)?.trim() ?? "";
  if (!query) {
    return { ok: false, error: "Query is required." };
  }
  return crossVentureSearch({ query });
}
