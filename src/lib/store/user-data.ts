"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Learning progress, lists and activity, kept in this browser's localStorage.
 * Loadline has no accounts: everything works for everyone, and progress stays on the device.
 */

export type ProblemStatus = "not_started" | "in_progress" | "completed";

export interface Attempt {
  attempt: number;
  score: number;
  passed: boolean;
  at: number;
}

export interface ProblemRecord {
  status: ProblemStatus;
  bestScore: number;
  attempts: number;
  firstOpenedAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface ProblemList {
  id: string;
  name: string;
  problemIds: string[];
  createdAt: number;
}

export interface UserData {
  version: 1;
  joinedAt: number;
  problems: Record<string, ProblemRecord>;
  lists: ProblemList[];
  /** yyyy-mm-dd -> number of problems completed that day */
  completions: Record<string, number>;
  /** yyyy-mm-dd -> submissions that day */
  submissions: Record<string, number>;
}

export const MAX_PROBLEM_LISTS_PER_USER = 3;

const STORAGE_KEY = "cp:user:local";
const DRAFT_PREFIX = "cp-sd-";

const emptyData = (): UserData => ({
  version: 1,
  joinedAt: Date.now(),
  problems: {},
  lists: [],
  completions: {},
  submissions: {},
});

const listeners = new Set<() => void>();
let cache: UserData | null = null;

/** Older builds stored progress per signed-in email; adopt the first one found. */
function legacyData(): string | null {
  for (const k of Object.keys(localStorage)) if (k.startsWith("cp:user:") && k !== STORAGE_KEY) return localStorage.getItem(k);
  return null;
}

function read(): UserData {
  if (cache) return cache;
  let data = emptyData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? legacyData();
    if (raw) data = { ...emptyData(), ...JSON.parse(raw) };
  } catch {
    /* storage unavailable: fall back to memory */
  }
  cache = data;
  return data;
}

function write(data: UserData) {
  cache = data;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / privacy mode */
  }
  listeners.forEach((l) => l());
}

function update(fn: (d: UserData) => UserData) {
  write(fn(read()));
}

export function dayKey(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY = emptyData();
const noopSubscribe = () => () => {};

/** False during server render and hydration, true once browser storage has been read. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function isUserData(v: unknown): v is UserData {
  const d = v as UserData;
  return !!d && typeof d === "object" && d.version === 1 && typeof d.problems === "object" && Array.isArray(d.lists);
}

export function useUserData() {
  const data = useSyncExternalStore(subscribe, read, () => EMPTY);
  const loaded = useHydrated();

  const markOpened = useCallback((problemId: string) => {
    update((d) => {
      if (d.problems[problemId]) return d;
      const now = Date.now();
      return { ...d, problems: { ...d.problems, [problemId]: { status: "in_progress", bestScore: 0, attempts: 0, firstOpenedAt: now, updatedAt: now } } };
    });
  }, []);

  const recordAttempt = useCallback((problemId: string, score: number, passed: boolean) => {
    update((d) => {
      const now = Date.now();
      const cur = d.problems[problemId] ?? { status: "in_progress", bestScore: 0, attempts: 0, firstOpenedAt: now, updatedAt: now };
      const wasCompleted = cur.status === "completed";
      const next: ProblemRecord = {
        ...cur,
        attempts: cur.attempts + 1,
        bestScore: Math.max(cur.bestScore, score),
        status: passed || wasCompleted ? "completed" : "in_progress",
        updatedAt: now,
        completedAt: cur.completedAt ?? (passed ? now : undefined),
      };
      const day = dayKey(now);
      return {
        ...d,
        problems: { ...d.problems, [problemId]: next },
        submissions: { ...d.submissions, [day]: (d.submissions[day] ?? 0) + 1 },
        completions: passed && !wasCompleted ? { ...d.completions, [day]: (d.completions[day] ?? 0) + 1 } : d.completions,
      };
    });
  }, []);

  const createList = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) return null;
    let created: ProblemList | null = null;
    update((d) => {
      if (d.lists.length >= MAX_PROBLEM_LISTS_PER_USER) return d;
      created = { id: `list-${Date.now().toString(36)}`, name: trimmed, problemIds: [], createdAt: Date.now() };
      return { ...d, lists: [...d.lists, created] };
    });
    return created;
  }, []);

  const toggleInList = useCallback((listId: string, problemId: string) => {
    update((d) => ({
      ...d,
      lists: d.lists.map((l) =>
        l.id !== listId
          ? l
          : { ...l, problemIds: l.problemIds.includes(problemId) ? l.problemIds.filter((p) => p !== problemId) : [...l.problemIds, problemId] },
      ),
    }));
  }, []);

  const renameList = useCallback((listId: string, name: string) => {
    update((d) => ({ ...d, lists: d.lists.map((l) => (l.id === listId ? { ...l, name: name.trim().slice(0, 60) || l.name } : l)) }));
  }, []);

  const deleteList = useCallback((listId: string) => {
    update((d) => ({ ...d, lists: d.lists.filter((l) => l.id !== listId) }));
  }, []);

  /** Clears all progress, lists and saved canvas drafts on this device. */
  const resetProgress = useCallback(() => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("cp:user:") || k.startsWith(DRAFT_PREFIX)) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
    write(emptyData());
  }, []);

  /** JSON snapshot of progress, for moving it to another browser. */
  const exportProgress = useCallback(() => JSON.stringify(read(), null, 2), []);

  /** Replaces progress with a previously exported snapshot. Returns false if the file isn't a valid export. */
  const importProgress = useCallback((json: string) => {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!isUserData(parsed)) return false;
      write({ ...emptyData(), ...parsed });
      return true;
    } catch {
      return false;
    }
  }, []);

  const statusOf = useCallback((problemId: string): ProblemStatus => data.problems[problemId]?.status ?? "not_started", [data]);

  return useMemo(
    () => ({
      loaded,
      data,
      statusOf,
      markOpened,
      recordAttempt,
      createList,
      toggleInList,
      renameList,
      deleteList,
      resetProgress,
      exportProgress,
      importProgress,
    }),
    [loaded, data, statusOf, markOpened, recordAttempt, createList, toggleInList, renameList, deleteList, resetProgress, exportProgress, importProgress],
  );
}
