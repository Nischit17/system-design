"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Hammer, Info, Sparkles, Wrench } from "lucide-react";
import type { CodeInfo } from "@/lib/content/roadmap-data";
import type { Track, TrackSection } from "@/lib/content/tracks";
import { DIFFICULTY_TONE } from "@/lib/content/summaries";
import { useTrackProgress } from "@/lib/store/track-progress";
import { useUserData } from "@/lib/store/user-data";
import { badge, ui, type BadgeTone } from "@/components/ui/styles";

const DIFFICULTY_BADGE: Record<CodeInfo["difficulty"], BadgeTone> = { Easy: "success", Medium: "warning", Hard: "danger" };

type Accent = { ring: string; glow: string; dot: string; line: string };
const ACCENTS: Record<Track["family"], Accent> = {
  "software-system-design": { ring: "ring-blue-400/50", glow: "#60a5fa", dot: "bg-gradient-to-r from-blue-400 to-indigo-300", line: "#60a5fa" },
  "ml-ai-system-design": { ring: "ring-violet-400/50", glow: "#a78bfa", dot: "bg-gradient-to-r from-violet-400 to-fuchsia-300", line: "#a78bfa" },
  "llm-genai-systems": { ring: "ring-emerald-400/50", glow: "#34d399", dot: "bg-gradient-to-r from-emerald-400 to-teal-300", line: "#34d399" },
};

type Status = "completed" | "recommended" | "available";
const STATUS_LABEL: Record<Status, string> = { completed: "Completed", recommended: "Continue here", available: "Available" };
const STATUS_TONE: Record<Status, BadgeTone> = { completed: "success", recommended: "accent", available: "neutral" };

function useTilt(max = 6) {
  const ref = useRef<HTMLDivElement | HTMLAnchorElement>(null);
  const [t, setT] = useState<{ x: number; y: number } | null>(null);
  return {
    ref,
    style: t ? { transform: `perspective(900px) rotateX(${t.x}deg) rotateY(${t.y}deg) translateY(-2px)` } : undefined,
    onMouseMove: (e: React.MouseEvent) => {
      const el = ref.current;
      if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      setT({ x: -((py - 0.5) * 2) * max, y: (px - 0.5) * 2 * max });
    },
    onMouseLeave: () => setT(null),
  };
}

function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`flex w-full flex-col items-center transition-all duration-slow ease-spring-interactive ${shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-70"}`}>
      {children}
    </div>
  );
}

function Connector({ filled }: { filled: boolean }) {
  return (
    <div className="mx-auto h-12 w-full max-w-xl" style={filled ? { filter: "drop-shadow(0 0 4px var(--roadmap-gold-glow))" } : undefined}>
      <svg viewBox="0 0 100 48" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
        <line x1="50" y1="0" x2="50" y2="48" style={{ stroke: filled ? "var(--roadmap-gold)" : "var(--border-strong)", strokeWidth: filled ? 2.5 : 2 }} />
      </svg>
    </div>
  );
}

function CardTop({ info, status }: { info: CodeInfo; status: Status }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={badge(DIFFICULTY_BADGE[info.difficulty])}>
        <span className={`h-1.5 w-1.5 rounded-full ${DIFFICULTY_TONE[info.difficulty].dot}`} aria-hidden="true" />
        {info.difficulty}
      </span>
      <span className={badge(STATUS_TONE[status])}>
        {status === "completed" ? <Check className="h-3 w-3" aria-hidden="true" /> : status === "recommended" ? <Sparkles className="h-3 w-3" aria-hidden="true" /> : null}
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}

const cardClass = (recommended: boolean, accent: Accent, done: boolean) =>
  `group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-surface p-5 text-left transition-[border-color,background-color,box-shadow] duration-normal ${
    recommended
      ? `animate-[roadmap-glow_2.6s_ease-in-out_infinite] border-transparent ring-2 ${accent.ring}`
      : done
        ? "border-success/35 hover:border-success/60"
        : "border-border hover:border-border-strong hover:bg-surface-hover"
  }`;

function DualCard({ info, status, accent, scratchDone, fixDone }: { info: CodeInfo; status: Status; accent: Accent; scratchDone: boolean; fixDone: boolean }) {
  const tilt = useTilt(6);
  const recommended = status === "recommended";
  return (
    <div id={`problem-${info.code}`} className="relative w-full max-w-sm scroll-mt-28">
      {info.concepts.slice(0, 2).map((c, i) => (
        <div key={c} className="pointer-events-none absolute left-full hidden items-center xl:flex" style={{ top: i === 0 ? "1.9rem" : "6.75rem" }}>
          <span className="h-px w-6 shrink-0 bg-border-strong" />
          <span className="whitespace-nowrap rounded-full border border-border bg-background-elevated px-3 py-1.5 text-[11px] font-medium text-accent">{c}</span>
        </div>
      ))}
      <div
        ref={tilt.ref as React.RefObject<HTMLDivElement>}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        style={{ ...(recommended ? ({ "--roadmap-glow-color": `${accent.glow}73` } as React.CSSProperties) : {}), ...tilt.style }}
        className={`${cardClass(recommended, accent, status === "completed")} min-h-40`}
      >
        <CardTop info={info} status={status} />
        <h3 className="mt-3 text-base font-semibold leading-snug text-text-primary">{info.title}</h3>
        <p className="figures mt-1 text-[11px] font-semibold text-accent">{info.code}</p>
        <div className="mt-auto flex gap-2 pt-4">
          {info.scratchId && (
            <Link href={`/problems/${info.scratchId}`} className={`${ui.btnPrimary} ${ui.btnSm} min-w-0 flex-1 !px-2.5`}>
              {scratchDone ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Hammer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span className="truncate">Build from scratch</span>
            </Link>
          )}
          {info.fixId && (
            <Link
              href={`/problems/${info.fixId}`}
              className={`${ui.btnSm} btn-press inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-fix !px-2.5 font-semibold text-white transition-all duration-normal hover:brightness-110`}
            >
              {fixDone ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span className="truncate">Fix existing design</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function SingleCard({ info, status, accent }: { info: CodeInfo; status: Status; accent: Accent }) {
  const tilt = useTilt(6);
  const recommended = status === "recommended";
  return (
    <div id={`problem-${info.code}`} className="w-full max-w-sm scroll-mt-28">
      <Link
        ref={tilt.ref as React.RefObject<HTMLAnchorElement>}
        href={`/problems/${info.scratchId}`}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        style={{ ...(recommended ? ({ "--roadmap-glow-color": `${accent.glow}73` } as React.CSSProperties) : {}), ...tilt.style }}
        className={`${cardClass(recommended, accent, status === "completed")} min-h-36`}
      >
        <CardTop info={info} status={status} />
        <h3 className="mt-3 text-base font-semibold leading-snug text-text-primary">{info.title}</h3>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="figures text-[11px] font-semibold text-accent">{info.code}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary transition-colors duration-fast group-hover:text-text-primary">
            Open
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </div>
  );
}

function SectionInfo({ section }: { section: TrackSection }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`About ${section.title}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors duration-fast ${
          open ? "border-accent/60 text-accent" : "border-border text-text-muted hover:border-accent/60 hover:text-text-primary"
        }`}
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && (
        <div className={`${ui.popover} absolute left-1/2 top-8 z-30 w-72 -translate-x-1/2 !p-4 text-left text-sm leading-6 text-text-secondary motion-safe:animate-[roadmap-pop-in_180ms_var(--ease-spring-interactive)_both]`}>
          {section.description}
        </div>
      )}
    </div>
  );
}

export function TrackRoadmap({ track, codes, backHref }: { track: Track; codes: Record<string, CodeInfo>; backHref: string }) {
  const progress = useTrackProgress(codes);
  const { statusOf } = useUserData();
  const accent = ACCENTS[track.family];
  const [active, setActive] = useState(track.sections[0]?.id);
  const total = track.sections.reduce((n, s) => n + s.codes.length, 0);
  const solved = progress.solvedIn(track.sections);
  const allCodes = useMemo(() => track.sections.flatMap((s) => s.codes), [track]);
  const recommended = allCodes.find((c) => !progress.isSolved(c));

  // scrollspy
  useEffect(() => {
    const els = track.sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [track]);

  // honour #section / #problem anchors after hydration
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: hash.startsWith("problem-") ? "center" : "start" }));
  }, []);

  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <div className="relative px-5 py-8 text-text-primary sm:px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden transition-transform duration-fast">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-24 h-[36rem] w-[36rem] -translate-x-1/2 opacity-[0.14]">
          <svg viewBox="0 0 160 150" className="h-full w-full">
            <line x1="60" y1="16" x2="60" y2="54" stroke={accent.line} strokeWidth="1.25" opacity="0.45" />
            <line x1="60" y1="54" x2="60" y2="92" stroke={accent.line} strokeWidth="2" strokeDasharray="6 8" style={{ animation: "career-signal 5s linear infinite" }} opacity="0.9" />
            <line x1="60" y1="92" x2="26" y2="130" stroke={accent.line} strokeWidth="1.25" opacity="0.45" />
            <line x1="60" y1="92" x2="94" y2="130" stroke={accent.line} strokeWidth="1.25" opacity="0.45" />
            {[
              [60, 16],
              [60, 54],
              [60, 92],
              [26, 130],
              [94, 130],
            ].map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill={accent.line} opacity="0.75" />
            ))}
          </svg>
        </div>
      </div>
      <div className="relative mx-auto grid max-w-7xl gap-6 lg:grid-cols-[336px_minmax(0,1fr)]">
        <aside className="h-auto lg:sticky lg:top-24 lg:h-[calc(100vh-7.5rem)]">
          <div data-lenis-prevent className={`${ui.card} thin-scrollbar relative flex h-full flex-col overflow-y-auto p-5`}>
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />
            <Link href={backHref} className={`${ui.btnGhost} ${ui.btnSm} -ml-2 w-fit`}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              All roadmaps
            </Link>
            <div className={`${ui.eyebrow} mt-4`}>Track</div>
            <h1 className="mt-1.5 text-xl font-bold leading-tight tracking-[-0.02em] text-text-primary">{track.shortTitle}</h1>
            <div className="mt-5 rounded-xl bg-background-elevated p-3.5">
              <div className={ui.statLabel}>Overall progress</div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="figures text-2xl font-bold text-text-primary">{solved}</span>
                <span className="figures text-sm text-text-muted">/ {total} solved</span>
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-active">
                <div className="h-full rounded-full bg-gradient-to-r from-accent to-mint transition-[width] duration-slow ease-spring-interactive" style={{ width: `${(solved / Math.max(1, total)) * 100}%` }} />
              </div>
            </div>
            <div className={`${ui.label} mt-6`}>Your roadmap</div>
            <nav className="mt-2 flex-1 space-y-0.5">
              {track.sections.map((s) => {
                const done = s.codes.filter(progress.isSolved).length;
                const complete = done === s.codes.length;
                const on = active === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goTo(s.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-fast ${
                      on ? "bg-accent/15 font-semibold text-text-primary" : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`figures flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          complete ? "bg-success/20 text-success" : on ? "bg-accent-strong text-on-accent" : "bg-surface-active text-text-muted"
                        }`}
                      >
                        {complete ? <Check className="h-3 w-3" aria-hidden="true" /> : s.number}
                      </span>
                      <span className="truncate">{s.title}</span>
                    </span>
                    <span className="ml-2 shrink-0 figures text-[11px] text-text-muted">
                      {done}/{s.codes.length}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>
        <div className="min-w-0 space-y-14 lg:pr-3">
          {track.sections.map((s, si) => {
            const done = s.codes.filter(progress.isSolved).length;
            return (
              <div key={s.id} data-section-id={s.id}>
                <section id={s.id} className="scroll-mt-28 pb-4">
                  <div className="mb-8 flex flex-col items-center text-center">
                    <div className={ui.eyebrow}>Section {String(s.number).padStart(2, "0")}</div>
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <h2 className="text-2xl font-bold tracking-[-0.02em] text-text-primary">{s.title}</h2>
                      <SectionInfo section={s} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      <span className={`${badge(done === s.codes.length ? "success" : "neutral")} figures`}>
                        {done}/{s.codes.length} solved
                      </span>
                      <Link href={`/tracks/${track.slug}/sections/${s.id}`} className={`${ui.btnGhost} ${ui.btnSm}`}>
                        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                        Read the guide
                      </Link>
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    {s.codes.map((code, i) => {
                      const info = codes[code];
                      if (!info) return null;
                      const status: Status = progress.isSolved(code) ? "completed" : code === recommended ? "recommended" : "available";
                      const challenge = s.challenges?.includes(code);
                      return (
                        <div key={code} className="flex w-full flex-col items-center">
                          {i > 0 && <Connector filled={progress.isSolved(s.codes[i - 1])} />}
                          <Reveal>
                            <div className="w-full max-w-sm transition-transform duration-normal">
                              {challenge && <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-roadmap-gold">Section challenge</div>}
                              {track.dualMode ? (
                                <DualCard
                                  info={info}
                                  status={status}
                                  accent={accent}
                                  scratchDone={!!info.scratchId && statusOf(info.scratchId) === "completed"}
                                  fixDone={!!info.fixId && statusOf(info.fixId) === "completed"}
                                />
                              ) : (
                                <SingleCard info={info} status={status} accent={accent} />
                              )}
                            </div>
                          </Reveal>
                        </div>
                      );
                    })}
                  </div>
                </section>
                {si < track.sections.length - 1 && <div className="mx-auto mt-4 h-px w-full max-w-3xl bg-gradient-to-r from-transparent via-border-strong to-transparent" />}
              </div>
            );
          })}
        </div>
      </div>
      <div className="pointer-events-none fixed right-3 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-2 xl:flex">
        {track.sections.map((s) => {
          const done = s.codes.filter(progress.isSolved).length;
          return (
            <button
              key={s.id}
              type="button"
              title={`${s.title} (${done}/${s.codes.length})`}
              aria-label={`Go to ${s.title}`}
              onClick={() => goTo(s.id)}
              className={`pointer-events-auto h-2 w-2 rounded-full transition-all duration-fast ${active === s.id ? `${accent.dot} scale-150` : "bg-border-strong hover:bg-text-muted"}`}
            />
          );
        })}
      </div>
    </div>
  );
}
