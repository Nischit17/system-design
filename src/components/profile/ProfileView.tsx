"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, CalendarCheck2, CheckCircle2, Download, Flame, HardDrive, RotateCcw, Trophy, Upload, X } from "lucide-react";
import type { Difficulty } from "@/lib/content/types";
import { DIFFICULTY_TONE } from "@/lib/content/summaries";
import { dayKey, useHydrated, useUserData } from "@/lib/store/user-data";
import { SITE } from "@/lib/site";
import { badge, ui } from "@/components/ui/styles";

export interface ProfileProblem {
  id: string;
  title: string;
  difficulty: Difficulty;
  track: string;
  group: string;
}

const LEVEL_CLASS = ["bg-surface-active", "bg-streak-1", "bg-streak-2", "bg-streak-3", "bg-streak-4"];
const WEEKDAYS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDay(key: string) {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function Heatmap({ completions }: { completions: Record<string, number> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const { weeks, months, total, current, longest, activeDays } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 364 - start.getDay());
    const weeks: { date: string; count: number; future: boolean; level: number }[][] = [];
    const months: { label: string; col: number }[] = [];
    let cursor = new Date(start);
    let col = 0;
    let lastMonth = -1;
    while (cursor <= today || cursor.getDay() !== 0) {
      const week: { date: string; count: number; future: boolean; level: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const key = dayKey(cursor.getTime());
        const count = completions[key] ?? 0;
        week.push({ date: key, count, future: cursor > today, level: count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4 });
        if (d === 0 && cursor.getMonth() !== lastMonth) {
          months.push({ label: MONTHS[cursor.getMonth()], col });
          lastMonth = cursor.getMonth();
        }
        cursor = new Date(cursor);
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
      col++;
      if (col > 54) break;
    }
    const days = weeks.flat().filter((d) => !d.future);
    const total = days.reduce((s, d) => s + d.count, 0);
    let current = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].count > 0) current++;
      else if (i === days.length - 1) continue;
      else break;
    }
    let longest = 0;
    let run = 0;
    for (const d of days) {
      run = d.count > 0 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    return { weeks, months, total, current, longest, activeDays: days.filter((d) => d.count > 0).length };
  }, [completions]);

  // the page is prerendered, so "today" is only known in the browser
  const hydrated = useHydrated();

  const show = (e: React.MouseEvent | React.FocusEvent, d: { date: string; count: number; future: boolean }) => {
    if (d.future || !wrap.current) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const w = wrap.current.getBoundingClientRect();
    setTip({
      text: d.count === 0 ? `No activity on ${fmtDay(d.date)}` : `${d.count} problem${d.count === 1 ? "" : "s"} completed on ${fmtDay(d.date)}`,
      x: r.left - w.left + r.width / 2,
      y: r.top - w.top,
    });
  };

  if (!hydrated) return <div aria-hidden="true" className={`${ui.card} h-[262px] animate-pulse`} />;

  return (
    <div className={`${ui.card} relative overflow-hidden p-5 sm:p-6`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--streak-3)_10%,transparent)] via-transparent to-transparent" />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Activity</h2>
          <p className="mt-1 text-sm text-text-muted">
            {total} problem{total === 1 ? "" : "s"} completed in the last year
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          {[
            { icon: Flame, value: current, label: "Current streak", cls: "bg-warning/15 text-warning" },
            { icon: Trophy, value: longest, label: "Longest streak", cls: "bg-accent-soft text-accent" },
            { icon: CalendarCheck2, value: activeDays, label: "Active days", cls: "bg-mint/15 text-mint" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.cls}`}>
                <s.icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <div className="figures text-lg font-bold leading-tight text-text-primary">{s.value}</div>
                <div className={ui.statLabel}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div ref={wrap} className="relative mt-6 overflow-x-auto">
        {tip && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border-strong bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-[0_12px_28px_-12px_rgba(0,0,0,0.8)]"
            style={{ left: tip.x, top: tip.y - 8 }}
          >
            {tip.text}
          </div>
        )}
        <div className="relative ml-8 h-4 text-[10px] text-text-muted">
          {months.map((m, i) => (
            <span key={`${m.label}-${i}`} className="absolute" style={{ left: m.col * 14 }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="relative">
          <div className="inline-flex gap-[3px] pl-8">
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {w.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    disabled={d.future}
                    aria-label={d.future ? undefined : `${d.count} completed on ${d.date}`}
                    onMouseEnter={(e) => show(e, d)}
                    onFocus={(e) => show(e, d)}
                    onMouseLeave={() => setTip(null)}
                    onBlur={() => setTip(null)}
                    className={`h-[11px] w-[11px] rounded-[3px] transition-transform duration-fast ${
                      d.future ? "invisible" : `${LEVEL_CLASS[d.level]} hover:scale-125 focus-visible:scale-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute left-0 top-0 flex flex-col gap-[3px] text-[10px] leading-[11px] text-text-muted">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="block h-[11px] w-7 pr-1.5 text-right">
                {d}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-text-muted">
          Less
          {LEVEL_CLASS.map((c) => (
            <span key={c} className={`h-[11px] w-[11px] rounded-[3px] ${c}`} />
          ))}
          More
        </div>
      </div>
    </div>
  );
}

function Radar({ axes }: { axes: { label: string; value: number }[] }) {
  const size = 280;
  const c = size / 2;
  const r = 100;
  const n = axes.length;
  const point = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v];
  };
  const poly = axes.map((a, i) => point(i, Math.max(0.04, a.value)).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-72 w-72" role="img" aria-label="Skill breakdown">
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={axes.map((_, i) => point(i, k).join(",")).join(" ")} fill="none" stroke="var(--border)" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = point(i, 1);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--border)" strokeWidth="1" />;
      })}
      <polygon points={poly} fill="color-mix(in srgb, var(--accent) 25%, transparent)" stroke="var(--accent)" strokeWidth="2" />
      {axes.map((a, i) => {
        const [x, y] = point(i, 1.22);
        return (
          <text key={a.label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-[var(--text-muted)] text-[9px] font-semibold">
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function YourData({ joinedAt, loaded }: { joinedAt: number; loaded: boolean }) {
  const { exportProgress, importProgress, resetProgress } = useUserData();
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const ok = importProgress(await file.text());
    setNote(ok ? { ok: true, text: "Progress imported." } : { ok: false, text: "That file isn't a valid progress export." });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section className={`${ui.card} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <HardDrive className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Your data</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-text-muted">
              {SITE.name} has no accounts. Progress, lists and canvas drafts are stored in this browser
              {loaded ? ` since ${new Date(joinedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}` : ""}. Export a copy to
              move it to another device.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <button type="button" onClick={() => download(`loadline-progress-${dayKey()}.json`, exportProgress())} className={`${ui.btnSecondary} ${ui.btnSm}`}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export progress
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={`${ui.btnSecondary} ${ui.btnSm}`}>
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          Import progress
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onImport(e.target.files?.[0])} />
        <button type="button" onClick={() => setConfirm(true)} className={`${ui.btnDanger} ${ui.btnSm} sm:ml-auto`}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset progress
        </button>
      </div>
      {note && (
        <p
          className={`mt-4 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
            note.ok ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger"
          }`}
        >
          {note.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />}
          {note.text}
        </p>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-md motion-safe:animate-[route-settle-in_200ms_ease-out_both]" onMouseDown={() => setConfirm(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm progress reset"
            className={`${ui.dialog} w-full max-w-md p-6 motion-safe:animate-[result-reveal_240ms_var(--ease-spring-interactive)_both]`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-bold text-text-primary">Reset all progress?</h2>
              <button type="button" aria-label="Close" onClick={() => setConfirm(false)} className={`${ui.iconBtn} !h-8 !w-8`}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-3 text-sm text-text-secondary">This clears, on this browser only:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-secondary">
              <li>Problem progress, best scores and completion history</li>
              <li>Your lists and saved canvas designs</li>
              <li>Your activity and streaks</li>
            </ul>
            <p className="mt-3 text-sm font-semibold text-danger">Export first if you might want it back.</p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button type="button" onClick={() => setConfirm(false)} className={`${ui.btnSecondary} ${ui.btnSm}`}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  resetProgress();
                  setConfirm(false);
                  setNote({ ok: true, text: "Progress reset. You're starting fresh." });
                }}
                className={`${ui.btnSm} btn-press inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 font-semibold text-white transition-all duration-normal hover:brightness-110`}
              >
                Yes, reset everything
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function ProfileView({ problems }: { problems: ProfileProblem[] }) {
  const { data, loaded } = useUserData();
  const byId = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems]);

  const records = Object.entries(data.problems);
  const completed = records.filter(([, r]) => r.status === "completed");
  const byDifficulty = (d: Difficulty) => completed.filter(([id]) => byId.get(id)?.difficulty === d).length;
  const totalOf = (d: Difficulty) => problems.filter((p) => p.difficulty === d).length;
  const attempts = records.reduce((s, [, r]) => s + r.attempts, 0);
  const groups = Array.from(new Set(problems.map((p) => p.group)));
  const axes = groups.map((g) => {
    const inGroup = problems.filter((p) => p.group === g);
    const done = inGroup.filter((p) => data.problems[p.id]?.status === "completed").length;
    return { label: g, value: inGroup.length ? done / inGroup.length : 0, done, total: inGroup.length };
  });
  const history = [...records].sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, 12);

  return (
    <div className="stagger-in space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className={`${ui.card} relative overflow-hidden p-5`}>
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent to-mint" />
          <div className={ui.statLabel}>Solved</div>
          <div className="figures mt-2 text-3xl font-bold text-text-primary">
            {completed.length}
            <span className="text-base font-medium text-text-muted"> / {problems.length}</span>
          </div>
        </div>
        {(["Easy", "Medium", "Hard"] as Difficulty[]).map((d) => (
          <div key={d} className={`${ui.card} p-5`}>
            <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${DIFFICULTY_TONE[d].text}`}>{d}</div>
            <div className="figures mt-2 text-3xl font-bold text-text-primary">
              {byDifficulty(d)}
              <span className="text-base font-medium text-text-muted"> / {totalOf(d)}</span>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-active">
              <div className={`h-full rounded-full ${DIFFICULTY_TONE[d].dot} transition-[width] duration-slow ease-spring-interactive`} style={{ width: `${(byDifficulty(d) / Math.max(1, totalOf(d))) * 100}%` }} />
            </div>
          </div>
        ))}
        <div className={`${ui.card} p-5`}>
          <div className={ui.statLabel}>Submissions</div>
          <div className="figures mt-2 text-3xl font-bold text-text-primary">{attempts}</div>
        </div>
      </div>

      <Heatmap completions={data.completions} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={`${ui.card} p-5 sm:p-6`}>
          <h2 className="text-lg font-semibold text-text-primary">Skill breakdown</h2>
          <p className="mt-1 text-sm text-text-muted">Share of each roadmap area you have completed.</p>
          <Radar axes={axes} />
          <ul className="mt-2 space-y-2.5">
            {axes.map((a) => (
              <li key={a.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-secondary">{a.label}</span>
                  <span className="figures text-text-muted">
                    {a.done}/{a.total}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-active">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent to-mint" style={{ width: `${a.value * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className={`${ui.card} p-5 sm:p-6`}>
          <h2 className="text-lg font-semibold text-text-primary">Problem history</h2>
          <p className="mt-1 text-sm text-text-muted">Your most recently touched problems.</p>
          {history.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
              Nothing yet.
              <Link href="/problems" className={`${ui.btnPrimary} ${ui.btnSm}`}>
                Pick a problem
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-1">
              {history.map(([id, r]) => {
                const p = byId.get(id);
                if (!p) return null;
                return (
                  <li key={id}>
                    <Link href={`/problems/${id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors duration-fast hover:bg-surface-hover">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text-primary">{p.title}</span>
                        <span className="figures text-[11px] text-text-muted">
                          {id.split("-")[0].toUpperCase()} · {r.attempts} attempt{r.attempts === 1 ? "" : "s"} · {new Date(r.updatedAt).toLocaleDateString()}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2.5">
                        <span className="figures text-xs text-text-muted">{r.bestScore > 0 ? `${r.bestScore}/100` : "-"}</span>
                        <span className={badge(r.status === "completed" ? "success" : "warning")}>{r.status === "completed" ? "Completed" : "In progress"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <YourData joinedAt={data.joinedAt} loaded={loaded} />
    </div>
  );
}
