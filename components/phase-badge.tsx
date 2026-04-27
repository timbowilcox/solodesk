import type { VenturePhase } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const STYLES: Record<VenturePhase, string> = {
  discovery: "bg-muted text-muted-foreground",
  build: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  launch: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  scale: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  dormant: "bg-muted/60 text-muted-foreground line-through",
};

export function PhaseBadge({ phase }: { phase: VenturePhase }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs uppercase tracking-wide",
        STYLES[phase],
      )}
    >
      {phase}
    </span>
  );
}
