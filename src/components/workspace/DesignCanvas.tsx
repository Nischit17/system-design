"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, Lock, Maximize2, Minus, MousePointerClick, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { CATEGORY_STYLES, HEX_CLIP, computeNodeDisplayNames, getComponent, shapeRadius, type CategoryStyle } from "@/lib/catalog/components";
import type { SimSpec } from "@/lib/content/types";
import { NODE_HEIGHT, NODE_WIDTH, type Graph } from "@/lib/sim/graph";
import { footerContext, footerFor, type Footer } from "./node-footers";

export type Selection = { kind: "node" | "edge"; id: string } | null;

const MIN_SCALE = 0.4;
const MAX_SCALE = 1.75;

function curve(x1: number, y1: number, x2: number, y2: number) {
  const k = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`;
}

function FooterView({ footer, style }: { footer: Footer; style: CategoryStyle }) {
  if (footer.kind === "meter") {
    return (
      <div
        className={`pointer-events-none absolute left-0 top-full z-10 -mt-px h-6 w-full overflow-hidden rounded-b-xl border transition-colors duration-fast ${
          footer.ok ? "border-success/40 bg-surface-raised" : "border-danger/50 bg-surface-raised shadow-[0_0_16px_-2px_color-mix(in_srgb,var(--danger)_60%,transparent)]"
        }`}
      >
        <div aria-hidden="true" className={`absolute inset-y-0 left-0 transition-[width] duration-slow ease-spring-interactive ${footer.ok ? "bg-success/20" : "bg-danger/30"}`} style={{ width: `${footer.fillPercent}%` }} />
        <div className={`figures relative grid h-full grid-cols-[1fr_auto_1fr] items-center whitespace-nowrap px-2.5 text-[10px] font-bold ${footer.ok ? "text-success" : "text-danger"}`}>
          <span className="justify-self-start">{footer.label}:</span>
          <span className="col-start-2">{footer.value}</span>
        </div>
      </div>
    );
  }
  const neutral = footer.surface === "neutral";
  return (
    <div className={`pointer-events-none absolute left-0 top-full z-10 -mt-px w-full overflow-hidden rounded-b-xl border bg-surface-raised ${style.border}`}>
      {!neutral && <span aria-hidden="true" className={`absolute inset-0 ${style.tint} opacity-60`} />}
      {footer.lines.map((line, i) => {
        const divider = i < footer.lines.length - 1 || !!footer.bar;
        const color = line.muted ? "text-text-muted" : style.text;
        return neutral ? (
          <div key={i} className={`figures relative grid h-4 grid-cols-2 items-center ${divider ? "border-b border-border " : ""}px-2.5 text-[9px] font-bold ${color}`}>
            <span className="justify-self-start truncate">{line.left}</span>
            {line.right !== undefined && <span className="justify-self-end truncate">{line.right}</span>}
          </div>
        ) : (
          <div key={i} className={`figures relative grid h-4 grid-cols-[1fr_auto_1fr] items-center ${divider ? "border-b border-border " : ""}px-2.5 text-[9px] font-bold ${color}`}>
            <span className="justify-self-start whitespace-nowrap">{line.left}</span>
            {line.right !== undefined && <span className="col-start-3 justify-self-end whitespace-nowrap">{line.right}</span>}
          </div>
        );
      })}
      {footer.bar && (
        <div className={`relative h-4 overflow-hidden ${footer.bar.ok ? "bg-success/10" : "bg-danger/10"}`}>
          <div aria-hidden="true" className={`absolute inset-y-0 left-0 transition-[width] duration-slow ease-spring-interactive ${footer.bar.ok ? "bg-success/25" : "bg-danger/35"}`} style={{ width: `${footer.bar.fillPercent}%` }} />
          <div className={`figures relative grid h-full grid-cols-[1fr_auto_1fr] items-center text-[9px] font-bold ${footer.bar.ok ? "text-success" : "text-danger"}`}>
            <span className="justify-self-start pl-2.5">{footer.bar.label}:</span>
            <span className="col-start-2 whitespace-nowrap">{footer.bar.value}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export interface DesignCanvasProps {
  graph: Graph;
  selection: Selection;
  onSelectionChange: (s: Selection) => void;
  onOpenConfiguration: (nodeId: string) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onConnect: (source: string, target: string) => void;
  onDropComponent: (type: string, x: number, y: number) => void;
  onDeleteSelection: () => void;
  sim?: SimSpec;
  readOnly?: boolean;
  /** Initial viewport, e.g. to fit a reference design. */
  initialView?: { x: number; y: number; scale: number };
}

export function DesignCanvas({
  graph,
  selection,
  onSelectionChange,
  onOpenConfiguration,
  onMoveNode,
  onConnect,
  onDropComponent,
  onDeleteSelection,
  sim,
  readOnly = false,
  initialView,
}: DesignCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(initialView ?? { x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const grabOffset = useRef({ x: 0, y: 0 });
  const panStart = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const r = surfaceRef.current?.getBoundingClientRect();
      return r ? { x: (clientX - r.left - view.x) / view.scale, y: (clientY - r.top - view.y) / view.scale } : { x: 0, y: 0 };
    },
    [view],
  );

  const endGesture = () => {
    setDragging(null);
    setPanning(false);
    panStart.current = null;
  };

  // wheel zoom around the cursor
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * (e.deltaY < 0 ? 1.08 : 0.92)));
        const k = scale / v.scale;
        return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // keyboard: delete selection, escape to clear
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        const locked = selection.kind === "node" && graph.nodes.find((n) => n.id === selection.id)?.locked;
        if (!locked) {
          e.preventDefault();
          onDeleteSelection();
        }
      }
      if (e.key === "Escape") {
        setConnecting(null);
        onSelectionChange(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection, onDeleteSelection, onSelectionChange, readOnly, graph.nodes]);

  const names = useMemo(() => computeNodeDisplayNames(graph.nodes), [graph.nodes]);
  const footers = useMemo(() => {
    const ctx = footerContext(graph, sim);
    return new Map(graph.nodes.map((n) => [n.id, footerFor(n, ctx)]));
  }, [graph, sim]);

  const connectingFrom = connecting ? graph.nodes.find((n) => n.id === connecting) : null;
  const selectedNode = selection?.kind === "node" ? graph.nodes.find((n) => n.id === selection.id) : null;

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-2xl border border-border bg-background-elevated shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 720px 420px at 0% 0%, color-mix(in srgb, var(--accent-strong) 11%, transparent), transparent 70%), radial-gradient(ellipse 560px 420px at 100% 100%, color-mix(in srgb, var(--mint) 5%, transparent), transparent 70%)",
        }}
      />
      <div
        ref={surfaceRef}
        className={`absolute inset-0 touch-none ${panning ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          onSelectionChange(null);
          setConnecting(null);
          setInfoFor(null);
          setPanning(true);
          panStart.current = { x: e.clientX, y: e.clientY, viewX: view.x, viewY: view.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (connecting) setCursor(toWorld(e.clientX, e.clientY));
          if (dragging) {
            const p = toWorld(e.clientX, e.clientY);
            onMoveNode(dragging, Math.round(p.x - grabOffset.current.x), Math.round(p.y - grabOffset.current.y));
            return;
          }
          const start = panStart.current;
          if (start) setView((v) => ({ ...v, x: start.viewX + (e.clientX - start.x), y: start.viewY + (e.clientY - start.y) }));
        }}
        onPointerUp={(e) => {
          endGesture();
          if (connecting) {
            const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-node-id]");
            const target = hit?.dataset.nodeId;
            if (target && target !== connecting) onConnect(connecting, target);
            setConnecting(null);
          }
        }}
        onPointerLeave={endGesture}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          if (readOnly) return;
          e.preventDefault();
          const type = e.dataTransfer.getData("application/x-sd-component");
          if (!type) return;
          const p = toWorld(e.clientX, e.clientY);
          onDropComponent(type, Math.round(p.x - NODE_WIDTH / 2), Math.round(p.y - NODE_HEIGHT / 2));
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--text-primary) 16%, transparent) 1px, transparent 0)",
            backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
        />
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
            <defs>
              <marker id="sd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="color-mix(in srgb, var(--accent) 35%, var(--text-muted))" />
              </marker>
              <marker id="sd-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
              </marker>
            </defs>
            {graph.edges.map((edge) => {
              const s = graph.nodes.find((n) => n.id === edge.source);
              const t = graph.nodes.find((n) => n.id === edge.target);
              if (!s || !t) return null;
              const active = selection?.kind === "edge" && selection.id === edge.id;
              const d = curve(s.x + NODE_WIDTH, s.y + NODE_HEIGHT / 2, t.x, t.y + NODE_HEIGHT / 2);
              return (
                <g key={edge.id} className="pointer-events-auto">
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    className={readOnly ? "" : "cursor-pointer"}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (!readOnly) onSelectionChange({ kind: "edge", id: edge.id });
                    }}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={active ? "var(--accent)" : "color-mix(in srgb, var(--accent) 35%, var(--text-muted))"}
                    strokeWidth={active ? 2.5 : 1.75}
                    markerEnd={`url(#${active ? "sd-arrow-active" : "sd-arrow"})`}
                    className="pointer-events-none transition-[stroke] duration-fast"
                  />
                  <path d={d} fill="none" stroke="var(--mint)" strokeWidth={2} strokeLinecap="round" className="edge-flow pointer-events-none" />
                </g>
              );
            })}
            {connectingFrom && cursor && (
              <path
                d={curve(connectingFrom.x + NODE_WIDTH, connectingFrom.y + NODE_HEIGHT / 2, cursor.x, cursor.y)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeDasharray="5 4"
                markerEnd="url(#sd-arrow-active)"
              />
            )}
          </svg>

          {graph.nodes.map((node, index) => {
            const def = getComponent(node.type);
            if (!def) return null;
            const Icon = def.icon;
            const st = CATEGORY_STYLES[def.category];
            const selected = selection?.kind === "node" && selection.id === node.id;
            const linking = connecting === node.id;
            const footer = footers.get(node.id) ?? null;
            return (
              <div
                key={node.id}
                data-node-id={node.id}
                className="absolute"
                style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT, zIndex: selected || infoFor === node.id ? 20 : undefined }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`${def.label} ${names.get(node.id) ?? ""}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onOpenConfiguration(node.id);
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    onSelectionChange({ kind: "node", id: node.id });
                    if (readOnly) return;
                    const p = toWorld(e.clientX, e.clientY);
                    grabOffset.current = { x: p.x - node.x, y: p.y - node.y };
                    setDragging(node.id);
                  }}
                  onDoubleClick={() => onOpenConfiguration(node.id)}
                  className={`relative flex h-full w-full items-center gap-2.5 overflow-hidden border bg-surface-raised pl-2.5 pr-1.5 text-left outline-none transition-[box-shadow,filter] duration-fast focus-visible:ring-2 focus-visible:ring-accent ${
                    readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                  } ${footer ? "rounded-t-xl" : "rounded-xl"} ${st.border} ${selected || linking ? `ring-2 ${st.ring}` : "hover:brightness-110"}`}
                  style={{ boxShadow: selected || linking ? "0 16px 36px -14px rgba(0, 0, 0, 0.85)" : "0 10px 24px -14px rgba(0, 0, 0, 0.75)" }}
                >
                  <span className={`pointer-events-none absolute inset-0 ${st.tint} opacity-70`} aria-hidden="true" />
                  <span
                    className={`relative flex h-8 w-8 shrink-0 items-center justify-center ${shapeRadius(st.shape)} ${st.chip}`}
                    style={{ clipPath: st.shape === "hex" ? HEX_CLIP : undefined }}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="relative min-w-0 flex-1">
                    <span className={`flex items-center gap-1 truncate text-[9px] font-bold uppercase tracking-[0.12em] ${st.text}`}>
                      {def.category}
                      {node.locked && <Lock className="h-2.5 w-2.5 shrink-0" aria-label="Locked" />}
                    </span>
                    <span className="block truncate text-xs font-semibold text-text-primary">{def.label}</span>
                    <span className="mt-0.5 block w-fit max-w-full truncate rounded-md bg-black/30 px-1.5 py-px figures text-[9px] font-semibold text-text-secondary">
                      {names.get(node.id)}
                    </span>
                  </span>
                  <div className="relative flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      title="Info"
                      aria-label={`About ${def.label}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setInfoFor((cur) => (cur === node.id ? null : node.id));
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-fast hover:bg-black/25 hover:text-text-primary"
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Details"
                      aria-label={`Open details for ${def.label}`}
                      data-tour={index === 0 && !readOnly ? "component-configuration" : undefined}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setInfoFor(null);
                        onOpenConfiguration(node.id);
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-fast hover:bg-black/25 hover:text-text-primary"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {footer && <FooterView footer={footer} style={st} />}
                {infoFor === node.id && (
                  <div
                    role="tooltip"
                    className="absolute left-0 top-[calc(100%+6px)] z-30 w-60 rounded-xl border border-border-strong bg-surface-raised p-3.5 text-left motion-safe:animate-[roadmap-pop-in_200ms_var(--ease-spring-interactive)_both]"
                    style={{ boxShadow: "0 20px 44px -16px rgba(0, 0, 0, 0.8)", marginTop: footer ? 36 : 0 }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className={`text-[10px] font-bold uppercase tracking-[0.12em] ${st.text}`}>{def.category}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                      {def.label}
                      <span className="rounded-md bg-background-elevated px-1.5 py-px figures text-[10px] font-semibold text-text-muted">{names.get(node.id)}</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-text-secondary">{def.blurb}</p>
                  </div>
                )}
                {!readOnly && (
                  <>
                    <span
                      title="Incoming connections"
                      className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-border-strong bg-surface-raised"
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      title="Drag to connect"
                      aria-label={`Connect from ${def.label}`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setConnecting(node.id);
                        setCursor(toWorld(e.clientX, e.clientY));
                      }}
                      className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background-elevated bg-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)] transition-transform duration-fast hover:scale-150"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
        {graph.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="glass-panel max-w-sm rounded-2xl px-6 py-5 text-center motion-safe:animate-[result-reveal_420ms_var(--ease-spring-interactive)_both]">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <MousePointerClick className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-semibold text-text-primary">Your canvas is empty</p>
              <p className="mt-1 text-[13px] leading-6 text-text-muted">
                Add components from the panel, then drag from a component&apos;s right handle to connect it to another.
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="glass-panel absolute bottom-3 right-3 flex items-center gap-0.5 rounded-xl p-1">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setView((v) => ({ ...v, scale: Math.max(MIN_SCALE, v.scale - 0.15) }))}
          className="rounded-lg p-1.5 text-text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="w-10 text-center figures text-[11px] text-text-muted">{Math.round(view.scale * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, v.scale + 0.15) }))}
          className="rounded-lg p-1.5 text-text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Reset view"
          onClick={() => setView(initialView ?? { x: 0, y: 0, scale: 1 })}
          className="rounded-lg p-1.5 text-text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary"
        >
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </button>
        {!readOnly && (
          <button
            type="button"
            aria-label="Delete selection"
            disabled={!selection || !!selectedNode?.locked}
            onClick={onDeleteSelection}
            className="rounded-lg p-1.5 text-text-muted transition-colors duration-fast hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
