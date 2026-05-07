"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  auditDateKey,
  generatePortfolioAudit,
} from "@/lib/db/portfolio-audit";

export async function generatePortfolioAuditAction(): Promise<void> {
  const dateKey = auditDateKey();
  const result = await generatePortfolioAudit({ dateKey });
  if (!result.ok) {
    redirect(`/portfolio?error=generate_failed`);
  }
  revalidatePath(`/portfolio`);
  revalidatePath(`/portfolio/${dateKey}`);
  redirect(`/portfolio/${dateKey}`);
}
