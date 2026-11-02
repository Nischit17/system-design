"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { CountUp } from "@/components/motion/CountUp";
import { gsap, prefersReducedMotion, useGSAP } from "@/components/motion/gsap";
import type { GlobeEvent } from "./GlobeScene";
import { LiveHud } from "./LiveHud";

const GlobeScene = dynamic(() => import("./GlobeScene").then((m) => m.GlobeScene), {
  ssr: false,
  loading: () => <div className="absolute inset-[9%] rounded-full bg-[radial-gradient(circle_at_40%_35%,#1a1736,#090a13_70%)]" />,
});

const LINE_ONE = ["Know", "what", "your", "design"];
const LINE_TWO = ["can", "carry."];

function Words({ words, className = "" }: { words: string[]; className?: string }) {
  return (
    <>
      {words.map((w) => (
        <span key={w} className="mr-[0.22em] inline-block overflow-hidden pb-[0.1em] align-bottom last:mr-0">
          <span data-hero="word" className={`inline-block ${className}`}>
            {w}
          </span>
        </span>
      ))}
    </>
  );
}

export function HomeHero({ header, stats }: { header: ReactNode; stats: { problems: number; tracks: number; components: number } }) {
  const root = useRef<HTMLElement>(null);
  const [event, setEvent] = useState<GlobeEvent | null>(null);
  const onEvent = useCallback((e: GlobeEvent) => setEvent(e), []);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        .from("[data-hero='header']", { y: -18, autoAlpha: 0, duration: 0.7 })
        .from("[data-hero='eyebrow']", { y: 14, autoAlpha: 0, duration: 0.7 }, "-=0.4")
        .from("[data-hero='word']", { yPercent: 115, duration: 1, stagger: 0.055 }, "-=0.45")
        .from("[data-hero='lede']", { y: 18, autoAlpha: 0, duration: 0.8 }, "-=0.65")
        .from("[data-hero='cta'] > *", { y: 16, autoAlpha: 0, duration: 0.7, stagger: 0.08 }, "-=0.6")
        .from("[data-hero='stat']", { y: 14, autoAlpha: 0, duration: 0.7, stagger: 0.07 }, "-=0.55")
        .from("[data-hero='stage']", { autoAlpha: 0, scale: 0.92, duration: 1.6 }, 0.15)
        .from("[data-hero='cue']", { autoAlpha: 0, duration: 0.8 }, "-=0.6");
      // Side-by-side layout only: on phones the globe sits below the copy and should stay crisp.
      gsap.matchMedia().add("(min-width: 1024px)", () => {
        gsap.to("[data-hero='stage']", {
          yPercent: -10,
          autoAlpha: 0.35,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative flex min-h-[760px] w-full flex-col overflow-hidden bg-background lg:min-h-[100svh]">
      <div aria-hidden="true" className="app-grid-background absolute inset-0" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
      <div data-hero="header" className="relative z-20 w-full [&>header]:mb-0">
        {header}
      </div>
      <div className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 px-6 pb-16 pt-10 lg:grid-cols-[1.02fr_1fr] lg:gap-6 lg:pb-24 lg:pt-4">
        <div className="flex flex-col items-start">
          <div data-hero="eyebrow" className="glass-panel inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 figures text-[11px] uppercase tracking-[0.12em] text-text-secondary">
            <span className="status-dot" />
            Capacity simulator online
          </div>
          <h1 className="mt-7 text-[2.9rem] font-semibold leading-[0.98] tracking-[-0.045em] text-text-primary sm:text-6xl lg:text-[4.75rem]">
            <span className="block">
              <Words words={LINE_ONE} />
            </span>
            <span className="block">
              <Words words={LINE_TWO} className="brand-gradient-text" />
            </span>
          </h1>
          <p data-hero="lede" className="mt-7 max-w-xl text-lg leading-relaxed text-text-secondary">
            Sketch an architecture on a live canvas, then watch it face real traffic, failing servers and a budget. Every design is scored by a capacity
            simulator, not a checklist.
          </p>
          <div data-hero="cta" className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/roadmaps"
              className="cta-glow-border btn-press group inline-flex items-center justify-center gap-2 rounded-xl bg-accent-strong px-6 py-3.5 text-sm font-semibold text-on-accent shadow-[0_14px_44px_-12px_var(--accent-glow)] transition-all duration-normal ease-spring-interactive hover:-translate-y-0.5 hover:brightness-110"
            >
              Start a roadmap
              <ArrowRight className="h-4 w-4 transition-transform duration-normal group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <Link
              href="/problems"
              className="glass-panel btn-press inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-sm font-semibold text-text-primary transition-all duration-normal ease-spring-interactive hover:-translate-y-0.5 hover:border-border-strong"
            >
              Browse problems
            </Link>
          </div>
          <dl className="mt-12 grid w-full max-w-lg grid-cols-3 gap-4 border-t border-border pt-6">
            {[
              { label: "Problems", value: stats.problems },
              { label: "Tracks", value: stats.tracks },
              { label: "Components", value: stats.components },
            ].map((s) => (
              <div key={s.label} data-hero="stat">
                <dt className="figures text-[10px] uppercase tracking-[0.12em] text-text-muted">{s.label}</dt>
                <dd className="mt-1 figures text-2xl text-text-primary sm:text-3xl">
                  <CountUp value={s.value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div data-hero="stage" className="relative mx-auto aspect-square w-full max-w-[460px] lg:max-w-[640px]">
          <GlobeScene onEvent={onEvent} className="absolute inset-0" />
          <LiveHud event={event} />
        </div>
      </div>
      <div data-hero="cue" aria-hidden="true" className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 lg:flex">
        <span className="figures text-[10px] uppercase tracking-[0.12em] text-text-muted">Scroll</span>
        <span className="relative h-10 w-px overflow-hidden bg-border">
          <span className="absolute inset-x-0 top-0 h-4 bg-accent motion-safe:animate-[hero-scroll-cue_2.2s_ease-in-out_infinite]" />
        </span>
      </div>
    </section>
  );
}
