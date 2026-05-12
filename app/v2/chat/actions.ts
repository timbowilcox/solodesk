"use server";

import { runCrossVentureChat } from "@/lib/chat/cross-venture";
import type { CrossVentureChatResult } from "@/lib/chat/cross-venture";

export async function crossVentureChatAction(
  formData: FormData,
): Promise<CrossVentureChatResult> {
  const query = (formData.get("query") as string | null)?.trim() ?? "";
  if (!query) {
    return { ok: false, error: "Query is required." };
  }
  return runCrossVentureChat({ query });
}
