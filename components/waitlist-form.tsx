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
      <p role="status" className="text-sm text-ink-mute">
        Thanks. We&rsquo;ll be in touch.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1 text-left">
          <span className="block text-xs font-medium uppercase tracking-wide text-ink-mute">
            Email
          </span>
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
            className="block w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-b-2 focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={state.kind === "submitting"}
          className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.kind === "submitting" ? "Sending…" : "Join waitlist"}
        </button>
      </div>
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-negative">
          {state.message}
        </p>
      )}
    </form>
  );
}
