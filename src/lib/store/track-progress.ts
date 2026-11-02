"use client";

import { useCallback } from "react";
import type { CodeInfo } from "@/lib/content/roadmap-data";
import type { TrackSection } from "@/lib/content/tracks";
import { useUserData } from "./user-data";

/** Roadmap progress: a code counts as solved when either of its modes is completed. */
export function useTrackProgress(codes: Record<string, CodeInfo>) {
  const { statusOf } = useUserData();
  const isSolved = useCallback(
    (code: string) => {
      const info = codes[code];
      if (!info) return false;
      return (!!info.scratchId && statusOf(info.scratchId) === "completed") || (!!info.fixId && statusOf(info.fixId) === "completed");
    },
    [codes, statusOf],
  );
  const isStarted = useCallback(
    (code: string) => {
      const info = codes[code];
      if (!info) return false;
      return (!!info.scratchId && statusOf(info.scratchId) !== "not_started") || (!!info.fixId && statusOf(info.fixId) !== "not_started");
    },
    [codes, statusOf],
  );
  const solvedIn = useCallback((sections: TrackSection[]) => sections.reduce((n, s) => n + s.codes.filter(isSolved).length, 0), [isSolved]);
  return { isSolved, isStarted, solvedIn };
}
