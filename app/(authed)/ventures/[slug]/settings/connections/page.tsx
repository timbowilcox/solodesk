import Link from "next/link";
import { notFound } from "next/navigation";

import {
  KNOWN_PROVIDERS,
  listConnectionsForVenture,
} from "@/lib/connections/manage";
import { getVentureBySlug } from "@/lib/db/ventures";

import {
  createConnectionAction,
  revokeConnectionAction,
} from "./actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  return {
    title: `Connections — ${venture.name} — SoloDesk`,
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Admin role required.",
  invalid_input: "Provider, display name, and credentials JSON are required.",
  invalid_provider: "Unknown provider.",
  invalid_credentials_json: "Credentials JSON must parse to a JSON object.",
  invalid_scope_json: "Scope metadata JSON must parse to a JSON object.",
  create_failed: "Saving connection failed.",
  revoke_failed: "Revoking connection failed.",
};

const inputClass =
  "block w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-b-2 focus:border-accent focus:outline-none";

const textareaClass =
  "block w-full border border-rule-strong bg-paper-card px-3 py-2 font-mono text-sm text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-accent focus:outline-none";

const labelClass =
  "block text-xs font-medium uppercase tracking-wide text-ink-mute";

function formatTs(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function ConnectionsSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) notFound();

  const sParams = await searchParams;
  const error = typeof sParams.error === "string" ? sParams.error : null;
  const message = typeof sParams.message === "string" ? sParams.message : null;
  const created = typeof sParams.created === "string" ? sParams.created : null;
  const revoked = sParams.revoked === "1";

  const connections = await listConnectionsForVenture({
    ventureId: venture.id,
    includeRevoked: true,
  });
  const active = connections.filter((c) => !c.revoked_at);
  const revokedList = connections.filter((c) => c.revoked_at);

  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <p className="text-xs">
          <Link
            href={`/ventures/${slug}`}
            className="text-accent underline-offset-2 hover:underline"
          >
            ← {venture.name}
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
          Connections
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
        <p className="pt-2 text-sm text-ink-mute">
          External provider credentials for {venture.name}. Stored encrypted in
          Supabase Vault. Every read goes through{" "}
          <span className="font-mono">getConnection()</span> and writes a row to{" "}
          <span className="font-mono">connection_audit</span>. Use a service
          account at the provider, not your personal credentials.
        </p>
      </header>

      {error && (
        <p className="text-sm text-negative">
          {ERROR_MESSAGES[error] ?? "Something went wrong."}
          {message ? ` — ${message}` : ""}
        </p>
      )}
      {created && (
        <p className="text-sm text-positive">Connection {created} created.</p>
      )}
      {revoked && <p className="text-sm text-positive">Connection revoked.</p>}

      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
          Add connection
        </h2>
        <form action={createConnectionAction} className="space-y-6">
          <input type="hidden" name="venture_slug" value={slug} />
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-1">
              <span className={labelClass}>Provider</span>
              <select name="provider" required className={inputClass}>
                {KNOWN_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Display name</span>
              <input
                name="display_name"
                required
                maxLength={80}
                placeholder="Kounta Production Stripe"
                className={inputClass}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>
              Credentials JSON (encrypted at rest in Vault)
            </span>
            <textarea
              name="credentials_json"
              required
              rows={5}
              placeholder='{"api_key": "...", "account_id": "..."}'
              className={textareaClass}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>
              Scope metadata JSON (non-sensitive, queryable)
            </span>
            <textarea
              name="scope_metadata_json"
              rows={3}
              placeholder='{"environment": "prod", "account_email": "billing@example.com"}'
              className={textareaClass}
            />
          </label>
          <div className="flex items-center justify-end pt-2">
            <button
              type="submit"
              className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
            >
              Add connection
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
          Active ({active.length})
        </h2>
        {active.length === 0 ? (
          <p className="py-4 text-sm text-ink-mute">
            No active connections for {venture.name}.
          </p>
        ) : (
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                  Provider
                </th>
                <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                  Display name
                </th>
                <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                  Created
                </th>
                <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                  Scope
                </th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {active.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-rule transition-colors duration-[80ms] hover:bg-paper-card"
                >
                  <td className="px-3 py-2 font-mono text-sm">{c.provider}</td>
                  <td className="px-3 py-2">{c.display_name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-mute">
                    {formatTs(c.created_at)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-mute">
                    {Object.keys(c.scope_metadata as object).length === 0
                      ? "—"
                      : Object.entries(
                          c.scope_metadata as Record<string, unknown>,
                        )
                          .map(([k, v]) => `${k}=${String(v)}`)
                          .join(" · ")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <form action={revokeConnectionAction} className="inline">
                      <input type="hidden" name="venture_slug" value={slug} />
                      <input
                        type="hidden"
                        name="connection_id"
                        value={c.id}
                      />
                      <button
                        type="submit"
                        className="text-sm text-negative underline-offset-2 hover:underline"
                      >
                        Revoke
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {revokedList.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
            Revoked ({revokedList.length})
          </h2>
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                  Provider
                </th>
                <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                  Display name
                </th>
                <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                  Revoked
                </th>
              </tr>
            </thead>
            <tbody>
              {revokedList.map((c) => (
                <tr key={c.id} className="border-b border-rule">
                  <td className="px-3 py-2 font-mono text-sm text-ink-mute">
                    {c.provider}
                  </td>
                  <td className="px-3 py-2 text-ink-mute line-through">
                    {c.display_name}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-faint">
                    {formatTs(c.revoked_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
