"use client";

import { useState } from "react";
import { Copy, Lock, Trash2, X } from "lucide-react";
import { CATEGORY_STYLES, computeNodeDisplayNames, getComponent, type ConfigValue } from "@/lib/catalog/components";
import type { Graph, GraphNode } from "@/lib/sim/graph";
import { SIZE_TABLE } from "@/lib/sim/tables";
import * as E from "@/lib/sim/engine";
import { ui } from "@/components/ui/styles";

const FIELD = `${ui.input} mt-1.5 !py-2 disabled:cursor-not-allowed disabled:opacity-50`;

function NumberField({ node, fieldKey, defaultValue, min, max, locked, onChange }: { node: GraphNode; fieldKey: string; defaultValue: number; min?: number; max?: number; locked: boolean; onChange: (id: string, key: string, v: ConfigValue) => void }) {
  const current = node.config[fieldKey] ?? defaultValue;
  const [draft, setDraft] = useState(String(current));
  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      disabled={locked}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = Number(raw);
        if (raw.trim() !== "" && Number.isFinite(n)) onChange(node.id, fieldKey, max !== undefined ? Math.min(max, min !== undefined ? Math.max(min, n) : n) : n);
      }}
      onBlur={() => {
        const n = Number(draft);
        if (draft.trim() === "" || !Number.isFinite(n)) setDraft(String(current));
      }}
      className={`${FIELD} figures`}
    />
  );
}

export function Inspector({
  node,
  graph,
  onChangeConfig,
  onDuplicate,
  onDelete,
  onClose,
}: {
  node: GraphNode;
  graph: Graph;
  onChangeConfig: (id: string, key: string, value: ConfigValue) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const def = getComponent(node.type);
  if (!def) return null;
  const Icon = def.icon;
  const st = CATEGORY_STYLES[def.category];
  const locked = !!node.locked;
  const names = computeNodeDisplayNames(graph.nodes);
  return (
    <aside className="relative flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface-raised/95 backdrop-blur-xl">
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[2px] ${st.bar}`} />
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${st.chip}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-text-primary">
              {def.label}
              {locked && <Lock className="h-3 w-3 shrink-0 text-text-muted" aria-label="Locked" />}
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className={`font-semibold capitalize ${st.text}`}>{def.category}</span>
              <span className="text-text-muted">·</span>
              <span className="figures text-text-muted">{names.get(node.id)}</span>
            </div>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close properties" className={`${ui.iconBtn} !h-8 !w-8`}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div data-lenis-prevent className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-4 px-4 py-4">
          {def.configFields.length === 0 && <p className="text-sm text-text-muted">No configurable fields.</p>}
          {def.configFields.map((f) => {
            const value = node.config[f.key] ?? f.defaultValue;
            const sizeAware = (node.type === "application-server" || node.type === "model-server") && f.key === "size";
            return (
              <label key={f.key} className="block">
                <span className="block text-xs font-semibold text-text-secondary">{f.label}</span>
                {f.type === "readonly" && <span className="mt-1.5 block text-sm text-text-primary">{String(value)}</span>}
                {f.type === "select" && (
                  <>
                    <select value={String(value)} disabled={locked} onChange={(e) => onChangeConfig(node.id, f.key, e.target.value)} className={FIELD}>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {sizeAware && SIZE_TABLE[o] ? `${o}: $${SIZE_TABLE[o].monthlyCostUsd}/mo` : o}
                        </option>
                      ))}
                    </select>
                    {sizeAware && (
                      <span className="figures mt-1.5 block text-[11px] font-medium text-text-secondary">
                        {E.serverCapacityRps(node).toLocaleString()} RPS capacity · {E.serverMemoryGb(node).toLocaleString()} GB RAM · ${E.nodeCostUsd(node).toLocaleString()}/mo
                      </span>
                    )}
                  </>
                )}
                {f.type === "number" && (
                  <NumberField key={`${node.id}:${f.key}`} node={node} fieldKey={f.key} defaultValue={f.defaultValue} min={f.min} max={f.max} locked={locked} onChange={onChangeConfig} />
                )}
                {f.type === "text" && f.key === "replicatesFrom" && (
                  <select value={String(value)} disabled={locked} onChange={(e) => onChangeConfig(node.id, f.key, e.target.value)} className={FIELD}>
                    {(() => {
                      const others = graph.nodes.filter((n) => n.type === node.type && n.id !== node.id);
                      return [
                        <option key="" value="">
                          {others.length === 0 ? "No other database on canvas yet" : "Select a node…"}
                        </option>,
                        ...others.map((o) => (
                          <option key={o.id} value={o.id}>
                            {names.get(o.id)} · {String(o.config.role ?? "Standalone")}
                          </option>
                        )),
                      ];
                    })()}
                  </select>
                )}
                {f.type === "text" && f.key !== "replicatesFrom" && (
                  <input type="text" value={String(value)} disabled={locked} onChange={(e) => onChangeConfig(node.id, f.key, e.target.value)} className={FIELD} />
                )}
                {f.hint && <span className="mt-1.5 block text-[11px] leading-4 text-text-muted">{f.hint}</span>}
              </label>
            );
          })}
        </div>
        {locked ? (
          <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-text-muted">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Fixed for this problem; can&apos;t be duplicated, resized, or deleted.
          </div>
        ) : (
          <div className="flex gap-2 border-t border-border px-4 py-3">
            <button type="button" onClick={() => onDuplicate(node.id)} className={`${ui.btnSecondary} ${ui.btnSm} flex-1`}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Duplicate
            </button>
            <button type="button" onClick={() => onDelete(node.id)} className={`${ui.btnDanger} ${ui.btnSm} flex-1`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
