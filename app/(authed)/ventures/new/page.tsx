import Link from "next/link";

import { createVentureAction } from "./actions";

export const metadata = {
  title: "New venture — SoloDesk",
};

const PHASES = ["discovery", "build", "launch", "scale", "dormant"] as const;

const inputClass =
  "block w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-b-2 focus:border-accent focus:outline-none";

const labelClass =
  "block text-xs font-medium uppercase tracking-wide text-ink-mute";

export default async function NewVenturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const message = typeof params.message === "string" ? params.message : null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs">
          <Link
            href="/ventures"
            className="text-accent underline-offset-2 hover:underline"
          >
            ← Ventures
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
          New venture
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
        <p className="pt-2 text-sm text-ink-mute">
          Slugs are immutable in v0; pick carefully. COMPANY.md can be edited
          later by hand.
        </p>
      </header>

      <form action={createVentureAction} className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <label className="space-y-1">
            <span className={labelClass}>Slug</span>
            <input
              name="slug"
              required
              maxLength={48}
              pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
              placeholder="kounta"
              className={`${inputClass} font-mono`}
            />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Name</span>
            <input
              name="name"
              required
              maxLength={80}
              placeholder="Kounta"
              className={inputClass}
            />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Phase</span>
            <select
              name="phase"
              required
              defaultValue="discovery"
              className={inputClass}
            >
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className={labelClass}>North-star metric</span>
            <input
              name="north_star"
              maxLength={120}
              placeholder="MRR, weekly active stylists, …"
              className={inputClass}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className={labelClass}>COMPANY.md</span>
          <textarea
            name="company_md"
            rows={12}
            placeholder="Mission. ICP. Positioning. Anti-patterns. ..."
            className="block w-full border border-rule-strong bg-paper-card px-3 py-2 font-mono text-sm text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
        </label>

        <div className="flex items-center justify-between pt-2">
          {error ? (
            <p className="text-sm text-negative">
              {message ?? "Saving failed."}
            </p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
          >
            Create venture
          </button>
        </div>
      </form>
    </div>
  );
}
