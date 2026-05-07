import Link from "next/link";

import { requireVentureAccess } from "@/lib/auth/guard";
import { listMembersForVenture } from "@/lib/auth/membership";

import { addMemberAction, removeMemberAction } from "./actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: `Members — ${slug} — SoloDesk` };
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Email and role are required.",
  add_failed: "Adding member failed.",
  remove_failed: "Removing member failed.",
};

const inputClass =
  "block w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-b-2 focus:border-accent focus:outline-none";

const labelClass =
  "block text-xs font-medium uppercase tracking-wide text-ink-mute";

const ROLE_LABEL: Record<string, string> = {
  operator: "operator",
  editor: "editor",
  viewer: "viewer",
};

const USER_ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  admin: { label: "ADMIN", cls: "bg-info-bg text-info" },
  member: { label: "MEMBER", cls: "text-ink-mute" },
};

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default async function VentureMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const { user, venture } = await requireVentureAccess(slug);

  const sParams = await searchParams;
  const error = typeof sParams.error === "string" ? sParams.error : null;
  const message = typeof sParams.message === "string" ? sParams.message : null;
  const added = sParams.added === "1";
  const removed = sParams.removed === "1";

  const members = await listMembersForVenture(venture.id);
  const isAdmin = user.isAdmin;

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
          Members
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
        <p className="pt-2 text-sm text-ink-mute">
          Teammates assigned to {venture.name}. Admins (per{" "}
          <span className="font-mono">allowed_users.role</span>) see every
          venture by default. Members listed here see this venture only.
        </p>
      </header>

      {error && (
        <p className="text-sm text-negative">
          {ERROR_MESSAGES[error] ?? "Something went wrong."}
          {message ? ` — ${message}` : ""}
        </p>
      )}
      {added && <p className="text-sm text-positive">Member added.</p>}
      {removed && <p className="text-sm text-positive">Member removed.</p>}

      {isAdmin && (
        <section className="space-y-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
            Add member
          </h2>
          <p className="text-sm text-ink-mute">
            User must already exist in <span className="font-mono">allowed_users</span>.
            Invite via SQL first if not — team inbound doesn&rsquo;t create
            accounts.
          </p>
          <form action={addMemberAction} className="space-y-4">
            <input type="hidden" name="venture_slug" value={slug} />
            <div className="grid gap-6 md:grid-cols-2">
              <label className="space-y-1">
                <span className={labelClass}>Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={200}
                  placeholder="teammate@example.com"
                  className={inputClass}
                />
              </label>
              <label className="space-y-1">
                <span className={labelClass}>Role</span>
                <select
                  name="role"
                  required
                  defaultValue="viewer"
                  className={inputClass}
                >
                  <option value="operator">operator (full access)</option>
                  <option value="editor">editor (read + write)</option>
                  <option value="viewer">viewer (read-only)</option>
                </select>
              </label>
            </div>
            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
              >
                Add member
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
          Current members ({members.length})
        </h2>
        {members.length === 0 ? (
          <p className="py-4 text-sm text-ink-mute">
            No members for {venture.name}. Admins still see this venture
            regardless.
          </p>
        ) : (
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                  Email
                </th>
                <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                  Account
                </th>
                <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                  Role
                </th>
                <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                  Added
                </th>
                {isAdmin && <th className="px-3 py-2 text-right" />}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const accountBadge =
                  USER_ROLE_BADGE[m.user_role] ?? USER_ROLE_BADGE.member!;
                return (
                  <tr key={m.id} className="border-b border-rule">
                    <td className="px-3 py-2 font-mono text-sm">{m.email}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide ${accountBadge.cls}`}
                      >
                        {accountBadge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-sm">
                      {ROLE_LABEL[m.role] ?? m.role}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-mute">
                      {formatTs(m.created_at)}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2 text-right">
                        <form action={removeMemberAction} className="inline">
                          <input
                            type="hidden"
                            name="venture_slug"
                            value={slug}
                          />
                          <input
                            type="hidden"
                            name="member_id"
                            value={m.id}
                          />
                          <button
                            type="submit"
                            className="text-sm text-negative underline-offset-2 hover:underline"
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
