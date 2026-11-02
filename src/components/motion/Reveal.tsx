"use client";

import { useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "./gsap";

/**
 * Fades and lifts its children into place the first time they scroll into view.
 * Pass `selector` to animate specific descendants instead of direct children.
 */
export function Reveal({
  children,
  className,
  selector,
  stagger = 0.08,
  y = 28,
  start = "top 85%",
}: {
  children: ReactNode;
  className?: string;
  selector?: string;
  stagger?: number;
  y?: number;
  start?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const root = ref.current;
      if (!root || prefersReducedMotion()) return;
      const targets = selector ? gsap.utils.toArray<HTMLElement>(selector, root) : Array.from(root.children);
      if (!targets.length) return;
      gsap.from(targets, { y, autoAlpha: 0, duration: 0.9, ease: "expo.out", stagger, scrollTrigger: { trigger: root, start, once: true } });
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
