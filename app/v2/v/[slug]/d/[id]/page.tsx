import Link from "next/link";
import { notFound } from "next/navigation";

import { DecisionCanvasClient } from "@/components/v2/DecisionCanvasClient";
import { ConversationThread } from "@/components/loop1/ConversationThread";
import {
  getDocumentWithSections,
  isApprovableDocumentStatus,
  findUnresolvedAgentNotes,
  listCommentsForSections,
} from "@/lib/db/documents";
import { requireVentureAccess } from "@/lib/auth/guard";
import { getVentureBySlug } from "@/lib/db/ventures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { MessageView } from "@/components/loop1/MessageBubble";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk v2" };
  const ctx = await getDocumentWithSections({
    documentId: id,
    ventureId: venture.id,
  });
  if (!ctx) return { title: "Not found — SoloDesk v2" };
  return { title: `${ctx.document.title} — ${venture.name} — SoloDesk v2` };
}

export default async function V2DecisionCanvasPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const { venture } = await requireVentureAccess(slug);

  const ctx = await getDocumentWithSections({
    documentId: id,
    ventureId: venture.id,
  });
  if (!ctx) notFound();

  const comments = await listCommentsForSections(
    ctx.sections.map((s) => s.id),
  );

  const sParams = await searchParams;
  const fresh = sParams.fresh === "1";

  const isApprovable = isApprovableDocumentStatus(ctx.document.status);
  const unresolvedCount = isApprovable
    ? findUnresolvedAgentNotes(ctx.sections).length
    : 0;

  // Load the strategy thread for this venture to show in the left panel
  const supabase = createSupabaseAdminClient();
  const { data: threadRow } = await supabase
    .from("loop_threads")
    .select("id")
    .eq("venture_id", venture.id)
    .eq("loop_name", "01-strategy")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const threadId = threadRow?.id ?? null;

  // Load recent messages for this thread if it exists
  let messages: MessageView[] = [];
  if (threadId) {
    const { data: msgs } = await supabase
      .from("loop_thread_messages")
      .select("id, role, body, document_id, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(20);
    messages = (msgs ?? []).map((m) => ({
      id: m.id,
      role: m.role as MessageView["role"],
      body: m.body ?? "",
      documentId: m.document_id,
      createdAt: m.created_at,
    }));
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* LEFT PANEL — conversation */}
      <div
        style={{
          width: 360,
          flexShrink: 0,
          borderRight: "1px solid #EAEAEA",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Panel header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #EAEAEA",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Link
            href={`/v2/v/${slug}`}
            style={{ fontSize: 12, color: "#2563EB", textDecoration: "none" }}
          >
            ← {venture.name}
          </Link>
          <span style={{ fontSize: 12, color: "#999" }}>/ Decision</span>
        </div>

        {/* Strategy conversation thread */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
          }}
        >
          {fresh && (
            <p
              style={{
                fontSize: 12,
                color: "#525252",
                marginBottom: 12,
                fontStyle: "italic",
              }}
            >
              Draft saved. Critic reviewing in background — comments appear on sections within 30s.
            </p>
          )}

          {threadId ? (
            <ConversationThread
              slug={slug}
              ventureId={venture.id}
              ventureName={venture.name}
              ventureAccent={venture.accent_color}
              threadId={threadId}
              messages={messages}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 13, color: "#525252" }}>
                <strong>Question reviewed.</strong> Continue the strategy conversation or start a new session.
              </p>
              <Link
                href={`/ventures/${slug}/office-hours`}
                style={{
                  display: "inline-block",
                  padding: "8px 16px",
                  background: "#2563EB",
                  color: "#fff",
                  textDecoration: "none",
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Start new session →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL — document canvas */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <DecisionCanvasClient
          document={ctx.document}
          sections={ctx.sections}
          comments={comments}
          ventureSlug={slug}
          unresolvedCount={unresolvedCount}
          isApprovable={isApprovable}
        />
        {/* Footer: open in full v1 view */}
        <div
          style={{
            padding: "10px 24px",
            borderTop: "1px solid #EAEAEA",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <Link
            href={`/ventures/${slug}/decisions/${id}`}
            style={{ fontSize: 12, color: "#999", textDecoration: "none" }}
          >
            Open in full view ↗
          </Link>
        </div>
      </div>
    </div>
  );
}
