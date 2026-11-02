"use client";

import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, BookOpen, CheckCircle2, ChevronDown, Circle, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { CATEGORY_STYLES, computeNodeDisplayNames, getComponent } from "@/lib/catalog/components";
import type { Problem, StartingMetrics } from "@/lib/content/types";
import type { Graph } from "@/lib/sim/graph";
import { isSimulationGraded } from "@/lib/sim/evaluate";
import { DB_SIZE_TABLE, LOAD_BALANCER_CAPACITY_RPS, LOAD_BALANCER_MONTHLY_COST_USD, SIZE_TABLE } from "@/lib/sim/tables";
import { badge, ui } from "@/components/ui/styles";

export const SECTION_LABEL = ui.label;

export function GradingBadge({ problem, className = "" }: { problem: Problem; className?: string }) {
  const sim = isSimulationGraded(problem);
  return (
    <p className={`flex flex-wrap items-center gap-2 text-xs leading-5 text-text-muted ${className}`}>
      <span className={badge(sim ? "accent" : "neutral")}>{sim ? "Simulation-graded" : "Checklist-graded"}</span>
      <span>{sim ? "Scored against a capacity, cost and latency simulation." : "Scored against a fixed set of structural rules."}</span>
    </p>
  );
}

const TH = "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted";
const TD = "px-3 py-2 text-text-secondary";

export function ComponentReference({ showDatabase }: { showDatabase: boolean }) {
  return (
    <section>
      <h2 className={SECTION_LABEL}>Component reference</h2>
      <div className="mt-2.5 overflow-hidden rounded-xl border border-border bg-surface/60">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-hover/70">
            <tr>
              <th className={TH}>Component</th>
              <th className={TH}>Handles</th>
              <th className={TH}>Cost</th>
            </tr>
          </thead>
          <tbody className="figures divide-y divide-border">
            {Object.entries(SIZE_TABLE).map(([size, row]) => (
              <tr key={size}>
                <td className="px-3 py-2 font-semibold text-text-primary">{size} server</td>
                <td className={TD}>~{row.capacityRps.toLocaleString()} RPS</td>
                <td className={TD}>${row.monthlyCostUsd}/mo</td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2 font-semibold text-text-primary">Load balancer</td>
              <td className={TD}>~{LOAD_BALANCER_CAPACITY_RPS.toLocaleString()} RPS</td>
              <td className={TD}>${LOAD_BALANCER_MONTHLY_COST_USD}/mo</td>
            </tr>
          </tbody>
        </table>
      </div>
      {showDatabase && (
        <div className="mt-2.5 overflow-hidden rounded-xl border border-border bg-surface/60">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-hover/70">
              <tr>
                <th className={TH}>Database</th>
                <th className={TH}>Reads/s</th>
                <th className={TH}>Writes/s</th>
                <th className={TH}>Cost</th>
              </tr>
            </thead>
            <tbody className="figures divide-y divide-border">
              {Object.entries(DB_SIZE_TABLE).map(([size, row]) => (
                <tr key={size}>
                  <td className="px-3 py-2 font-semibold text-text-primary">{size}</td>
                  <td className={TD}>{row.readCapacityPerSec.toLocaleString()}</td>
                  <td className={TD}>{row.writeCapacityPerSec.toLocaleString()}</td>
                  <td className={TD}>${row.monthlyCostUsd}/mo</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-3 py-2 text-[11px] leading-4 text-text-muted">
            Free has no real read/write capacity; only correct for problems that don&apos;t grade database throughput.
          </p>
        </div>
      )}
    </section>
  );
}

function Chip({ type }: { type: string }) {
  const def = getComponent(type);
  if (!def) return null;
  const Icon = def.icon;
  const st = CATEGORY_STYLES[def.category];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-medium text-text-primary">
      <span className={`flex h-5 w-5 items-center justify-center rounded-md ${st.chip}`}>
        <Icon className="h-3 w-3" aria-hidden="true" />
      </span>
      {def.label}
    </span>
  );
}

export function FlowGuide({ title, types }: { title: string; types: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {types.map((t, i) => (
          <span key={`${t}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />}
            <Chip type={t} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Snapshot of the broken system shown above the canvas in "fix existing design" mode. */
export function ProductionMetricsBar({ metrics, cpuMaxPercent, budgetMaxUsd }: { metrics: StartingMetrics; cpuMaxPercent?: number; budgetMaxUsd?: number }) {
  const cpuHot = metrics.appCpuPercent !== undefined && cpuMaxPercent !== undefined && metrics.appCpuPercent > cpuMaxPercent;
  const costHot = budgetMaxUsd !== undefined && metrics.monthlyCostUsd > budgetMaxUsd;
  const errHot = metrics.errorRatePercent !== undefined && metrics.errorRatePercent > 1;
  const memHot = metrics.appMemoryPercent !== undefined && metrics.appMemoryPercent >= 95;
  const worst = metrics.perServer?.length ? metrics.perServer.reduce((a, b) => (b.cpuPercent > a.cpuPercent ? b : a)) : null;
  const worstHot = !!worst && cpuMaxPercent !== undefined && worst.cpuPercent > cpuMaxPercent;
  const p95Hot = metrics.p95Ms !== undefined && metrics.p95Ms > 800;
  const alert = cpuHot || costHot || errHot || worstHot || memHot || p95Hot;
  const summary = cpuHot
    ? `App CPU is at ${metrics.appCpuPercent}%, over the ${cpuMaxPercent}% target.`
    : worstHot && worst
      ? `${worst.label} is at ${worst.cpuPercent}% CPU, over the ${cpuMaxPercent}% target.`
      : memHot
        ? `App memory is at ${metrics.appMemoryPercent}%; servers are running out of memory.`
        : costHot
          ? `Monthly cost is at $${metrics.monthlyCostUsd.toLocaleString()}, over the $${budgetMaxUsd?.toLocaleString()} budget.`
          : errHot
            ? `Error rate is at ${metrics.errorRatePercent}%.`
            : p95Hot
              ? `p95 latency is ${metrics.p95Ms} ms.`
              : "Snapshot of the system before any changes.";
  const items = [
    { label: "Traffic", value: `${metrics.rps.toLocaleString()} ${metrics.trafficUnit ?? "RPS"}`, hot: false },
    ...(metrics.appCpuPercent !== undefined ? [{ label: "App CPU", value: `${metrics.appCpuPercent}%`, hot: cpuHot }] : []),
    ...(metrics.appMemoryPercent !== undefined ? [{ label: "App memory", value: `${metrics.appMemoryPercent}%`, hot: memHot }] : []),
    { label: "Monthly cost", value: `$${metrics.monthlyCostUsd.toLocaleString()}`, hot: costHot },
    ...(metrics.dbCpuPercent !== undefined ? [{ label: "DB CPU", value: `${metrics.dbCpuPercent}%`, hot: metrics.dbCpuPercent > 85 }] : []),
    ...(metrics.dbConnections !== undefined ? [{ label: "DB connections", value: String(metrics.dbConnections), hot: false }] : []),
    ...(metrics.p50Ms !== undefined ? [{ label: "p50 latency", value: `${metrics.p50Ms} ms`, hot: false }] : []),
    ...(metrics.p95Ms !== undefined ? [{ label: "p95 latency", value: `${metrics.p95Ms} ms`, hot: p95Hot }] : []),
    ...(metrics.p99Ms !== undefined ? [{ label: "p99 latency", value: `${metrics.p99Ms} ms`, hot: metrics.p99Ms > 1500 }] : []),
    ...(metrics.errorRatePercent !== undefined ? [{ label: "Error rate", value: `${metrics.errorRatePercent}%`, hot: errHot }] : []),
    ...(worst ? [{ label: "Worst server", value: `${worst.label} · ${worst.cpuPercent}%`, hot: worstHot }] : []),
  ];
  return (
    <div
      className={`mb-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border px-4 py-3 ${
        alert ? "border-danger/35 bg-danger/[0.08]" : "border-border bg-surface/80"
      }`}
    >
      <div className="flex min-w-[220px] items-center gap-3">
        <span className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${alert ? "bg-danger/15 text-danger" : "bg-surface-active text-text-muted"}`}>
          {alert ? <AlertTriangle className="h-[18px] w-[18px]" aria-hidden="true" /> : <Activity className="h-[18px] w-[18px]" aria-hidden="true" />}
          {alert && <span className="status-dot absolute -right-0.5 -top-0.5" data-state="down" aria-hidden="true" />}
        </span>
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${alert ? "text-danger" : "text-text-primary"}`}>{alert ? "Production alert" : "Current production metrics"}</div>
          <div className="truncate text-xs text-text-muted">{summary}</div>
        </div>
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2">
        {items.map((it) => (
          <div key={it.label} className="min-w-0">
            <div className={ui.statLabel}>{it.label}</div>
            <div className={`figures text-sm font-bold ${it.hot ? "text-danger" : "text-text-primary"}`}>{it.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Expandable list of every node's configuration (used on the Solution tab). */
export function ConfigurationSummary({ graph }: { graph: Graph }) {
  const [open, setOpen] = useState(false);
  const names = computeNodeDisplayNames(graph.nodes);
  const items = graph.nodes.flatMap((n) => (getComponent(n.type) ? [{ node: n, def: getComponent(n.type)! }] : []));
  if (items.length === 0) return null;
  const anyChanged = items.some(({ node, def }) => def.configFields.some((f) => (node.config[f.key] ?? f.defaultValue) !== f.defaultValue));
  return (
    <div className={`rounded-2xl border bg-surface/80 transition-colors duration-fast ${open ? "border-accent/40" : "border-border"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors duration-fast hover:bg-surface-hover"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
          <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Component configuration</h3>
            <span className={`${badge("neutral")} figures`}>{items.length}</span>
          </span>
          <p className="mt-0.5 text-xs text-text-muted">
            {open ? "Hide" : "Show"} every node&apos;s full config
            {anyChanged && (
              <>
                {" "}(<span className="font-semibold text-accent">highlighted</span> fields were deliberately set away from the default)
              </>
            )}
            .
          </p>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-text-secondary transition-transform duration-normal ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="stagger-in grid grid-cols-1 items-start gap-3 border-t border-border p-4 sm:grid-cols-2">
          {items.map(({ node, def }) => {
            const st = CATEGORY_STYLES[def.category];
            const Icon = def.icon;
            return (
              <div key={node.id} className="relative overflow-hidden rounded-xl border border-border bg-background-elevated p-4">
                <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[2px] ${st.bar}`} />
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${st.chip}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-text-primary">{def.label}</h4>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className={`font-semibold capitalize ${st.text}`}>{def.category}</span>
                      <span className="text-text-muted">·</span>
                      <span className="figures text-text-muted">{names.get(node.id)}</span>
                    </div>
                  </div>
                </div>
                {def.configFields.length > 0 ? (
                  <dl className="mt-3 divide-y divide-border">
                    {def.configFields.map((f) => {
                      const v = node.config[f.key] ?? f.defaultValue;
                      const changed = v !== f.defaultValue;
                      return (
                        <div key={f.key} className={`flex items-center justify-between gap-4 py-2 ${changed ? "-mx-2 rounded-lg bg-accent-soft px-2" : ""}`}>
                          <dt className={`text-[13px] ${changed ? "font-semibold text-accent" : "text-text-secondary"}`}>{f.label}</dt>
                          <dd className={`figures text-right text-[13px] font-semibold ${changed ? "text-accent" : "text-text-primary"}`}>
                            {v === "" || v === undefined || v === null ? "not set" : typeof v === "number" ? v.toLocaleString() : String(v)}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-text-muted">No configurable fields.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReadingRow({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="group flex items-start gap-3 rounded-xl p-3 transition-colors duration-fast hover:bg-surface-hover">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
        <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[13px] font-semibold text-text-primary">
          {title}
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-muted transition-all duration-fast group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-text-muted">{description}</span>
      </span>
    </Link>
  );
}

export function ReadingLinks({ problem }: { problem: Problem }) {
  if (!problem.readingMaterials.length) return null;
  return (
    <section>
      <h2 className={SECTION_LABEL}>Recommended reading</h2>
      <div className="mt-2.5 space-y-0.5 rounded-xl border border-border bg-surface/60 p-1">
        {problem.readingMaterials.map((r) => (
          <ReadingRow key={r.href} href={r.href} title={r.title} description={r.description} />
        ))}
        {problem.concepts.slice(0, 2).map((c) => (
          <ReadingRow key={c} href={problem.readingMaterials[0].href.split("#")[0]} title={c} description="Related topic in this learning path." />
        ))}
      </div>
    </section>
  );
}

export function RequirementsList({ problem, live }: { problem: Problem; live: boolean[] | null }) {
  const met = live ? live.filter(Boolean).length : 0;
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className={SECTION_LABEL}>Requirements</h2>
        {live && (
          <span className={`${badge(met === problem.requirements.length ? "success" : "neutral")} figures`}>
            {met}/{problem.requirements.length} met
          </span>
        )}
      </div>
      <GradingBadge problem={problem} className="mt-2.5" />
      {live && <p className="mt-2 text-xs text-text-muted">Checked live against the current design.</p>}
      <ul className="mt-3 space-y-2">
        {problem.requirements.map((r, i) => {
          const ok = live?.[i] ?? false;
          return (
            <li
              key={r}
              className={`flex gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] leading-5 transition-colors duration-normal ${
                ok ? "border-success/30 bg-success/[0.07] text-text-primary" : "border-border bg-surface/60 text-text-secondary"
              }`}
            >
              {live ? (
                ok ? (
                  <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="mt-px h-4 w-4 shrink-0 text-text-muted/50" aria-hidden="true" />
                )
              ) : (
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              )}
              <span>{r}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
