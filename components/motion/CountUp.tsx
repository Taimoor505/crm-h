'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts up to `value` once when it first appears (Material emphasized
 * easing), then shows the formatted value. Skipped for reduced motion.
 */
export function CountUp({ value, format, duration = 900 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || typeof window === 'undefined') return;
    done.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !Number.isFinite(value) || value === 0) return;
    let raf = 0;
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * ease(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  useEffect(() => {
    if (done.current) setShown(value);
  }, [value]);

  return <>{format(shown)}</>;
}
