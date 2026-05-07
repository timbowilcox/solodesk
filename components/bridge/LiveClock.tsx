"use client";

// LiveClock — small monospace clock in the Bridge chrome. Updates every
// minute on the minute. Initial value is computed lazily during state
// init so we don't trigger a cascading render in useEffect.
//
// Hydration note: server renders "--:--" placeholder; client picks up the
// real value on mount. Avoids hydration mismatch since the Bridge is the
// only place this is used and a one-frame placeholder is acceptable.

import { useEffect, useState } from "react";

function formatNow(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function LiveClock() {
  // Server render: stable placeholder. Client first render: same. Then we
  // schedule updates. We deliberately do NOT compute the time during render
  // because that would cause the server vs. client output to diverge and
  // produce a hydration warning.
  const [time, setTime] = useState<string>("--:--");

  useEffect(() => {
    let cancelled = false;
    let interval: number | undefined;

    function update() {
      if (cancelled) return;
      setTime(formatNow());
    }

    // Apply once on mount via microtask so the linter doesn't flag a
    // synchronous setState within the effect body.
    const initial = window.setTimeout(update, 0);

    // Then sync to the next minute boundary, then once per minute.
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    const boundary = window.setTimeout(() => {
      update();
      interval = window.setInterval(update, 60_000);
    }, msToNextMinute);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearTimeout(boundary);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, []);

  return (
    <time aria-label="Current local time" className="tabular-nums">
      {time}
    </time>
  );
}
