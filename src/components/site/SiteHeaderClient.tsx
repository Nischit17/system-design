"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { CircleQuestionMark } from "lucide-react";
import { PRIMARY_NAV, SITE } from "@/lib/site";
import { LogoLockup } from "./Logo";
import { ProgressMenu } from "./ProgressMenu";
import { useUI } from "./ui-context";

export function SiteHeaderClient({ className, totalProblems }: { className: string; totalProblems: number }) {
  const pathname = usePathname();
  const { startTour } = useUI();
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const active = PRIMARY_NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))?.href;

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const link = active ? nav.querySelector<HTMLAnchorElement>(`a[href="${active}"]`) : null;
      setIndicator(link ? { left: link.offsetLeft, width: link.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [active]);

  return (
    <header className={`sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl ${className}`}>
      <div className="mx-auto flex min-w-0 max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 sm:flex-nowrap sm:gap-10 sm:px-6">
        <div className="shrink-0" data-tour="onboarding-logo">
          <Link href="/" aria-label={`${SITE.name} home`} className="flex w-fit items-center rounded-lg transition-opacity duration-fast hover:opacity-85">
            <LogoLockup />
          </Link>
        </div>
        <nav
          ref={navRef}
          data-tour="onboarding-nav"
          aria-label="Primary navigation"
          className="relative order-3 flex w-full min-w-0 items-center justify-start gap-6 overflow-x-auto whitespace-nowrap sm:order-none sm:w-auto sm:flex-1 sm:justify-center sm:gap-9"
        >
          {indicator && (
            <span
              aria-hidden="true"
              className="absolute bottom-0 h-[2px] rounded-full bg-gradient-to-r from-accent to-mint transition-all duration-normal ease-spring-interactive"
              style={{ left: indicator.left, width: indicator.width, boxShadow: "0 0 12px 0 var(--accent-glow)" }}
            />
          )}
          {PRIMARY_NAV.map((item) => {
            const isActive = item.href === active;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex shrink-0 pb-2 pt-1 text-[0.95rem] font-medium transition-colors duration-fast ${
                  isActive ? "text-text-primary" : "text-text-muted hover:text-text-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center justify-end gap-3">
          <button
            type="button"
            aria-label="Take a tour of the app"
            title="Take a tour"
            onClick={startTour}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-text-muted transition-colors duration-fast hover:border-border-strong hover:bg-surface-hover hover:text-text-primary"
          >
            <CircleQuestionMark className="h-4 w-4" aria-hidden="true" />
          </button>
          <div data-tour="onboarding-progress">
            <ProgressMenu total={totalProblems} />
          </div>
        </div>
      </div>
    </header>
  );
}
