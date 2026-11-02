"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, HardDrive, ListChecks, UserRound } from "lucide-react";
import { useUserData } from "@/lib/store/user-data";
import { ui } from "@/components/ui/styles";

const R = 13;
const C = 2 * Math.PI * R;

/** Header shortcut to the visitor's local progress. There are no accounts; everything lives in this browser. */
export function ProgressMenu({ total }: { total: number }) {
  const { loaded, data } = useUserData();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const records = Object.values(data.problems);
  const solved = loaded ? records.filter((r) => r.status === "completed").length : 0;
  const started = loaded ? records.filter((r) => r.status === "in_progress").length : 0;
  const pct = total ? solved / total : 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your progress"
        className="flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pl-1 pr-2.5 transition-colors duration-fast hover:border-border-strong hover:bg-surface-hover"
      >
        <span className="relative flex h-8 w-8 items-center justify-center">
          <svg viewBox="0 0 32 32" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="16" cy="16" r={R} fill="none" stroke="var(--surface-active)" strokeWidth="3" />
            <circle
              cx="16"
              cy="16"
              r={R}
              fill="none"
              stroke="var(--mint)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - Math.max(pct, solved ? 0.04 : 0))}
              className="transition-[stroke-dashoffset] duration-slow ease-spring-interactive"
            />
          </svg>
          <span className="figures relative text-[11px] font-bold text-text-primary">{solved}</span>
        </span>
        <span className="hidden text-sm font-medium text-text-secondary sm:inline">Progress</span>
        <ChevronDown className={`h-4 w-4 text-text-muted transition-transform duration-fast ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className={`${ui.popover} absolute right-0 top-[calc(100%+10px)] z-50 w-72 motion-safe:animate-[roadmap-pop-in_180ms_var(--ease-spring-interactive)_both]`}>
          <div className="rounded-xl bg-background-elevated/70 p-3.5">
            <p className={ui.label}>Your progress</p>
            <div className="mt-2.5 grid grid-cols-2 gap-3">
              <div>
                <div className="figures text-2xl font-bold text-text-primary">
                  {solved}
                  <span className="text-sm font-medium text-text-muted">/{total}</span>
                </div>
                <div className="text-xs text-text-muted">Problems solved</div>
              </div>
              <div>
                <div className="figures text-2xl font-bold text-text-primary">{started}</div>
                <div className="text-xs text-text-muted">In progress</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-active">
              <div className="h-full rounded-full bg-gradient-to-r from-accent to-mint" style={{ width: `${Math.round(pct * 100)}%` }} />
            </div>
          </div>
          <div className="mt-1.5 space-y-0.5">
            <Link
              role="menuitem"
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary"
            >
              <UserRound className="h-4 w-4" aria-hidden="true" /> Progress and activity
            </Link>
            <Link
              role="menuitem"
              href="/roadmaps?view=lists"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary"
            >
              <ListChecks className="h-4 w-4" aria-hidden="true" /> My lists
            </Link>
          </div>
          <p className="mt-1.5 flex items-start gap-2 border-t border-border px-2.5 pb-1 pt-2.5 text-xs leading-5 text-text-muted">
            <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Saved in this browser. No account, no sign-in.
          </p>
        </div>
      )}
    </div>
  );
}
