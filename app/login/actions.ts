"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { findAllowedUser } from "@/lib/auth/allowlist";
import { getRequestOrigin } from "@/lib/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().toLowerCase().email();

export async function loginAction(formData: FormData): Promise<void> {
  const raw = formData.get("email");
  const parsed = emailSchema.safeParse(typeof raw === "string" ? raw : "");

  if (!parsed.success) {
    redirect("/login?error=invalid_email");
  }

  const email = parsed.data;
  const allowed = await findAllowedUser(email);

  if (allowed) {
    const supabase = await createSupabaseServerClient();
    const origin = await getRequestOrigin();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    if (error) {
      console.error("[login] signInWithOtp failed", error);
    }
  }

  redirect("/login?sent=1");
}
