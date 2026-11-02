"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "./gsap";

const format = (n: number) => Math.round(n).toLocaleString("en-US");

/** Counts from zero to `value` when it first scrolls into view. Renders the final value on the server. */
export function CountUp({ value, suffix = "", className, duration = 1.6 }: { value: number; suffix?: string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      const state = { v: 0 };
      el.textContent = `${format(0)}${suffix}`;
      gsap.to(state, {
        v: value,
        duration,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 92%", once: true },
        onUpdate: () => {
          el.textContent = `${format(state.v)}${suffix}`;
        },
      });
    },
    { scope: ref, dependencies: [value, suffix] },
  );
  return (
    <span ref={ref} className={className}>
      {format(value)}
      {suffix}
    </span>
  );
}
