"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { CATEGORY_STYLES, getComponent, paletteGroups, type ComponentDef } from "@/lib/catalog/components";
import { badge, ui } from "@/components/ui/styles";

const DRAG_TYPE = "application/x-sd-component";

const ADD_BTN =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-fast group-hover:bg-accent-strong group-hover:text-on-accent";

function ComponentIcon({ component }: { component: ComponentDef }) {
  const Icon = component.icon;
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CATEGORY_STYLES[component.category].chip}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

function LibraryItem({ component, onAdd }: { component: ComponentDef; onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const hasFields = component.configFields.length > 0;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, component.type);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className="overflow-hidden rounded-xl border border-border bg-surface/70 transition-colors duration-fast hover:border-border-strong"
    >
      <div className="flex items-center gap-1 pr-1.5">
        <button
          type="button"
          onClick={() => onAdd(component.type)}
          className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-fast hover:bg-surface-hover"
        >
          <ComponentIcon component={component} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-text-primary">{component.label}</span>
            <span className="block truncate text-[11px] text-text-muted">{component.blurb}</span>
          </span>
          <span className={ADD_BTN} aria-hidden="true">
            <Plus className="h-4 w-4" />
          </span>
          <span className="sr-only">Add {component.label}</span>
        </button>
        {hasFields && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} ${component.label} settings`}
            title={`${open ? "Hide" : "Show"} settings`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary"
          >
            <ChevronDown className={`h-4 w-4 transition-transform duration-normal ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        )}
      </div>
      {hasFields && open && (
        <dl className="divide-y divide-border border-t border-border bg-background-elevated/60 px-3 py-1.5 motion-safe:animate-[roadmap-pop-in_240ms_var(--ease-spring-interactive)_both]">
          {component.configFields.map((f) => (
            <div key={f.key} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 py-1.5 text-[11px] leading-4">
              <dt className="font-semibold text-text-secondary">{f.label}</dt>
              <dd className="break-words text-text-muted">
                {f.type === "select"
                  ? f.options.join(" · ")
                  : f.type === "number"
                    ? [f.min !== undefined ? `min ${f.min}` : null, f.max !== undefined ? `max ${f.max}` : null].filter(Boolean).join(" · ") || `default ${f.defaultValue}`
                    : (f.hint ?? `default: ${f.defaultValue}`)}
                {f.hint && f.type !== "text" && <span className="mt-0.5 block text-text-muted/80">{f.hint}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function RequiredComponents({ types, onAdd }: { types: string[]; onAdd: (type: string) => void }) {
  const list = types.flatMap((t) => (getComponent(t) ? [getComponent(t)!] : []));
  if (list.length === 0) return null;
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className={ui.label}>Required components</h2>
        <span className={`${badge("accent")} figures`}>{list.length}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-text-muted">Click to add one to the canvas, or drag it into place.</p>
      <div className="mt-2.5 space-y-1 rounded-2xl border border-accent/30 bg-accent-soft/40 p-1.5">
        {list.map((c) => (
          <button
            key={c.type}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, c.type);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onAdd(c.type)}
            className="group flex w-full items-center gap-2.5 rounded-xl border border-transparent bg-surface/80 px-2.5 py-2 text-left transition-colors duration-fast hover:border-accent/40 hover:bg-surface-hover"
          >
            <ComponentIcon component={c} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-text-primary">{c.label}</span>
              <span className="block truncate text-[11px] text-text-muted">{c.blurb}</span>
            </span>
            <span className={ADD_BTN} aria-hidden="true">
              <Plus className="h-4 w-4" />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ComponentLibrary({ onAdd }: { onAdd: (type: string) => void }) {
  const groups = paletteGroups();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(groups.map((g) => g.category)));
  return (
    <section>
      <h2 className={ui.label}>Additional components</h2>
      <p className="mt-1 text-xs leading-5 text-text-muted">Browse by category. Click or drag a component onto the canvas.</p>
      <div className="mt-2.5 space-y-2">
        {groups.map((g) => {
          const closed = collapsed.has(g.category);
          const st = CATEGORY_STYLES[g.category];
          return (
            <section key={g.category} className={`rounded-2xl border bg-surface/40 transition-colors duration-fast ${closed ? "border-border" : "border-border-strong"}`}>
              <button
                type="button"
                aria-expanded={!closed}
                onClick={() =>
                  setCollapsed((cur) => {
                    const next = new Set(cur);
                    if (next.has(g.category)) next.delete(g.category);
                    else next.add(g.category);
                    return next;
                  })
                }
                className="flex w-full items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold text-text-secondary transition-colors duration-fast hover:text-text-primary"
              >
                <span className="flex items-center gap-2.5">
                  <span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden="true" />
                  {g.label}
                  <span className="figures text-[11px] font-medium text-text-muted">{g.components.length}</span>
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-normal ${closed ? "-rotate-90" : ""}`} aria-hidden="true" />
              </button>
              {!closed && (
                <div className="stagger-in space-y-1.5 px-2 pb-2">
                  {g.components.map((c) => (
                    <LibraryItem key={c.type} component={c} onAdd={onAdd} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
