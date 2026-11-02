"use client";

import { useRef, useState, type ComponentType } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "@/components/motion/gsap";
import { FailureDrill } from "./FailureDrill";
import { BuildDemo, EvaluateDemo, ResultsShowcase } from "./Showcase";

const STEPS: { label: string; title: string; body: string; points: string[]; Visual: ComponentType }[] = [
  {
    label: "Build",
    title: "Sketch the request path on a real canvas",
    body: "Drop in load balancers, servers, caches, queues and databases, then wire them together. Every component carries the settings a real one has.",
    points: ["84 components across six categories", "Instance sizes, replication, TTLs and routing that change the outcome"],
    Visual: () => <BuildDemo label="Building a design on the canvas" />,
  },
  {
    label: "Load",
    title: "Run it against production traffic",
    body: "The simulator pushes the target load through your design and shows which server saturates first, what the tail latency looks like and whether the bill fits.",
    points: ["Capacity, latency and cost modelled together", "Per-server CPU under the traffic split you chose"],
    Visual: () => <EvaluateDemo label="Load-testing a submitted design" />,
  },
  {
    label: "Break",
    title: "Survive the failure drill",
    body: "A server group dies at peak. Health checks, spare capacity and failover decide whether the system degrades gracefully or falls over.",
    points: ["Failure tests on every resilience problem", "Fix-mode problems start from a system already in trouble"],
    Visual: () => <FailureDrill />,
  },
  {
    label: "Score",
    title: "Get a verdict you can defend",
    body: "Each check explains what passed, what failed and why, with the numbers behind it. Fix the design, resubmit and watch the score climb.",
    points: ["Graded by simulation or by scenario", "Reference designs with the reasoning behind them"],
    Visual: () => <ResultsShowcase />,
  },
];

function Screen({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_40px_120px_-40px_rgba(108,75,255,0.45)]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-3 figures text-[11px] uppercase tracking-[0.12em] text-text-muted">{label}</span>
      </div>
      <div className="aspect-video">{children}</div>
    </div>
  );
}

/** Scroll-driven walkthrough: the step text scrolls past while the matching visual stays pinned beside it. */
export function StoryScroll() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      gsap.utils.toArray<HTMLElement>("[data-step]").forEach((el, i) =>
        ScrollTrigger.create({ trigger: el, start: "top 60%", end: "bottom 40%", onToggle: (self) => self.isActive && setActive(i) }),
      );
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        "[data-rail-fill]",
        { scaleY: 0 },
        { scaleY: 1, ease: "none", scrollTrigger: { trigger: "[data-steps]", start: "top 60%", end: "bottom 60%", scrub: true } },
      );
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="figures text-xs uppercase tracking-[0.12em] text-accent">How it works</p>
        <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-text-primary sm:text-5xl">From blank canvas to a verdict you can defend.</h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-text-secondary">
          Four steps, the same loop a real design review runs, except the reviewer is a simulator that does the math.
        </p>
      </Reveal>

      <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div data-steps className="relative">
          <span aria-hidden="true" className="absolute bottom-0 left-[11px] top-0 w-px bg-border" />
          <span aria-hidden="true" data-rail-fill className="absolute bottom-0 left-[11px] top-0 w-px origin-top bg-gradient-to-b from-accent via-accent to-mint" />
          {STEPS.map((s, i) => (
            <article key={s.label} data-step className="relative flex flex-col justify-center py-10 pl-12 lg:min-h-[78vh] lg:py-0">
              <span
                aria-hidden="true"
                className={`absolute left-0 top-12 flex h-6 w-6 items-center justify-center rounded-full border bg-background transition-colors duration-normal lg:top-1/2 lg:-translate-y-1/2 ${
                  active === i ? "border-accent" : "border-border-strong"
                }`}
              >
                <span className={`h-2 w-2 rounded-full transition-colors duration-normal ${active === i ? "bg-mint" : "bg-text-muted/40"}`} />
              </span>
              <p className="figures text-xs uppercase tracking-[0.12em] text-text-muted">
                0{i + 1} <span className="text-accent">{s.label}</span>
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-text-primary sm:text-3xl">{s.title}</h3>
              <p className="mt-4 max-w-md text-base leading-relaxed text-text-secondary">{s.body}</p>
              <ul className="mt-5 space-y-2">
                {s.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm text-text-secondary">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-8 lg:hidden">
                <Screen label={s.label}>
                  <s.Visual />
                </Screen>
              </div>
            </article>
          ))}
        </div>
        <div className="hidden lg:block">
          <div className="sticky top-[6.5rem]">
            <div className="relative">
              {STEPS.map((s, i) => (
                <div
                  key={s.label}
                  aria-hidden={active !== i}
                  className={`transition-all duration-500 ease-spring-interactive ${i === 0 ? "relative" : "absolute inset-0"} ${
                    active === i ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
                  }`}
                >
                  <Screen label={`${s.label} · step 0${i + 1}`}>
                    <s.Visual />
                  </Screen>
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-4 gap-2">
              {STEPS.map((s, i) => (
                <div key={s.label} className="space-y-1.5">
                  <div className={`h-1 rounded-full transition-colors duration-normal ${i <= active ? "bg-accent" : "bg-border"}`} />
                  <span className={`figures text-[10px] uppercase tracking-[0.12em] ${i === active ? "text-text-primary" : "text-text-muted"}`}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
