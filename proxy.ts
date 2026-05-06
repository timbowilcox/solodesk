import { NextResponse, type NextRequest } from "next/server";

import { findAllowedUser, touchLastLogin } from "@/lib/auth/allowlist";
import { hostKind } from "@/lib/host";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";

const APP_PUBLIC_PATHS = ["/login", "/auth"];
const APP_PUBLIC_API_PREFIXES = ["/api/webhooks"];
const LANDING_ALLOWED_PATHS = new Set<string>(["/", "/api/waitlist"]);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const kind = hostKind(request);

  if (kind === "landing") {
    if (LANDING_ALLOWED_PATHS.has(path)) {
      return NextResponse.next();
    }
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

  if (path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url, 302);
  }

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
