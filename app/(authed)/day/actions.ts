"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUserContext } from "@/lib/auth/guard";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DayItemType } from "@/lib/supabase/types";

// Toggle the dismissed state of a single Day item for the current user.
// Bright line: row insert is keyed to `user.userId` from requireUserContext;
// the form input cannot supply an alternate user_id. Members cannot dismiss
// other operators' items.

const inputSchema = z.object({
  kind: z.enum(["document", "agent_note", "anomaly", "support_ticket"]),
  id: z.string().uuid(),
  dismissed: z.enum(["true", "false"]),
});

export async function toggleDayDismissalAction(
  formData: FormData,
): Promise<void> {
  const parsed = inputSchema.safeParse({
    kind: formData.get("kind"),
    id: formData.get("id"),
    dismissed: formData.get("dismissed"),
  });
  if (!parsed.success) {
    revalidatePath("/day");
    return;
  }

  const user = await requireUserContext();
  const supabase = createSupabaseAdminClient();
  const { kind, id, dismissed } = parsed.data;
  const itemType = kind as DayItemType;

  if (dismissed === "true") {
    // Currently dismissed -> un-dismiss by deleting the row.
    await supabase
      .from("day_item_dismissals")
      .delete()
      .eq("user_id", user.userId)
      .eq("item_type", itemType)
      .eq("item_id", id);
  } else {
    // Currently active -> insert a dismissal row. The unique constraint
    // catches double-clicks; we ignore the duplicate error.
    const { error } = await supabase.from("day_item_dismissals").insert({
      user_id: user.userId,
      item_type: itemType,
      item_id: id,
    });
    if (error && error.code !== "23505") {
      console.error("[day] toggle insert failed", error.message);
    }
  }

  revalidatePath("/day");
}
