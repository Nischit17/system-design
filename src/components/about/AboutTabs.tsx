"use client";

import { useState } from "react";
import { ChevronDown, Compass } from "lucide-react";
import { SITE } from "@/lib/site";
import { useUI } from "@/components/site/ui-context";
import { ui } from "@/components/ui/styles";

const TABS = ["Mission", "How it works", "FAQ", "What's new"] as const;

const STEPS = [
  { title: "Pick a problem or a roadmap", description: "Open a standalone problem, or follow a roadmap that builds one topic at a time: compute, data, caching, events, resilience, operations." },
  { title: "Read the brief", description: "Each problem states its traffic, constraints and budget, the same shape as a real design review, plus a hint and reference tables when you want them." },
  { title: "Build it on the canvas", description: "Place components, wire the request path and configure each node. Edges mean real traffic, and settings like size, routing and TTL change the outcome." },
  { title: "Submit and get graded", description: "The simulator load-tests what you built: capacity, latency, failures and cost. The results explain exactly which part fell short." },
  { title: "Iterate and track progress", description: "Fix the bottleneck and resubmit. Your best score is kept, and the progress page tracks activity, streaks and progress by topic, all saved in your browser." },
];

const FAQ = [
  { question: "Is it really free?", answer: "Yes. Every problem, roadmap and learning guide is free for everyone. There is no trial period, no paid tier and nothing that switches off later." },
  { question: "Do I need an account?", answer: "No. There is no sign-up or sign-in. Open any problem and start building. Progress is kept in your browser's local storage on this device." },
  { question: "Is it open source?", answer: `Yes. ${SITE.name} is open source: the simulator, the problems and the guides. Anyone can read how a design is graded, report a grader that looks wrong, or suggest new problems.` },
  { question: "Is this just another whiteboarding tool?", answer: "No. A whiteboard accepts any drawing; here the design is executed. Every submission is run through a capacity simulator and graded on what it would actually do." },
  { question: "Do I need a system design background?", answer: "No. The foundation tracks start with single servers and databases and build up to sharding, delivery guarantees and multi-region trade-offs." },
  { question: "Can I use this to prepare for interviews?", answer: "Yes. The grading dimensions (capacity, latency, reliability, cost) are the same things an interviewer probes when they push back on a design." },
  { question: "What is the difference between Build and Fix modes?", answer: "Build starts from an empty canvas and a precise spec. Fix starts from a running system with a production alert, and asks you to repair it without breaking what already works." },
  {
    question: "How is my progress saved, and can I move it?",
    answer: "Attempts, best scores, streaks and lists are saved in this browser. Clearing site data removes them. From the progress page you can export everything to a file and import it on another device or browser.",
  },
];

const NEWS = [
  { date: "Nov 2026", entry: "No accounts: every feature works without signing in. Progress lives in your browser, with export and import on the progress page." },
  { date: "Nov 2026", entry: "Light and dark reading themes for the learning guides, with a toggle in every guide." },
  { date: "Nov 2026", entry: "New look across the site: one typeface, rounded controls, live canvas animations and an animated score gauge." },
  { date: "Oct 2026", entry: "Fix Existing Design mode for every foundation and advanced problem, with live production metrics on the canvas." },
  { date: "Oct 2026", entry: "Learning guides with interactive calculators for capacity, Little's Law, caching and queues." },
  { date: "Sep 2026", entry: "LLM & GenAI roadmap: RAG, serving cost, evaluation gates and agents." },
  { date: "Sep 2026", entry: "Lists: save up to three collections of problems from the Problems page." },
  { date: "Aug 2026", entry: "Activity heatmap and streaks on the progress page." },
];

export function AboutTabs({ problemCount, trackCount }: { problemCount: number; trackCount: number }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Mission");
  const { startTour } = useUI();
  return (
    <div>
      <div className={`${ui.card} relative flex flex-wrap items-center justify-between gap-4 overflow-hidden px-5 py-4`}>
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Compass className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary">See it before you build with it</p>
            <p className="text-xs text-text-muted">A guided walkthrough of the app shell: navigation and your progress.</p>
          </div>
        </div>
        <button type="button" onClick={startTour} className={ui.btnPrimary}>
          Take a tour of {SITE.name}
        </button>
      </div>
      <div className="mt-10 lg:grid lg:grid-cols-[1fr_300px] lg:items-start lg:gap-12">
        <div className="min-w-0">
          <div role="tablist" aria-label={`About ${SITE.name}`} className={ui.segment}>
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`${ui.segmentItem(tab === t)} !px-4 !py-2`}>
                {t}
              </button>
            ))}
          </div>
          <div key={tab} className="stagger-in mt-8">
            {tab === "Mission" && (
              <>
                <p className="max-w-3xl text-[15px] leading-7 text-text-secondary">
                  Most system design practice is passive: reading write-ups, watching videos, sketching boxes that nobody ever puts under load. {SITE.name} is the
                  opposite. You place real components, wire the request path, and submit the design to a simulator that checks throughput, latency, reliability
                  and cost the way a design review would.
                </p>
                <p className="mt-4 max-w-3xl text-[15px] leading-7 text-text-secondary">
                  The goal isn&apos;t to memorize &quot;correct&quot; architectures. It&apos;s to build intuition for trade-offs: when a cache pays for itself, when
                  to shard, when consistency matters and when it doesn&apos;t. That intuition is what carries over to interviews and to real systems.
                </p>
                <p className="mt-4 max-w-3xl text-[15px] leading-7 text-text-secondary">
                  It is free and open source, with no accounts, because learning shouldn&apos;t sit behind a paywall or a login form. Every other resource stops at the
                  diagram. Here the diagram is only the start: the question is always whether it holds up at scale.
                </p>
              </>
            )}
            {tab === "How it works" && (
              <ol className="relative max-w-3xl space-y-3">
                {STEPS.map((s, i) => (
                  <li key={s.title} className={`${ui.card} flex gap-4 p-4 sm:p-5`}>
                    <span className="figures flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-strong text-xs font-bold text-on-accent shadow-[0_6px_18px_-8px_var(--accent-glow)]">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary">{s.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-text-secondary">{s.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {tab === "FAQ" && (
              <div className="max-w-3xl space-y-2">
                {FAQ.map((f) => (
                  <details key={f.question} className={`${ui.card} group px-5 py-4 open:border-border-strong`}>
                    <summary className="cursor-pointer list-none text-sm font-semibold text-text-primary marker:content-none [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center justify-between gap-4">
                        {f.question}
                        <ChevronDown className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-normal group-open:rotate-180" aria-hidden="true" />
                      </span>
                    </summary>
                    <p className="mt-2.5 text-sm leading-6 text-text-secondary">{f.answer}</p>
                  </details>
                ))}
              </div>
            )}
            {tab === "What's new" && (
              <ol className="relative max-w-3xl space-y-0 border-l border-border pl-6">
                {NEWS.map((n, i) => (
                  <li key={i} className="relative pb-6 last:pb-0">
                    <span aria-hidden="true" className={`absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background ${i === 0 ? "bg-mint" : "bg-border-strong"}`} />
                    <span className="figures text-xs font-semibold text-accent">{n.date}</span>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">{n.entry}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        <aside className={`${ui.card} mt-10 p-5 lg:mt-0`}>
          <div className={ui.label}>By the numbers</div>
          <p className="mt-2 text-sm leading-6 text-text-secondary">Every submission is checked against a capacity simulator, the way a real design review would check it, rather than against a rubric.</p>
          <dl className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-background-elevated p-3">
              <dt className={ui.statLabel}>Problems</dt>
              <dd className="figures mt-1 text-2xl font-bold text-text-primary">{problemCount}</dd>
            </div>
            <div className="rounded-xl bg-background-elevated p-3">
              <dt className={ui.statLabel}>Tracks</dt>
              <dd className="figures mt-1 text-2xl font-bold text-text-primary">{trackCount}</dd>
            </div>
            <div className="col-span-2 rounded-xl bg-background-elevated p-3">
              <dt className={ui.statLabel}>Graded on, every submission</dt>
              <dd className="mt-2 flex flex-wrap gap-1.5">
                {["Throughput", "Latency", "Reliability", "Cost"].map((d) => (
                  <span key={d} className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
                    {d}
                  </span>
                ))}
              </dd>
            </div>
            <div className="col-span-2 rounded-xl bg-background-elevated p-3">
              <dt className={ui.statLabel}>Price</dt>
              <dd className="mt-1 text-sm font-semibold text-text-primary">Free and open source, no account</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
