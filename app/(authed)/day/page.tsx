import { BridgeDayToggle } from "@/components/bridge/BridgeDayToggle";
import { Day } from "@/components/day/Day";
import { requireUserContext } from "@/lib/auth/guard";
import { loadDayItems } from "@/lib/db/day";

export const metadata = {
  title: "The Day — SoloDesk",
};

// The Day surface — curated finite list of items needing attention.
// Server-rendered. Dismissals expire at next 06:00 local time (the
// expiry filter runs in lib/db/day.ts).
export default async function DayPage() {
  const user = await requireUserContext();
  const items = await loadDayItems(user);

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4 border-b border-rule pb-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
            The Day
          </h1>
          <div className="h-px w-12 bg-accent opacity-50" />
          <p className="pt-2 text-sm text-ink-mute">
            What needs your attention. Dismissed items reset at 06:00 local
            time.
          </p>
        </div>
        <BridgeDayToggle current="day" />
      </header>
      <Day items={items} />
    </div>
  );
}
