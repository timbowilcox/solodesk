import { WaitlistForm } from "@/components/waitlist-form";

export const metadata = {
  title: "SoloDesk — the operating system for portfolio operators",
  description:
    "An operating system for the people running half a dozen ventures alone.",
};

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-xl space-y-10 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          SoloDesk
        </p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          The operating system for portfolio operators.
        </h1>
        <WaitlistForm />
      </div>
      <footer className="mt-16 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        © {new Date().getFullYear()} SoloDesk
      </footer>
    </main>
  );
}
