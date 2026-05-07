import Link from "next/link";

import { requireAdminContext } from "@/lib/auth/guard";
import {
  auditDateKey,
  listPortfolioAudits,
} from "@/lib/db/portfolio-audit";

import { generatePortfolioAuditAction } from "./actions";

export const metadata = {
  title: "Portfolio — SoloDesk",
};

const ERROR_MESSAGES: Record<string, string> = {
  generate_failed: "Generating portfolio audit failed.",
};

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-AU", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminContext();

  const sParams = await searchParams;
  const error = typeof sParams.error === "string" ? sParams.error : null;

  const audits = await listPortfolioAudits({ limit: 60 });
  const today = auditDateKey();
  const todaysAudit = audits.find((a) => a.date_key === today);

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
            Portfolio
          </h1>
          <div className="h-px w-12 bg-accent opacity-50" />
          <p className="pt-2 text-sm text-ink-mute">
            Cross-venture audit (Loop 11). Surfaces stale priorities, unused
            capabilities, missing connections, low activity. Runs Sunday 07:00
            Sydney; manual trigger below. Differentiator vs running Claude
            Code per venture.
          </p>
        </div>
        {todaysAudit ? (
          <Link
            href={`/portfolio/${today}`}
            className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
          >
            View today
          </Link>
        ) : (
          <form action={generatePortfolioAuditAction}>
            <button
              type="submit"
              className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
            >
              Run audit now
            </button>
          </form>
        )}
      </header>

      {error && (
        <p className="text-sm text-negative">
          {ERROR_MESSAGES[error] ?? "Something went wrong."}
        </p>
      )}

      {audits.length === 0 ? (
        <p className="py-4 text-sm text-ink-mute">No portfolio audits yet.</p>
      ) : (
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Date
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Title
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Findings
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Generated
              </th>
            </tr>
          </thead>
          <tbody>
            {audits.map((a) => (
              <tr
                key={a.id}
                className="border-b border-rule transition-colors duration-[80ms] hover:bg-paper-card"
              >
                <td className="px-3 py-2 font-mono text-sm">
                  {a.date_key ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/portfolio/${a.date_key ?? a.id}`}
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    {a.title}
                  </Link>
                  {a.date_key === today && (
                    <span className="ml-2 inline-flex items-center bg-info-bg px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide text-info">
                      TODAY
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 tabular text-base">
                  {a.finding_count}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink-mute">
                  {formatTs(a.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
