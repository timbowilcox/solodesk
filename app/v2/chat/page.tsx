import { CrossVentureChatClient } from "@/components/v2/CrossVentureChatClient";
import { requireUserContext } from "@/lib/auth/guard";

export const metadata = {
  title: "Chat — SoloDesk v2",
};

export default async function V2ChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUserContext();

  const sParams = await searchParams;
  const initialQuery =
    typeof sParams.q === "string" ? sParams.q : undefined;

  return (
    <div style={{ padding: "32px 0 0" }}>
      <header style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px 20px" }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "#0A0A0A",
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Portfolio chat
        </h1>
        <p style={{ fontSize: 13, color: "#999", margin: "4px 0 0" }}>
          Answers draw on decisions and context across all your ventures.
        </p>
      </header>
      <CrossVentureChatClient initialQuery={initialQuery} />
    </div>
  );
}
