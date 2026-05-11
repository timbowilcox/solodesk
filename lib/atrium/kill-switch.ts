"use server";

// lib/atrium/kill-switch.ts
// Server actions for the ⌘⇧. kill switch keybinding.
// These are thin wrappers that avoid importing server-only through the client bundle.

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUserContext } from "@/lib/auth/guard";

export async function triggerKillSwitch(reason?: string): Promise<void> {
  const user = await requireUserContext();
  const supabase = createSupabaseAdminClient();

  await supabase.rpc("ensure_kill_switch_row", { p_operator_id: user.userId });
  await supabase
    .from("operator_kill_switch")
    .update({
      killed: true,
      killed_at: new Date().toISOString(),
      killed_reason: reason ?? "operator kill switch — keyboard shortcut",
      restored_at: null,
    })
    .eq("operator_id", user.userId);
}
