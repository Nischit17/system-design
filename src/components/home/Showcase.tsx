"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Compass,
  Database,
  Info,
  LayoutGrid,
  Lightbulb,
  Maximize2,
  Minus,
  Network,
  PanelLeftClose,
  Plus,
  RotateCcw,
  Send,
  Server,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_STYLES, HEX_CLIP, shapeRadius, type Category } from "@/lib/catalog/components";
import { LogoMark } from "@/components/site/Logo";
import { badge, ui } from "@/components/ui/styles";

/** Renders children at a fixed design size and scales them to the container width. */
export function ScaledFrame({ width, height, children, className = "" }: { width: number; height: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / width));
    ro.observe(el);
    setScale(el.clientWidth / width);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: `${width} / ${height}` }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* shared mock pieces: mirror the real workspace (Workspace.tsx)         */
/* ------------------------------------------------------------------ */

interface MockNode {
  id: string;
  label: string;
  category: Category;
  icon: LucideIcon;
  x: number;
  y: number;
  footer?: { left: string; right?: string; bar?: { label: string; value: string; pct: number } };
}

const NODE_W = 208;
const NODE_H = 68;

function MockNodeView({ node, visible = true }: { node: MockNode; visible?: boolean }) {
  const st = CATEGORY_STYLES[node.category];
  const Icon = node.icon;
  return (
    <div
      className="absolute transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H, opacity: visible ? 1 : 0, transform: visible ? "none" : "scale(0.9)" }}
    >
      <div
        className={`relative flex h-full w-full items-center gap-2.5 overflow-hidden border bg-surface-raised pl-2.5 pr-1.5 ${node.footer ? "rounded-t-xl" : "rounded-xl"} ${st.border}`}
        style={{ boxShadow: "0 10px 24px -14px rgba(0, 0, 0, 0.75)" }}
      >
        <span className={`absolute inset-0 ${st.tint} opacity-70`} />
        <span
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center ${shapeRadius(st.shape)} ${st.chip}`}
          style={{ clipPath: st.shape === "hex" ? HEX_CLIP : undefined }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className={`block truncate text-[9px] font-bold uppercase tracking-[0.12em] ${st.text}`}>{node.category}</span>
          <span className="block truncate text-xs font-semibold text-text-primary">{node.label}</span>
        </span>
        <span className="relative flex h-6 w-6 items-center justify-center text-text-muted">
          <Info className="h-3.5 w-3.5" />
        </span>
        <span className="relative flex h-6 w-6 items-center justify-center text-text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </span>
      </div>
      {node.footer && (
        <div className={`absolute left-0 top-full -mt-px w-full overflow-hidden rounded-b-xl border bg-surface-raised ${st.border}`}>
          <span className={`absolute inset-0 ${st.tint} opacity-60`} />
          <div className={`figures relative grid h-4 grid-cols-[1fr_auto_1fr] items-center border-b border-border px-2.5 text-[9px] font-bold ${st.text}`}>
            <span>{node.footer.left}</span>
            {node.footer.right && <span className="col-start-3 justify-self-end">{node.footer.right}</span>}
          </div>
          {node.footer.bar && (
            <div className="relative h-4 overflow-hidden bg-success/10">
              <div className="absolute inset-y-0 left-0 bg-success/25 transition-[width] duration-700" style={{ width: `${node.footer.bar.pct}%` }} />
              <div className="figures relative grid h-full grid-cols-[1fr_auto_1fr] items-center text-[9px] font-bold text-success">
                <span className="pl-2.5">{node.footer.bar.label}:</span>
                <span className="col-start-2">{node.footer.bar.value}</span>
              </div>
            </div>
          )}
        </div>
      )}
      <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-border-strong bg-surface-raised" />
      <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-background-elevated bg-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)]" />
    </div>
  );
}

function edgePath(a: MockNode, b: MockNode) {
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const k = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`;
}

const btnSm = (cls: string) => `${cls} ${ui.btnSm} pointer-events-none`;

function MockChrome({ tab, children, cost, footerRight }: { tab: "canvas" | "results"; children: ReactNode; cost: number; footerRight: ReactNode }) {
  const over = cost > 2100;
  return (
    <div className="flex h-full w-full flex-col bg-background text-text-primary">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center">
            <LogoMark className="h-5 w-5" />
          </span>
          <span className={btnSm(ui.btnGhost)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Track
          </span>
          <span className="h-5 w-px bg-border" />
          <span className={`${badge("accent")} figures`}>SSA0001</span>
          <span className="text-[15px] font-semibold">Flash Sale Sizing</span>
          <span className={badge("warning")}>Medium</span>
        </div>
        <div className="flex items-center gap-2">
          {tab === "results" && (
            <span className={`${badge("success")} figures`}>
              <Trophy className="h-3 w-3" /> Best 96/100
            </span>
          )}
          <span className={`${ui.iconBtn} pointer-events-none`}>
            <Info className="h-4 w-4" />
          </span>
          <span className={btnSm(ui.btnSecondary)}>
            <Compass className="h-3.5 w-3.5" /> Canvas guide
          </span>
          <span className={btnSm(ui.btnSecondary)}>
            <PanelLeftClose className="h-3.5 w-3.5" /> Hide panel
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[310px] shrink-0 flex-col border-r border-border bg-background-elevated">
          <div className="border-b border-border p-2.5">
            <div className={`${ui.segment} flex w-full`}>
              {["Problem", "Requirements", "Hint", "Reference"].map((t, i) => (
                <span key={t} className={`${ui.segmentItem(i === (tab === "results" ? 1 : 0))} flex-1 justify-center !px-1.5`}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-5 p-4">
            {tab === "canvas" ? (
              <>
                <div>
                  <div className={ui.label}>Problem</div>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    A two-hour flash sale is forecast at 1,800 RPS with bursts to 2,200. Build the application tier between the internet and the existing PostgreSQL database.
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <div className={ui.label}>Required components</div>
                    <span className={`${badge("accent")} figures`}>3</span>
                  </div>
                  <div className="mt-2.5 space-y-1 rounded-2xl border border-accent/30 bg-accent-soft/40 p-1.5">
                    {(
                      [
                        ["Load Balancer", "networking", Network],
                        ["Application Server", "compute", Server],
                        ["PostgreSQL", "database", Database],
                      ] as const
                    ).map(([label, cat, Icon]) => (
                      <div key={label} className="flex items-center gap-2.5 rounded-xl bg-surface/80 px-2.5 py-2">
                        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${CATEGORY_STYLES[cat].chip}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="flex-1 text-[13px] font-semibold text-text-primary">{label}</span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted">
                          <Plus className="h-4 w-4" />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <div className={ui.label}>Requirements</div>
                  <span className={`${badge("success")} figures`}>6/6 met</span>
                </div>
                <ul className="mt-3 space-y-2">
                  {[
                    "Provide at least 1,800 RPS of capacity for sustained traffic.",
                    "Keep every server at or below 75% CPU.",
                    "Provide at least 2,200 RPS for bursts.",
                    "Use a load balancer as the entry point.",
                    "Connect every server to PostgreSQL.",
                    "Stay at or below $2,100/month.",
                  ].map((r) => (
                    <li key={r} className="flex gap-2.5 rounded-xl border border-success/30 bg-success/[0.07] px-3 py-2 text-[13px] leading-5 text-text-primary">
                      <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-success" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-4 pt-3">
            <div className={ui.segment}>
              {(
                [
                  ["Canvas", LayoutGrid, "canvas"],
                  ["Results", CheckCircle2, "results"],
                  ["Solution", Lightbulb, "solution"],
                ] as const
              ).map(([label, Icon, key]) => (
                <span key={label} className={ui.segmentItem(key === tab)}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </span>
              ))}
            </div>
            <span className="inline-flex items-center gap-2 text-xs text-text-muted">
              <span className="figures">5 components · 6 connections</span>
              <span className="status-dot" />
              Saved in this browser
            </span>
          </div>
          <div className="relative min-h-0 flex-1">{children}</div>
        </div>
      </div>
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-t border-border bg-background/85 px-4">
        <span className={btnSm(ui.btnGhost)}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset design
        </span>
        <div className={`flex w-full max-w-md items-center gap-3 rounded-full border px-4 py-1.5 ${over ? "border-danger/40 bg-danger/10" : "border-border bg-surface/80"}`}>
          <span className={ui.statLabel}>Cost</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-active">
            <div className={`h-full rounded-full transition-[width] duration-500 ${cost / 2100 >= 0.85 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.min((cost / 2100) * 100, 100)}%` }} />
          </div>
          <span className={`figures text-xs font-semibold ${over ? "text-danger" : "text-text-primary"}`}>
            ${cost.toLocaleString()} <span className="font-medium text-text-muted">/ $2,100</span>
          </span>
        </div>
        {footerRight}
      </div>
    </div>
  );
}

const SUBMIT = (
  <span className={`${ui.btnPrimary} pointer-events-none`}>
    <Send className="h-4 w-4" /> Submit design
  </span>
);

const BACK_AND_SUBMIT = (
  <div className="flex items-center gap-2">
    <span className={btnSm(ui.btnSecondary)}>Back to canvas</span>
    {SUBMIT}
  </div>
);

const BASE_NODES: MockNode[] = [
  { id: "lb", label: "Load Balancer", category: "networking", icon: Network, x: 70, y: 190, footer: { left: "BACKENDS: 2,400 RPS", right: "MAX: 10,000" } },
  { id: "a1", label: "Application Server", category: "compute", icon: Server, x: 380, y: 50, footer: { left: "RPS: 800", right: "RAM: 32 GB", bar: { label: "CPU", value: "75%", pct: 75 } } },
  { id: "a2", label: "Application Server", category: "compute", icon: Server, x: 380, y: 190, footer: { left: "RPS: 800", right: "RAM: 32 GB", bar: { label: "CPU", value: "75%", pct: 75 } } },
  { id: "a3", label: "Application Server", category: "compute", icon: Server, x: 380, y: 330, footer: { left: "RPS: 800", right: "RAM: 32 GB", bar: { label: "CPU", value: "75%", pct: 75 } } },
  { id: "db", label: "PostgreSQL", category: "database", icon: Database, x: 690, y: 190, footer: { left: "READS: 6,000/s", right: "WRITES: 2,500/s" } },
];
const BASE_EDGES: [string, string][] = [
  ["lb", "a1"],
  ["lb", "a2"],
  ["lb", "a3"],
  ["a1", "db"],
  ["a2", "db"],
  ["a3", "db"],
];

function MockCanvas({ visibleNodes, visibleEdges }: { visibleNodes: number; visibleEdges: number }) {
  const nodes = BASE_NODES;
  return (
    <div className="absolute inset-4 overflow-hidden rounded-2xl border border-border bg-background-elevated">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 720px 420px at 0% 0%, color-mix(in srgb, var(--accent-strong) 11%, transparent), transparent 70%), radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--text-primary) 16%, transparent) 1px, transparent 0) 0 0 / 24px 24px",
        }}
      />
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <marker id="mock-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="color-mix(in srgb, var(--accent) 35%, var(--text-muted))" />
          </marker>
        </defs>
        {BASE_EDGES.map(([a, b], i) => {
          const d = edgePath(nodes.find((n) => n.id === a)!, nodes.find((n) => n.id === b)!);
          const on = i < visibleEdges;
          return (
            <g key={`${a}-${b}`} style={{ opacity: on ? 1 : 0, transition: "opacity 400ms" }}>
              <path
                d={d}
                fill="none"
                stroke="color-mix(in srgb, var(--accent) 35%, var(--text-muted))"
                strokeWidth={1.75}
                markerEnd="url(#mock-arrow)"
                pathLength={1}
                strokeDasharray="1 1"
                style={{ strokeDashoffset: on ? 0 : 1, transition: "stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)" }}
              />
              {on && <path d={d} fill="none" stroke="var(--mint)" strokeWidth={2} strokeLinecap="round" className="edge-flow" />}
            </g>
          );
        })}
      </svg>
      {nodes.map((n, i) => (
        <MockNodeView key={n.id} node={n} visible={i < visibleNodes} />
      ))}
      <div className="glass-panel absolute bottom-3 right-3 flex items-center gap-0.5 rounded-xl p-1 text-text-muted">
        <Minus className="m-1.5 h-4 w-4" />
        <span className="figures w-10 text-center text-[11px]">100%</span>
        <Plus className="m-1.5 h-4 w-4" />
        <Maximize2 className="m-1.5 h-4 w-4" />
        <Trash2 className="m-1.5 h-4 w-4 opacity-40" />
      </div>
    </div>
  );
}

const SCORE_ROWS = [
  { label: "Capacity", msg: "Traffic is served within every server's capacity at 1,800 RPS.", score: "45/45", ok: true },
  { label: "Resource Utilization", msg: "Average application CPU 75% under sustained load, inside the healthy band.", score: "10/10", ok: true },
  { label: "Architecture Quality", msg: "Traffic is distributed across 3 healthy application server node(s).", score: "20/20", ok: true },
  { label: "Cost Efficiency", msg: "Monthly cost $2,040 is within the $2,100 budget.", score: "15/15", ok: true },
  { label: "Architecture Validity", msg: "Every serving application server has a path to PostgreSQL.", score: "10/15", ok: false },
];

const RING_C = 2 * Math.PI * 52;

function MockResults({ shownRows, score }: { shownRows: number; score: number }) {
  const passed = score >= 90;
  return (
    <div className="absolute inset-0 overflow-hidden p-6">
      <div className="mx-auto w-full max-w-[640px] space-y-4">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface/80 p-6">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full blur-3xl" style={{ background: "color-mix(in srgb, var(--success) 16%, transparent)" }} />
          <div className="relative flex items-center gap-6">
            <div className="relative h-32 w-32 shrink-0">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-active)" strokeWidth="9" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="var(--success)"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - score / 100)}
                  style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.16,1,0.3,1)" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="figures text-4xl font-bold leading-none">{score}</span>
                <span className="figures mt-1 text-[11px] font-medium text-text-muted">of 100</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className={ui.eyebrow}>Architecture score</p>
              <h3 className={`mt-2 text-2xl font-bold ${passed ? "text-success" : "text-text-muted"}`}>{passed ? "Problem passed" : "Evaluating…"}</h3>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-semibold">Monthly cost</span>
                <span className="figures text-sm font-semibold">
                  $2,040 <span className="font-medium text-text-muted">/ $2,100 budget</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className={`${ui.card} overflow-hidden`}>
          <div className={ui.cardHeader}>Architecture score</div>
          <ul className="divide-y divide-border">
            {SCORE_ROWS.map((r, i) => (
              <li
                key={r.label}
                className="flex items-start gap-3 px-5 py-3 transition-all duration-500"
                style={{ opacity: i < shownRows ? 1 : 0, transform: i < shownRows ? "none" : "translateY(6px)" }}
              >
                {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{r.label}</div>
                  <p className="mt-0.5 text-sm leading-6 text-text-secondary">{r.msg}</p>
                </div>
                <span className={`figures shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.ok ? "bg-success/12 text-success" : "bg-surface-active text-text-muted"}`}>{r.score}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* exported showcases                                                   */
/* ------------------------------------------------------------------ */

export function CanvasShowcase() {
  return (
    <ScaledFrame width={1280} height={800}>
      <MockChrome tab="canvas" cost={2040} footerRight={SUBMIT}>
        <MockCanvas visibleNodes={5} visibleEdges={6} />
      </MockChrome>
    </ScaledFrame>
  );
}

export function ResultsShowcase() {
  return (
    <ScaledFrame width={1280} height={800}>
      <MockChrome
        tab="results"
        cost={2040}
        footerRight={BACK_AND_SUBMIT}
      >
        <MockResults shownRows={5} score={96} />
      </MockChrome>
    </ScaledFrame>
  );
}

function useLoop(steps: number, intervalMs: number, active: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setStep((s) => (s + 1) % steps), intervalMs);
    return () => clearInterval(t);
  }, [steps, intervalMs, active]);
  return step;
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView] as const;
}

/** Looping "build" walkthrough: components drop in, edges connect, cost settles under budget. */
export function BuildDemo({ label }: { label: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const step = useLoop(16, 650, inView);
  const nodes = Math.min(5, step);
  const edges = Math.max(0, Math.min(6, step - 5));
  const cost = [0, 180, 800, 1420, 2040, 2040][nodes] ?? 2040;
  return (
    <div ref={ref} aria-label={label} role="img" className="h-full w-full">
      <ScaledFrame width={1280} height={720}>
        <MockChrome tab="canvas" cost={cost} footerRight={SUBMIT}>
          <MockCanvas visibleNodes={nodes} visibleEdges={edges} />
        </MockChrome>
      </ScaledFrame>
    </div>
  );
}

/** Looping "evaluate" walkthrough: submit, score counts up, findings appear. */
export function EvaluateDemo({ label }: { label: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const step = useLoop(12, 600, inView);
  const score = step < 2 ? 0 : Math.min(96, Math.round(((step - 1) / 4) * 96));
  const rows = Math.max(0, step - 3);
  return (
    <div ref={ref} aria-label={label} role="img" className="h-full w-full">
      <ScaledFrame width={1280} height={720}>
        <MockChrome
          tab="results"
          cost={2040}
          footerRight={BACK_AND_SUBMIT}
        >
          <MockResults shownRows={rows} score={score} />
        </MockChrome>
      </ScaledFrame>
    </div>
  );
}
