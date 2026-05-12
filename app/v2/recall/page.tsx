import { RecallClient } from "@/components/v2/RecallClient";
import { requireUserContext } from "@/lib/auth/guard";

export const metadata = {
  title: "Recall — SoloDesk v2",
};

export default async function V2RecallPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUserContext();

  const sParams = await searchParams;
  const initialQuery =
    typeof sParams.q === "string" ? sParams.q : undefined;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 32px" }}>
      <header style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: "#0A0A0A",
            margin: 0,
            letterSpacing: "-0.03em",
          }}
        >
          Recall
        </h1>
        <p style={{ fontSize: 13, color: "#999", margin: "4px 0 0" }}>
          Semantic search across decisions, memories, and venture context.
        </p>
      </header>
      <RecallClient initialQuery={initialQuery} />
    </div>
  );
}
