// Barrel — single import entry point per CLAUDE.md bright line:
// "All venture-displaying surfaces use the venture identity component
// system from /components/venture/. No inline marks, no inline state
// dots, no inline sparklines elsewhere."
//
// Surfaces:
//   import { VentureMark, Sparkline, StateDot, ConnectionChip, VentureStripe }
//     from "@/components/venture";

export { VentureMark, type VentureMarkProps } from "./VentureMark";
export { Sparkline, type SparklineProps } from "./Sparkline";
export {
  StateDot,
  type StateDotProps,
  type StateDotState,
} from "./StateDot";
export { ConnectionChip, type ConnectionChipProps } from "./ConnectionChip";
export { VentureStripe, type VentureStripeProps } from "./VentureStripe";
