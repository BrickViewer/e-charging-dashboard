import { useEffect, useRef, useState } from "react";

// Vloeiend animeren van een getal naar zijn doelwaarde (bv. "klant verdient €X/maand").
// Gemodelleerd op het rAF + easeOutCubic patroon van de CockpitGauge in de admin-app.
// Respecteert prefers-reduced-motion: dan springt de waarde direct naar het doel.

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function useCountUp(target: number, durationMs = 650): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = Number.isFinite(target) ? target : 0;
    if (from === to) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      fromRef.current = to;
      setValue(to);
      return;
    }

    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min((now - start) / durationMs, 1);
      const current = from + (to - from) * easeOutCubic(t);
      fromRef.current = current;
      setValue(current);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        setValue(to);
        frameRef.current = null;
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs]);

  return value;
}
