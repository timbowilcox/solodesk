import { loginAction } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = {
  title: "Sign in — SoloDesk",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "That doesn't look like a valid email.",
  invalid_link: "That sign-in link expired or was already used.",
  not_invited:
    "If your email is on the list, you'll get a sign-in link shortly.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const sent = params.sent === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-1">
          <h1 className="font-mono text-sm tracking-tight text-muted-foreground">
            SoloDesk
          </h1>
          <p className="text-2xl font-semibold tracking-tight">Sign in</p>
        </header>

        {sent ? (
          <p className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            If your email is on the list, you&apos;ll get a sign-in link
            shortly. Check your inbox.
          </p>
        ) : (
          <form action={loginAction} className="space-y-3">
            <label className="block space-y-2">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Send sign-in link
            </button>
            {error && (
              <p className="text-sm text-muted-foreground">
                {ERROR_MESSAGES[error] ?? "Something went wrong. Try again."}
              </p>
            )}
          </form>
        )}

        <p className="text-xs text-muted-foreground">
          Access is invite-only. If you&apos;re not on the list, request access
          via the waitlist on{" "}
          <a className="underline" href="https://solodesk.ai">
            solodesk.ai
          </a>
          .
        </p>
      </div>
    </main>
  );
}
