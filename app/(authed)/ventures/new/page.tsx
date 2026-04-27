import Link from "next/link";

import { createVentureAction } from "./actions";

export const metadata = {
  title: "New venture — SoloDesk",
};

const PHASES = ["discovery", "build", "launch", "scale", "dormant"] as const;

export default async function NewVenturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const message = typeof params.message === "string" ? params.message : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs text-muted-foreground">
          <Link href="/ventures" className="underline-offset-2 hover:underline">
            ← Ventures
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">New venture</h1>
        <p className="text-sm text-muted-foreground">
          Slugs are immutable in v0; pick carefully. COMPANY.md can be edited
          later by hand.
        </p>
      </header>

      <form
        action={createVentureAction}
        className="space-y-4 rounded-md border border-border bg-muted/20 p-4"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Slug
            </span>
            <input
              name="slug"
              required
              maxLength={48}
              pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
              placeholder="kounta"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Name
            </span>
            <input
              name="name"
              required
              maxLength={80}
              placeholder="Kounta"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Phase
            </span>
            <select
              name="phase"
              required
              defaultValue="discovery"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            >
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              North-star metric
            </span>
            <input
              name="north_star"
              maxLength={120}
              placeholder="MRR, weekly active stylists, …"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            COMPANY.md
          </span>
          <textarea
            name="company_md"
            rows={12}
            placeholder="Mission. ICP. Positioning. Anti-patterns. ..."
            className="block w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <div className="flex items-center justify-between">
          {error ? (
            <p className="text-sm text-destructive">
              {error === "invalid_input"
                ? message ?? "Check the form fields."
                : message ?? "Saving failed."}
            </p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            Create venture
          </button>
        </div>
      </form>
    </div>
  );
}
