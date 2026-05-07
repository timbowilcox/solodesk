import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { CommandBar } from "@/components/chrome/CommandBar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AuthedLayout({
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
    <div className="flex min-h-screen bg-paper">
      <AppSidebar email={user.email} />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-12 py-12">{children}</div>
      </main>
      <CommandBar operatorEmail={user.email} />
    </div>
  );
}
