"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Inbox, X } from "lucide-react";
import type { Difficulty } from "@/lib/content/types";
import type { ProblemSummary } from "@/lib/content/summaries";
import { useUserData, type ProblemStatus } from "@/lib/store/user-data";
import { EmptyState } from "@/components/ui/EmptyState";
import { ui } from "@/components/ui/styles";
import { ProblemRow } from "./ProblemRow";

const STATUS_LABELS: Record<string, string> = { not_started: "Not started", in_progress: "In progress", completed: "Completed" };
const LEVELS: Difficulty[] = ["Easy", "Medium", "Hard"];

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <span className={`${ui.label} w-20 shrink-0`}>{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Chips({ label, options, active, onSelect, format }: { label: string; options: string[]; active: string; onSelect: (v: string) => void; format?: (v: string) => string }) {
  return (
    <FilterRow label={label}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={o === active} onClick={() => onSelect(o)} className={ui.chip(o === active)}>
          {format ? format(o) : o}
        </button>
      ))}
    </FilterRow>
  );
}

export function ProblemsBrowser({ problems }: { problems: ProblemSummary[] }) {
  const { data, statusOf } = useUserData();
  const [domain, setDomain] = useState("All");
  const [sections, setSections] = useState<string[]>([]);
  const [level, setLevel] = useState("All");
  const [progress, setProgress] = useState("All");
  const [listId, setListId] = useState("All");
  const [sectionOpen, setSectionOpen] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  const domains = useMemo(() => ["All", ...Array.from(new Set(problems.map((p) => p.category))).sort()], [problems]);
  const sectionOptions = useMemo(() => Array.from(new Set(problems.map((p) => p.section))).sort(), [problems]);
  const levels = useMemo(() => {
    const present = new Set(problems.map((p) => p.difficulty));
    return ["All", ...LEVELS.filter((l) => present.has(l))];
  }, [problems]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (sectionRef.current && !sectionRef.current.contains(e.target as Node)) setSectionOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const activeList = listId === "All" ? null : (data.lists.find((l) => l.id === listId) ?? null);
  const filtered = problems.filter(
    (p) =>
      (domain === "All" || p.category === domain) &&
      (sections.length === 0 || sections.includes(p.section)) &&
      (level === "All" || p.difficulty === level) &&
      (progress === "All" || statusOf(p.id) === (progress as ProblemStatus)) &&
      (!activeList || activeList.problemIds.includes(p.id)),
  );
  const filtering = domain !== "All" || sections.length > 0 || level !== "All" || progress !== "All" || listId !== "All";

  const clearAll = () => {
    setDomain("All");
    setSections([]);
    setLevel("All");
    setProgress("All");
    setListId("All");
  };

  return (
    <div>
      <div className={`${ui.card} space-y-3.5 p-4 sm:p-5`}>
        <Chips label="Domain" options={domains} active={domain} onSelect={setDomain} />
        <FilterRow label="Section">
          <div ref={sectionRef} className="relative w-full max-w-md">
            <button
              type="button"
              onClick={() => setSectionOpen((o) => !o)}
              aria-expanded={sectionOpen}
              aria-label="Filter by section"
              className={`${ui.input} flex items-center justify-between gap-2 !py-2 text-left`}
            >
              <span className="truncate">{sections.length === 0 ? "All sections" : sections.length === 1 ? sections[0] : `${sections.length} sections selected`}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-fast ${sectionOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {sectionOpen && (
              <div className={`${ui.popover} absolute left-0 right-0 top-[calc(100%+8px)] z-30 motion-safe:animate-[roadmap-pop-in_180ms_var(--ease-spring-interactive)_both]`}>
                <div data-lenis-prevent className="thin-scrollbar max-h-72 space-y-0.5 overflow-y-auto">
                  {["All sections", ...sectionOptions].map((s) => {
                    const all = s === "All sections";
                    const on = all ? sections.length === 0 : sections.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => (all ? setSections([]) : setSections((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s])))}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-fast ${
                          on ? "bg-accent/15 text-text-primary" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                        }`}
                      >
                        <span className="truncate">{s}</span>
                        {on && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {sections.length > 0 && (
            <button type="button" onClick={() => setSections([])} className={`${ui.btnGhost} ${ui.btnSm}`}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear
            </button>
          )}
        </FilterRow>
        <Chips label="Level" options={levels} active={level} onSelect={setLevel} />
        <Chips label="Progress" options={["All", "not_started", "in_progress", "completed"]} active={progress} onSelect={setProgress} format={(v) => STATUS_LABELS[v] ?? v} />
        {data.lists.length > 0 && (
          <Chips label="My lists" options={["All", ...data.lists.map((l) => l.id)]} active={listId} onSelect={setListId} format={(id) => data.lists.find((l) => l.id === id)?.name ?? "All"} />
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 px-1">
        <p className="text-sm text-text-muted">
          Showing <span className="figures font-semibold text-text-primary">{filtered.length}</span> of <span className="figures">{problems.length}</span> problems
        </p>
        {filtering && (
          <button type="button" onClick={clearAll} className={`${ui.btnGhost} ${ui.btnSm}`}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          className="mt-3"
          title="Nothing matches"
          description="No problems match these filters."
          action={
            <button type="button" onClick={clearAll} className={`${ui.btnSecondary} ${ui.btnSm}`}>
              Clear filters
            </button>
          }
        />
      ) : (
        <div className={`${ui.card} mt-3 divide-y divide-border overflow-hidden`}>
          {filtered.map((p) => (
            <ProblemRow key={p.id} problem={p} status={statusOf(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
