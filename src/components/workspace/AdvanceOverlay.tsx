"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";

function Card({ code, title, tone }: { code: string; title: string; tone: "done" | "next" }) {
  return (
    <div
      className={`w-40 shrink-0 rounded-2xl border p-4 text-left transition-shadow duration-500 sm:w-64 sm:p-5 ${
        tone === "done"
          ? "border-border bg-surface/70 text-text-secondary motion-safe:animate-[roadmap-pop-in_420ms_var(--ease-spring-interactive)_both]"
          : "border-roadmap-gold/60 bg-surface-raised text-text-primary shadow-[0_0_36px_-4px_var(--roadmap-gold-glow)] motion-safe:animate-[roadmap-pop-in_420ms_var(--ease-spring-interactive)_160ms_both]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="figures text-xs font-semibold text-roadmap-gold">{code}</span>
        {tone === "done" && <CheckCircle2 className="h-4 w-4 text-roadmap-gold" aria-hidden="true" />}
      </div>
      <h3 className="mt-2.5 text-sm font-semibold leading-snug sm:text-base">{title}</h3>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">{tone === "done" ? "Completed" : "Up next"}</p>
    </div>
  );
}

/** Full-screen "loading next problem" transition. Click anywhere to skip. */
export function AdvanceOverlay({
  current,
  next,
  href,
  onClose,
}: {
  current: { code: string; title: string };
  next: { code: string; title: string };
  href: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [go, setGo] = useState(false);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reduced ? 400 : 3800;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setGo(true));
    const t = setTimeout(() => router.push(href), duration + 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [duration, href, router]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Advancing to next problem"
      className="app-grid-background fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-8 px-4 motion-safe:animate-[route-settle-in_240ms_ease-out_both] sm:px-6"
      onClick={() => {
        router.push(href);
        onClose();
      }}
    >
      <div className="flex w-full max-w-6xl items-center justify-between gap-0 sm:gap-2">
        <Card {...current} tone="done" />
        <div className="relative mx-3 h-1 flex-1 overflow-hidden rounded-full bg-surface-active sm:mx-6">
          <div
            className="h-full rounded-full bg-gradient-to-r from-roadmap-gold/60 to-roadmap-gold transition-[width] ease-out"
            style={{ width: go ? "100%" : "0%", transitionDuration: `${duration}ms`, boxShadow: "0 0 16px 2px var(--roadmap-gold-glow)" }}
          />
        </div>
        <Card {...next} tone="next" />
      </div>
      <p className="flex items-center gap-2 text-sm font-medium text-text-muted">
        <span className="status-dot" aria-hidden="true" />
        Loading next problem
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </p>
      <p className="text-xs text-text-muted/70">Click anywhere to skip</p>
    </div>
  );
}
