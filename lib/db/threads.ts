import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  LoopThreadMessageRole,
  Tables,
} from "@/lib/supabase/types";

export type LoopThreadRow = Tables<"loop_threads">;
export type LoopThreadMessageRow = Tables<"loop_thread_messages">;

export async function listThreadsForUser(opts: {
  ventureId: string;
  userId: string;
  loopName: string;
}): Promise<LoopThreadRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("loop_threads")
    .select("*")
    .eq("venture_id", opts.ventureId)
    .eq("user_id", opts.userId)
    .eq("loop_name", opts.loopName)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[threads] list failed", error.message);
    return [];
  }
  return data ?? [];
}

export async function getOrCreateActiveThread(opts: {
  ventureId: string;
  userId: string;
  loopName: string;
}): Promise<LoopThreadRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase
    .from("loop_threads")
    .select("*")
    .eq("venture_id", opts.ventureId)
    .eq("user_id", opts.userId)
    .eq("loop_name", opts.loopName)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase
    .from("loop_threads")
    .insert({
      venture_id: opts.ventureId,
      user_id: opts.userId,
      loop_name: opts.loopName,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[threads] create failed", error.message);
    return null;
  }
  return data;
}

export async function getThread(opts: {
  threadId: string;
  ventureId: string;
}): Promise<LoopThreadRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("loop_threads")
    .select("*")
    .eq("id", opts.threadId)
    .eq("venture_id", opts.ventureId)
    .maybeSingle();
  return data ?? null;
}

export async function listMessages(
  threadId: string,
): Promise<LoopThreadMessageRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("loop_thread_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[threads] list messages failed", error.message);
    return [];
  }
  return data ?? [];
}

export async function appendMessage(opts: {
  threadId: string;
  role: LoopThreadMessageRole;
  body?: string;
  documentId?: string | null;
  loopRunId?: string | null;
}): Promise<LoopThreadMessageRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("loop_thread_messages")
    .insert({
      thread_id: opts.threadId,
      role: opts.role,
      body: opts.body ?? "",
      document_id: opts.documentId ?? null,
      loop_run_id: opts.loopRunId ?? null,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[threads] append failed", error.message);
    return null;
  }
  return data;
}
