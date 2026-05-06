import { loginAction } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = {
  title: "Sign in — SoloDesk",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "Email invalid.",
  invalid_link: "Sign-in link expired or already used.",
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
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-mute">
            SoloDesk
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
            Sign in
          </h1>
          <div className="h-px w-12 bg-accent opacity-50" />
        </header>

        {sent ? (
          <p className="text-sm text-ink-mute">
            If your email is on the list, you&rsquo;ll get a sign-in link
            shortly. Check your inbox.
          </p>
        ) : (
          <form action={loginAction} className="space-y-6">
            <label className="block space-y-1">
              <span className="block text-xs font-medium uppercase tracking-wide text-ink-mute">
                Email
              </span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="block w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-b-2 focus:border-accent focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="w-full bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
            >
              Send sign-in link
            </button>
            {error && (
              <p role="alert" className="text-sm text-ink-mute">
                {ERROR_MESSAGES[error] ?? "Something went wrong. Try again."}
              </p>
            )}
          </form>
        )}

        <p className="text-xs text-ink-mute">
          Access is invite-only. If you&rsquo;re not on the list, request access
          via the waitlist on{" "}
          <a className="text-accent underline-offset-2 hover:underline" href="https://solodesk.ai">
            solodesk.ai
          </a>
          .
        </p>
      </div>
    </main>
  );
}
