import "server-only";

// Adapter functions: turn an external trigger (Stripe webhook payload,
// metric snapshot row, command bar query) into a Loop8TriggerInput and
// fire it through reactive.ts.
//
// These adapters keep the trigger surface narrow — every Loop 8
// invocation flows through `triggerLoop8` so dedup + runner is the
// single source of truth.

import type { Json } from "@/lib/supabase/types";

import { triggerLoop8 } from "@/lib/loops/loop-8/reactive";

const STRIPE_INTERESTING_TYPES = new Set<string>([
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.deleted",
  "customer.subscription.created",
  "charge.failed",
  "charge.refunded",
]);

/**
 * Stripe webhook adapter. Only fires Loop 8 for event types that
 * indicate revenue movement; ignores housekeeping events.
 */
export async function triggerLoop8FromStripe(opts: {
  ventureId: string;
  type: string;
  payload: Json;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!STRIPE_INTERESTING_TYPES.has(opts.type)) {
    return { ok: true };
  }
  const summary = describeStripeEvent(opts.type);
  const result = await triggerLoop8({
    source: "webhook",
    ventureId: opts.ventureId,
    metricKind: `stripe.${opts.type}`,
    title: `Stripe: ${summary}`,
    task: `Stripe webhook fired: ${opts.type}.\n\nInvestigate the revenue impact on this venture and produce a Decision Document covering Context, Recommendation, Evidence, Risk, and Kill criteria. Cite the actual values in the webhook payload below.\n\nPayload (truncated):\n${truncate(JSON.stringify(opts.payload), 2_000)}`,
    payload: { stripe_type: opts.type } as Json,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/**
 * Threshold-cron adapter. Called by /api/cron/loop8-threshold once
 * per day for each venture × metric pair that has new data.
 */
export async function triggerLoop8FromThreshold(opts: {
  ventureId: string;
  metricKind: string;
  observedValue: number;
  expectedLow: number;
  expectedHigh: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const direction =
    opts.observedValue < opts.expectedLow ? "below" : "above";
  const result = await triggerLoop8({
    source: "threshold",
    ventureId: opts.ventureId,
    metricKind: `threshold.${opts.metricKind}`,
    title: `${capitalise(opts.metricKind)} ${direction} expected`,
    task: `Threshold breach: ${opts.metricKind} = ${opts.observedValue} (expected ${opts.expectedLow}–${opts.expectedHigh}).\n\nInvestigate and produce a Decision Document covering Context, Recommendation, Evidence, Risk, Kill criteria.`,
    payload: {
      metric_kind: opts.metricKind,
      observed: opts.observedValue,
      expected_low: opts.expectedLow,
      expected_high: opts.expectedHigh,
    } as Json,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/**
 * Manual command-bar adapter. The command bar's loop8-investigate
 * handler calls this with the operator's free-text question.
 */
export async function triggerLoop8FromManual(opts: {
  ventureId: string;
  question: string;
  metricHint: string | null;
}): Promise<{ ok: true; documentId: string | null } | { ok: false; error: string }> {
  const metricKind =
    opts.metricHint?.trim() || "manual." + opts.question.slice(0, 40).trim();
  const result = await triggerLoop8({
    source: "manual",
    ventureId: opts.ventureId,
    metricKind,
    title: opts.question.split(/\s+/).slice(0, 8).join(" "),
    task: opts.question,
    payload: {
      kind: "manual_query",
      metric_hint: opts.metricHint ?? null,
    } as Json,
  });
  if (!result.ok) return { ok: false, error: result.error };
  if (result.deduped) return { ok: true, documentId: null };
  return { ok: true, documentId: result.documentId };
}

function describeStripeEvent(type: string): string {
  switch (type) {
    case "invoice.paid":
      return "invoice paid";
    case "invoice.payment_failed":
      return "invoice payment failed";
    case "customer.subscription.deleted":
      return "subscription cancelled";
    case "customer.subscription.created":
      return "new subscription";
    case "charge.failed":
      return "charge failed";
    case "charge.refunded":
      return "charge refunded";
    default:
      return type;
  }
}

function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}
