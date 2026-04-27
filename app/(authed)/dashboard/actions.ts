"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { insertManualEvent } from "@/lib/db/events";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

const inputSchema = z.object({
  source: z.string().trim().min(1).max(64),
  type: z.string().trim().min(1).max(64),
  ventureSlug: z.string().trim().min(1).max(64).nullable(),
  payload: z.string(),
});

export async function createEventAction(formData: FormData): Promise<void> {
  const parsed = inputSchema.safeParse({
    source: formData.get("source"),
    type: formData.get("type"),
    ventureSlug: (formData.get("venture") as string | null) || null,
    payload: (formData.get("payload") as string | null) ?? "",
  });

  if (!parsed.success) {
    redirect("/dashboard?error=invalid_input");
  }

  const { source, type, ventureSlug, payload } = parsed.data;

  let parsedPayload: Json = {};
  if (payload.trim().length > 0) {
    try {
      parsedPayload = JSON.parse(payload) as Json;
    } catch {
      redirect("/dashboard?error=invalid_json");
    }
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actor = user?.email ?? null;

  const result = await insertManualEvent({
    source,
    type,
    ventureSlug,
    actor,
    payload: parsedPayload,
  });

  if ("error" in result) {
    redirect("/dashboard?error=insert_failed");
  }
  if ("duplicate" in result) {
    redirect("/dashboard?error=duplicate");
  }

  revalidatePath("/dashboard");
  revalidatePath("/events");
  redirect(`/dashboard?created=${result.id}`);
}
