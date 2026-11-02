"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { ui } from "@/components/ui/styles";

export interface TourStep {
  target: string;
  fallbackTarget?: string;
  title: string;
  description: string;
  extra?: ReactNode;
}

type Rect = { top: number; left: number; width: number; height: number };
const PANEL_W = 360;

/** Dims the page, spotlights one [data-tour] element at a time and walks through steps. */
export function SpotlightTour({
  label,
  steps,
  onClose,
  onStepChange,
}: {
  label: string;
  steps: TourStep[];
  onClose: () => void;
  onStepChange?: (index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    onStepChange?.(index);
  }, [index, onStepChange]);

  useLayoutEffect(() => {
    let frame = 0;
    let prev = "";
    const tick = () => {
      const el =
        document.querySelector(`[data-tour="${step.target}"]`) ??
        (step.fallbackTarget ? document.querySelector(`[data-tour="${step.fallbackTarget}"]`) : null);
      if (el) {
        const r = el.getBoundingClientRect();
        const next = {
          top: Math.max(8, r.top - 8),
          left: Math.max(8, r.left - 8),
          width: Math.min(window.innerWidth - 16, r.width + 16),
          height: Math.min(window.innerHeight - 16, r.height + 16),
        };
        const key = `${next.top}|${next.left}|${next.width}|${next.height}`;
        if (key !== prev) {
          prev = key;
          setRect(next);
        }
      } else if (prev !== "none") {
        prev = "none";
        setRect(null);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(steps.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", onKey);
    nextRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, steps.length]);

  const panelStyle = (() => {
    if (!rect) return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" } as const;
    const fitsRight = rect.left + rect.width + 18 + PANEL_W < window.innerWidth;
    const fitsLeft = rect.left - 18 - PANEL_W > 16;
    const left = fitsRight
      ? rect.left + rect.width + 18
      : fitsLeft
        ? rect.left - PANEL_W - 18
        : Math.min(window.innerWidth - PANEL_W - 16, Math.max(16, rect.left + rect.width - PANEL_W));
    const below = rect.top + rect.height + 18;
    return { left, top: below + 230 < window.innerHeight ? below : Math.max(16, rect.top - 230 - 18) };
  })();

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="spotlight-tour-title">
      <div className="absolute inset-0" aria-hidden="true" />
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-2xl border-2 border-accent transition-[top,left,width,height] duration-normal ease-spring-interactive"
          style={{ ...rect, boxShadow: "0 0 0 9999px rgba(5, 6, 10, 0.78), 0 0 0 6px color-mix(in srgb, var(--accent) 22%, transparent), 0 0 40px 0 var(--accent-glow)" }}
          aria-hidden="true"
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-[rgba(5,6,10,0.78)]" aria-hidden="true" />
      )}
      <section
        key={index}
        className={`${ui.dialog} fixed w-[min(360px,calc(100vw-2rem))] p-5 text-text-primary motion-safe:animate-[roadmap-pop-in_220ms_var(--ease-spring-interactive)_both]`}
        style={panelStyle}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="eyebrow text-accent">{label}</span>
              <span className="figures rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                {index + 1}/{steps.length}
              </span>
            </div>
            <h2 id="spotlight-tour-title" className="mt-2 text-lg font-bold">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${label.toLowerCase()}`}
            className={`${ui.iconBtn} !h-8 !w-8`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-text-secondary">{step.description}</p>
        {step.extra}
        <div className="mt-4 flex gap-1" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-normal ${i <= index ? "bg-accent" : "bg-surface-active"}`} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="text-xs font-semibold text-text-muted transition-colors duration-fast hover:text-text-primary">
            Skip guide
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className={`${ui.btnSecondary} ${ui.btnSm}`}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </button>
            )}
            <button
              ref={nextRef}
              type="button"
              onClick={() => (last ? onClose() : setIndex((i) => i + 1))}
              className={`${ui.btnPrimary} ${ui.btnSm}`}
            >
              {last ? "Finish" : "Next"}
              {!last && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
