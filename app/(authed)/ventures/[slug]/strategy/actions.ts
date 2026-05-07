"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireVentureAccess } from "@/lib/auth/guard";
import {
  appendMessage,
  getOrCreateActiveThread,
} from "@/lib/db/threads";

const inputSchema = z.object({
  slug: z.string().min(1),
  threadId: z.string().uuid().optional(),
  body: z.string().min(1).max(8_000),
});

// Append the operator's message to the conversation thread. The
// streaming agent invocation is triggered separately from the client
// (it needs to consume an SSE stream); this action only handles the
// persistence of the operator's prompt.
export async function appendOperatorMessageAction(
  formData: FormData,
): Promise<void> {
  const parsed = inputSchema.safeParse({
    slug: formData.get("slug"),
    threadId: formData.get("threadId") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return;
  }
  const { user, venture } = await requireVentureAccess(parsed.data.slug);
  // Resolve thread (existing one explicitly passed, or active for this user/venture).
  let threadId = parsed.data.threadId;
  if (!threadId) {
    const thread = await getOrCreateActiveThread({
      ventureId: venture.id,
      userId: user.userId,
      loopName: "01-strategy",
    });
    if (!thread) return;
    threadId = thread.id;
  }
  await appendMessage({
    threadId,
    role: "operator",
    body: parsed.data.body,
  });
  revalidatePath(`/ventures/${parsed.data.slug}/strategy`);
}
