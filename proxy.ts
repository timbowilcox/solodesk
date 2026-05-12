import { NextResponse, type NextRequest } from "next/server";

import { findAllowedUser, touchLastLogin } from "@/lib/auth/allowlist";
import { hostKind } from "@/lib/host";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";

const APP_PUBLIC_PATHS = ["/login", "/auth"];
const APP_PUBLIC_API_PREFIXES = ["/api/webhooks", "/api/cron", "/api/_test"];
// Landing host serves only `/` (waitlist signup) and `/api/waitlist`.
// `/` rewrites internally to `/welcome` because Sprint 8 needs `/` to
// mean the Bridge on the app host. The internal `/welcome` slug is never
// exposed in the URL bar.
const LANDING_INTERNAL_LANDING_PATH = "/welcome";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const kind = hostKind(request);

  if (kind === "landing") {
    if (path === "/") {
      const url = request.nextUrl.clone();
      url.pathname = LANDING_INTERNAL_LANDING_PATH;
      return NextResponse.rewrite(url);
    }
    if (path === "/api/waitlist") {
      return NextResponse.next();
    }
    // Direct hits on /welcome (or any other non-allowed path) redirect to /.
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url, 302);
  }

  // app.solodesk.ai (and localhost in dev)
  if (path === "/api/waitlist") {
    return new NextResponse("Not Found", { status: 404 });
  }
  if (
    APP_PUBLIC_API_PREFIXES.some((prefix) => path.startsWith(`${prefix}/`)) ||
    APP_PUBLIC_API_PREFIXES.includes(path)
  ) {
    return NextResponse.next();
  }
  if (
    APP_PUBLIC_PATHS.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    return NextResponse.next();
  }

  const { supabase, response } = createSupabaseMiddlewareClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return redirectToLogin(request);
  }

  const entry = await findAllowedUser(user.email);
  if (!entry) {
    await supabase.auth.signOut();
    return redirectToLogin(request, "not_invited");
  }

  void touchLastLogin(user.email);

  // Sprint 8: / on the app domain is now the Bridge (the operator's home).
  // The historic /dashboard route 308-redirects to / — see
  // /app/(authed)/dashboard/page.tsx. No middleware redirect needed.

  return response();
}

function redirectToLogin(request: NextRequest, error?: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url, 302);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
