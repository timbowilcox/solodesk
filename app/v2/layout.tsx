import { redirect } from "next/navigation";

import { V2Rail } from "@/components/v2/V2Rail";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function V2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#FFFFFF",
        fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
      }}
    >
      <V2Rail email={user.email} />
      <main
        style={{
          flex: 1,
          overflow: "hidden auto",
          minWidth: 0,
        }}
      >
        {children}
      </main>
    </div>
  );
}
