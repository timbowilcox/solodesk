"use client";

import { useState } from "react";

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        setState({
          kind: "error",
          message: "Too many requests. Try again later.",
        });
        return;
      }
      if (!res.ok) {
        setState({
          kind: "error",
          message: "Something went wrong. Try again.",
        });
        return;
      }
      setState({ kind: "success" });
    } catch {
      setState({ kind: "error", message: "Network error. Try again." });
    }
  }

  if (state.kind === "success") {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
      >
        Thanks. We&apos;ll be in touch.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="waitlist-email">
          Email
        </label>
        <input
          id="waitlist-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          disabled={state.kind === "submitting"}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        />
        <button
          type="submit"
          disabled={state.kind === "submitting"}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.kind === "submitting" ? "Sending…" : "Join waitlist"}
        </button>
      </div>
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
