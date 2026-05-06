import type { VenturePhase } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const STYLES: Record<VenturePhase, string> = {
  discovery: "bg-caution-bg text-caution",
  build: "bg-info-bg text-info",
  launch: "bg-positive-bg text-positive",
  scale: "bg-positive-bg text-positive",
  dormant: "text-ink-mute",
};

export function PhaseBadge({ phase }: { phase: VenturePhase }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide",
        STYLES[phase],
      )}
    >
      {phase}
    </span>
  );
}
