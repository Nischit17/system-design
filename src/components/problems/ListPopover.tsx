"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ListPlus, Plus } from "lucide-react";
import { MAX_PROBLEM_LISTS_PER_USER, useUserData } from "@/lib/store/user-data";
import { ui } from "@/components/ui/styles";

/** "+" button on a problem row: save the problem into one of the visitor's lists (kept in this browser). */
export function ListPopover({ problemId }: { problemId: string }) {
  const { data, loaded, createList, toggleInList } = useUserData();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [name, setName] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inAny = data.lists.some((l) => l.problemIds.includes(problemId));

  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.right - 264, window.innerWidth - 264 - 8)) });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const create = () => {
    if (!name.trim()) return;
    const list = createList(name);
    if (list) {
      toggleInList((list as { id: string }).id, problemId);
      setName("");
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={inAny ? "Manage lists for this problem" : "Add to a list"}
        aria-expanded={open}
        title={inAny ? "In a list" : "Add to a list"}
        className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors duration-fast ${
          inAny ? "border-accent/50 bg-accent-soft text-accent" : "border-border bg-surface text-text-muted hover:border-accent/50 hover:text-accent"
        }`}
      >
        {inAny ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 264 }}
            className={`${ui.popover} z-50 !p-3 motion-safe:animate-[roadmap-pop-in_180ms_var(--ease-spring-interactive)_both]`}
            onClick={(e) => e.stopPropagation()}
          >
            {!loaded ? (
              <p className="py-2 text-center text-xs text-text-muted">Loading…</p>
            ) : (
              <div className="space-y-1">
                <p className={`${ui.label} mb-2`}>Save to list</p>
                {data.lists.length === 0 && <p className="mb-2 text-xs text-text-muted">No lists yet. Name one below to start.</p>}
                {data.lists.map((l) => {
                  const has = l.problemIds.includes(problemId);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleInList(l.id, problemId)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-fast ${
                        has ? "bg-accent/15 text-text-primary" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      }`}
                    >
                      <span className="truncate">{l.name}</span>
                      {has && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />}
                    </button>
                  );
                })}
                {data.lists.length < MAX_PROBLEM_LISTS_PER_USER ? (
                  <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2.5">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && create()}
                      placeholder="New list name"
                      maxLength={60}
                      className={`${ui.input} !px-3 !py-2 !text-xs`}
                    />
                    <button type="button" onClick={create} disabled={!name.trim()} aria-label="Create list" className={ui.iconBtn}>
                      <ListPlus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 border-t border-border pt-2.5 text-xs text-text-muted">Maximum {MAX_PROBLEM_LISTS_PER_USER} lists.</p>
                )}
                <p className="pt-1.5 text-[11px] leading-4 text-text-muted">Lists are saved in this browser.</p>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
