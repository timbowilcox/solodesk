import type { NextRequest } from "next/server";

const LANDING_HOSTS = new Set(["solodesk.ai", "www.solodesk.ai"]);

export type HostKind = "landing" | "app";

export function hostnameOf(request: NextRequest): string {
  const raw =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "";
  return (raw.split(":")[0] ?? "").toLowerCase();
}

export function hostKind(request: NextRequest): HostKind {
  const hostname = hostnameOf(request);
  if (LANDING_HOSTS.has(hostname)) return "landing";
  return "app";
}
