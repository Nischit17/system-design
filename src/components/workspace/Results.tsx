"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronDown, HeartPulse, Lightbulb, Lock, Trophy, XCircle } from "lucide-react";
import type { Problem } from "@/lib/content/types";
import type { Band, EvaluationResult, ScenarioResult } from "@/lib/sim/evaluate";
import type { FailureTest, LoadTest } from "@/lib/sim/engine";
import { gsap, prefersReducedMotion, useGSAP } from "@/components/motion/gsap";
import { badge, ui } from "@/components/ui/styles";
import { GradingBadge } from "./WorkspaceParts";

export interface AttemptRow {
  attempt: number;
  score: number;
  passed: boolean;
  at: number;
}

type Tone = "success" | "accent" | "warning" | "danger";

const BAND_TONE: Record<Band, Tone> = {
  Excellent: "success",
  Strong: "success",
  Pass: "accent",
  "Needs Improvement": "warning",
  "Major Issues": "danger",
};

const TONE_TEXT: Record<Tone, string> = { success: "text-success", accent: "text-accent", warning: "text-warning", danger: "text-danger" };

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

/** Circular gauge that sweeps and counts up to the score on mount. */
function ScoreRing({ value, max, tone, unit }: { value: number; max: number; tone: Tone; unit: string }) {
  const root = useRef<HTMLDivElement>(null);
  const arc = useRef<SVGCircleElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const pct = Math.max(0, Math.min(1, value / Math.max(1, max)));
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(arc.current, { strokeDashoffset: RING_C, duration: 1.3, ease: "power3.out", delay: 0.1 });
      const s = { v: 0 };
      gsap.to(s, {
        v: value,
        duration: 1.3,
        ease: "power3.out",
        delay: 0.1,
        onUpdate: () => {
          if (num.current) num.current.textContent = String(Math.round(s.v));
        },
      });
    },
    { scope: root, dependencies: [value, max], revertOnUpdate: true },
  );
  return (
    <div ref={root} className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={RING_R} fill="none" stroke="var(--surface-active)" strokeWidth="9" />
        <circle
          ref={arc}
          cx="60"
          cy="60"
          r={RING_R}
          fill="none"
          stroke={`var(--${tone})`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - pct)}
          style={{ filter: `drop-shadow(0 0 8px color-mix(in srgb, var(--${tone}) 50%, transparent))` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span ref={num} className="figures text-4xl font-bold leading-none text-text-primary">
          {value}
        </span>
        <span className="figures mt-1 text-[11px] font-medium text-text-muted">{unit}</span>
      </div>
    </div>
  );
}

function ScoreHeader({ title, score, max, unit, status, tone, children }: { title: string; score: number; max: number; unit: string; status: string; tone: Tone; children?: React.ReactNode }) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-border bg-surface/80 p-6 sm:p-7">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full blur-3xl"
        style={{ background: `color-mix(in srgb, var(--${tone}) 16%, transparent)` }}
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
        <ScoreRing value={score} max={max} tone={tone} unit={unit} />
        <div className="min-w-0 flex-1">
          <p className={ui.eyebrow}>{title}</p>
          <h2 className={`mt-2 text-2xl font-bold ${TONE_TEXT[tone]}`}>{status}</h2>
          {children}
        </div>
      </div>
    </header>
  );
}

function Attempts({ attempts, best }: { attempts: AttemptRow[]; best: number }) {
  const recent = attempts.slice(-12);
  return (
    <section className={`${ui.card} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Attempts</h3>
        <span className={`${badge("success")} figures`}>
          <Trophy className="h-3 w-3" aria-hidden="true" />
          Best {best}
        </span>
      </div>
      <div className="thin-scrollbar mt-4 flex items-end gap-2 overflow-x-auto pb-1">
        {recent.map((a, i) => (
          <div key={a.attempt} className="flex min-w-9 flex-1 flex-col items-center gap-1.5" title={`Attempt ${a.attempt}: ${a.score}/100${a.passed ? ", passed" : ""}`}>
            <span className={`figures text-[11px] font-semibold ${a.passed ? "text-success" : "text-text-secondary"}`}>{a.score}</span>
            <div className="flex h-20 w-full items-end justify-center">
              <div
                className={`w-full max-w-10 origin-bottom rounded-t-lg rounded-b-sm motion-safe:animate-[bar-grow_700ms_var(--ease-spring-interactive)_both] ${
                  a.passed ? "bg-gradient-to-t from-success/50 to-success" : "bg-gradient-to-t from-surface-active to-border-strong"
                }`}
                style={{ height: `${Math.max(4, a.score)}%`, animationDelay: `${i * 40}ms` }}
              />
            </div>
            <span className="figures text-[10px] text-text-muted">#{a.attempt}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Actions({ showReference, onReturn, onReference }: { showReference: boolean; onReturn: () => void; onReference: () => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={onReturn} className={ui.btnSecondary}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Return to design
      </button>
      {showReference && (
        <button type="button" onClick={onReference} className={ui.btnPrimary}>
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          View reference design
        </button>
      )}
    </div>
  );
}

function Bullets({ items, dot }: { items: string[]; dot: string }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((r) => (
        <li key={r} className="flex gap-2.5 text-sm leading-6 text-text-secondary">
          <span className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}

function Improve({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="rounded-2xl border border-accent/30 bg-accent-soft p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Lightbulb className="h-4 w-4 text-accent" aria-hidden="true" />
        How to improve
      </h3>
      <Bullets items={items} dot="bg-accent" />
    </section>
  );
}

function Stat({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <div className={ui.statLabel}>{label}</div>
      <div className={`figures mt-0.5 text-sm font-semibold ${bad ? "text-danger" : "text-text-primary"}`}>{value}</div>
    </div>
  );
}

function ServerRows({ rows, unit }: { rows: LoadTest["perServer"]; unit: string }) {
  if (!rows.length) return null;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.nodeId} className="flex items-center justify-between gap-3 px-5 py-2.5">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary">
              {r.label} <span className="font-normal text-text-muted">({r.sizeLabel})</span>
            </div>
            <div className="figures text-xs text-text-muted">
              {r.trafficRps.toLocaleString()} {unit} handled
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-active sm:block">
              <div className={`h-full rounded-full ${r.passed ? "bg-success" : "bg-danger"}`} style={{ width: `${Math.min(100, r.cpuPercent)}%` }} />
            </div>
            <span className={`figures text-sm font-semibold ${r.passed ? "text-text-primary" : "text-danger"}`}>{r.cpuPercent}% CPU</span>
            {r.passed ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> : <XCircle className="h-4 w-4 text-danger" aria-hidden="true" />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function LoadTestCard({ title, test, unit, p95Max, p99Max, errorMax }: { title: string; test: LoadTest; unit: string; p95Max?: number; p99Max?: number; errorMax?: number }) {
  return (
    <section className={`${ui.card} overflow-hidden`}>
      <h3 className={ui.cardHeader}>
        {title}
        <span className={`${badge("neutral")} figures ml-auto`}>
          {test.rps.toLocaleString()} {unit}
        </span>
      </h3>
      <ServerRows rows={test.perServer} unit={unit} />
      <div className="grid grid-cols-2 gap-4 border-t border-border bg-background-elevated/50 px-5 py-3.5 sm:grid-cols-5">
        <Stat label="p95" value={`${test.p95Ms} ms`} bad={p95Max !== undefined && test.p95Ms > p95Max} />
        <Stat label="p99" value={`${test.p99Ms} ms`} bad={p99Max !== undefined && test.p99Ms > p99Max} />
        <Stat label="Error rate" value={`${test.errorRatePercent}%`} bad={errorMax !== undefined ? test.errorRatePercent > errorMax : test.errorRatePercent > 0} />
        <Stat label="Requested" value={`${test.rps.toLocaleString()} ${unit}`} />
        <Stat label="Total capacity" value={`${test.totalCapacityRps.toLocaleString()} ${unit}`} bad={test.totalCapacityRps < test.rps} />
      </div>
    </section>
  );
}

function FailureCard({ test }: { test: FailureTest }) {
  return (
    <section className={`${ui.card} overflow-hidden`}>
      <h3 className={ui.cardHeader}>
        <HeartPulse className="h-4 w-4 text-danger" aria-hidden="true" />
        Server failure test
        <span className="ml-auto text-xs font-medium text-text-muted">
          <span className="figures">{test.rps.toLocaleString()} RPS</span>, {test.unhealthyLabel} unhealthy
        </span>
      </h3>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
        <span className="text-sm text-text-secondary">Health checks</span>
        <span className={badge(test.healthChecksEnabled ? "success" : "danger")}>{test.healthChecksEnabled ? "Enabled" : "Disabled"}</span>
      </div>
      <ServerRows rows={test.perServer} unit="RPS" />
      <div className="grid grid-cols-2 gap-4 border-t border-border bg-background-elevated/50 px-5 py-3.5">
        <Stat label="Successful" value={`${test.successfulRps.toLocaleString()} RPS`} bad={test.successfulRps < 0.98 * test.rps} />
        <Stat label="Failed" value={`${test.failedRps.toLocaleString()} RPS`} bad={test.failedRps > 0} />
      </div>
    </section>
  );
}

function OutcomeIcon({ state }: { state: "pass" | "partial" | "fail" }) {
  if (state === "pass") return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />;
  if (state === "partial") return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />;
  return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />;
}

function Points({ earned, max }: { earned: number; max: number }) {
  return (
    <span className={`figures shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${earned >= max ? "bg-success/12 text-success" : "bg-surface-active text-text-muted"}`}>
      {earned}/{max}
    </span>
  );
}

/** Category breakdown + load/failure tests + warnings. Shared by simulation and scenario results. */
function SimulationDetails({ problem, result }: { problem: Problem; result: EvaluationResult }) {
  const sim = problem.sim;
  const unit = sim?.trafficUnit ?? "RPS";
  return (
    <div className="stagger-in space-y-5">
      <section className={`${ui.card} overflow-hidden`}>
        <h3 className={ui.cardHeader}>Architecture score</h3>
        <ul className="divide-y divide-border">
          {result.categories.map((c) => (
            <li key={c.key} className="flex items-start gap-3 px-5 py-3.5">
              <OutcomeIcon state={c.earned >= c.max ? "pass" : c.earned > 0 ? "partial" : "fail"} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-text-primary">{c.label}</div>
                <p className="mt-0.5 text-sm leading-6 text-text-secondary">{c.message}</p>
                {c.rules && (
                  <ul className="mt-2.5 space-y-1.5 border-l-2 border-border pl-3">
                    {c.rules.map((r) => (
                      <li key={r.id} className="flex items-start gap-2 text-xs leading-5">
                        {r.passed ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                        ) : (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1 text-text-secondary">
                          <span className="font-semibold text-text-primary">{r.label}.</span> {r.message}
                        </span>
                        <span className="figures shrink-0 text-text-muted">
                          {r.earned}/{r.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Points earned={c.earned} max={c.max} />
            </li>
          ))}
        </ul>
      </section>
      {result.sustained && <LoadTestCard title="Sustained load test" test={result.sustained} unit={unit} p95Max={sim?.p95MaxMs} p99Max={sim?.p99MaxMs} errorMax={sim?.errorMaxPercent} />}
      {result.peak && <LoadTestCard title="Peak load test" test={result.peak} unit={unit} p95Max={sim?.p95MaxMs} p99Max={sim?.p99MaxMs} errorMax={sim?.errorMaxPercent} />}
      {result.failureTest && <FailureCard test={result.failureTest} />}
      {result.warnings.length > 0 && (
        <section className="rounded-2xl border border-warning/30 bg-warning/[0.06] p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            Warnings
          </h3>
          <Bullets items={result.warnings} dot="bg-warning" />
        </section>
      )}
    </div>
  );
}

type ResultShellProps = {
  problem: Problem;
  attempts: AttemptRow[];
  best: number;
  onReturn: () => void;
  onReference: () => void;
};

export function SimulationResults({ problem, result, attempts, best, onReturn, onReference }: ResultShellProps & { result: EvaluationResult }) {
  return (
    <div className="stagger-in mx-auto w-full max-w-3xl space-y-5 p-3 sm:p-6">
      <ScoreHeader
        title="Architecture score"
        score={result.score}
        max={result.maxScore}
        unit={`of ${result.maxScore}`}
        status={result.passed ? "Problem passed" : "Not passed yet"}
        tone={result.passed ? "success" : result.score >= result.passingScore * 0.6 ? "warning" : "danger"}
      >
        <p className="mt-2 text-sm text-text-muted">Passing requires every hard requirement met and a score of at least {result.passingScore}.</p>
        <GradingBadge problem={problem} className="mt-3" />
        {result.budgetUsd !== null && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
            <span className="text-sm font-semibold text-text-primary">Monthly cost</span>
            <span className={`figures text-sm font-semibold ${result.costUsd <= result.budgetUsd ? "text-text-primary" : "text-danger"}`}>
              ${result.costUsd.toLocaleString()} <span className="font-medium text-text-muted">/ ${result.budgetUsd.toLocaleString()} budget</span>
            </span>
          </div>
        )}
      </ScoreHeader>
      <SimulationDetails problem={problem} result={result} />
      <Improve items={result.recommendations} />
      <Attempts attempts={attempts} best={best} />
      <Actions showReference={best >= result.passingScore} onReturn={onReturn} onReference={onReference} />
    </div>
  );
}

export function ChecklistResults({ problem, result, attempts, best, onReturn, onReference }: ResultShellProps & { result: EvaluationResult }) {
  return (
    <div className="stagger-in mx-auto w-full max-w-3xl space-y-5 p-3 sm:p-6">
      <ScoreHeader title="Architecture score" score={result.score} max={result.maxScore} unit={`of ${result.maxScore}`} status={result.band} tone={BAND_TONE[result.band]}>
        <p className="mt-2 text-sm text-text-muted">
          {result.passed ? `Passing score is ${problem.passingScore}. This design passes.` : `Passing score is ${problem.passingScore}. Keep refining the design and submit again.`}
        </p>
        <GradingBadge problem={problem} className="mt-3 border-t border-border pt-3" />
      </ScoreHeader>
      <section className={`${ui.card} overflow-hidden`}>
        <h3 className={ui.cardHeader}>Scoring breakdown</h3>
        <ul className="divide-y divide-border">
          {result.outcomes.map((o) => (
            <li key={o.id} className="flex items-start gap-3 px-5 py-3.5">
              <OutcomeIcon state={o.passed ? "pass" : o.kind === "quality" ? "partial" : "fail"} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                  {o.label}
                  {o.bonus && <span className={badge("accent")}>Bonus</span>}
                </div>
                <p className="mt-0.5 text-sm leading-6 text-text-secondary">{o.message}</p>
              </div>
              <Points earned={o.earned} max={o.points} />
            </li>
          ))}
        </ul>
      </section>
      {result.flow.length > 0 && (
        <section className={`${ui.card} p-5`}>
          <h3 className="text-sm font-semibold text-text-primary">Architecture flow</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {result.flow.map((f, i) => (
              <span key={`${f}-${i}`} className="flex items-center gap-2">
                {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />}
                <span className="rounded-lg border border-border bg-surface-hover px-2.5 py-1 text-xs font-medium text-text-primary">{f}</span>
              </span>
            ))}
          </div>
        </section>
      )}
      <Improve items={result.recommendations} />
      <Attempts attempts={attempts} best={best} />
      <Actions showReference={best >= problem.passingScore} onReturn={onReturn} onReference={onReference} />
    </div>
  );
}

export function ScenarioResults({ problem, scenarios, attempts, best, onReturn, onReference }: ResultShellProps & { scenarios: ScenarioResult[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const required = scenarios.filter((s) => s.required);
  const passedCount = required.filter((s) => s.result.passed).length;
  const allPassed = passedCount === required.length;
  const hasBonus = scenarios.some((s) => !s.required);
  return (
    <div className="stagger-in mx-auto w-full max-w-3xl space-y-5 p-3 sm:p-6">
      <ScoreHeader
        title="System test results"
        score={passedCount}
        max={required.length}
        unit={`of ${required.length} required`}
        status={allPassed ? "System passed" : "Not passed yet"}
        tone={allPassed ? "success" : passedCount > 0 ? "warning" : "danger"}
      >
        <p className="mt-2 text-sm text-text-muted">
          Every required scenario has to pass on its own; a design that only clears the baseline isn&apos;t done yet.
          {hasBonus && " Clear every required scenario to unlock the Extreme Test below."}
        </p>
        <GradingBadge problem={problem} className="mt-3 border-t border-border pt-3" />
      </ScoreHeader>
      <section className={`${ui.card} overflow-hidden`}>
        <h3 className={ui.cardHeader}>Scenarios</h3>
        <ul className="divide-y divide-border">
          {scenarios.map((s) => {
            const expanded = open === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={s.locked}
                  aria-expanded={s.locked ? undefined : expanded}
                  onClick={() => setOpen(expanded ? null : s.id)}
                  className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors duration-fast ${s.locked ? "cursor-default opacity-60" : "hover:bg-surface-hover"}`}
                >
                  {s.locked ? (
                    <Lock className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                  ) : s.result.passed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                      {s.label}
                      {!s.required && <span className={badge("accent")}>Bonus</span>}
                    </div>
                    {s.locked ? (
                      <p className="mt-0.5 text-xs text-text-muted">Locked; pass every required scenario to unlock.</p>
                    ) : (
                      <p className="mt-0.5 text-xs leading-5 text-text-secondary">{s.narrative}</p>
                    )}
                  </div>
                  {!s.locked && <Points earned={s.result.score} max={s.result.maxScore} />}
                  {!s.locked && <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-normal ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />}
                </button>
                {expanded && !s.locked && (
                  <div className="border-t border-border bg-background-elevated/60 p-3 sm:p-4">
                    <SimulationDetails problem={problem} result={s.result} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <Attempts attempts={attempts} best={best} />
      <Actions showReference={allPassed || best >= problem.passingScore} onReturn={onReturn} onReference={onReference} />
    </div>
  );
}
