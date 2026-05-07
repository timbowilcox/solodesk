"use client";

// Sets the --chrome-tone CSS custom property on <html> based on local clock
// hour. Re-checked every minute on the minute. Per design-system.md:
//
//   06:00–12:00 -> warm    (morning)
//   12:00–18:00 -> neutral (afternoon)
//   18:00–06:00 -> cool    (evening / overnight)
//
// One CSS variable, single solid border-color downstream — not a gradient.
// Conforms to the design-system.md ban on gradients.
//
// Renders no DOM. Wraps children to satisfy the React composition contract.

import { useEffect } from "react";

import { chromeToneForHour } from "@/lib/venture/state-derivation";

type Props = {
  children: React.ReactNode;
};

export function TimeOfDayProvider({ children }: Props) {
  useEffect(() => {
    const root = document.documentElement;
    let cancelled = false;
    let interval: number | undefined;

    function applyTone() {
      if (cancelled) return;
      const hour = new Date().getHours();
      root.style.setProperty("--chrome-tone", chromeToneForHour(hour));
    }

    // Apply immediately on mount via microtask (linter dislikes synchronous
    // side-effects inside effect bodies even when they aren't setState).
    const initial = window.setTimeout(applyTone, 0);

    // Then on the minute boundary, then every minute thereafter. Cheap and
    // accurate without setInterval drift across hour transitions.
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    const boundary = window.setTimeout(() => {
      applyTone();
      interval = window.setInterval(applyTone, 60 * 1000);
    }, msToNextMinute);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearTimeout(boundary);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, []);

  return <>{children}</>;
}
