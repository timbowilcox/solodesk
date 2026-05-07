import { permanentRedirect } from "next/navigation";

// /dashboard is retired in Sprint 8 — / now serves the Bridge for authed
// operators. This route returns a 308 (permanent) redirect so any saved
// links / bookmarks resolve to the Bridge.
export default function DashboardRedirect() {
  permanentRedirect("/");
}
