"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Clock } from "lucide-react";
import type { ProblemStatus } from "@/lib/store/user-data";
import { DIFFICULTY_TONE, type ProblemSummary } from "@/lib/content/summaries";
import { badge, type BadgeTone } from "@/components/ui/styles";
import { ListPopover } from "./ListPopover";

const DIFFICULTY_BADGE: Record<ProblemSummary["difficulty"], BadgeTone> = { Easy: "success", Medium: "warning", Hard: "danger" };

export function ProblemRow({ problem, status }: { problem: ProblemSummary; status: ProblemStatus }) {
  const tone = DIFFICULTY_TONE[problem.difficulty];
  const done = status === "completed";
  const started = status === "in_progress";
  return (
    <div className="group relative">
      {done && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-success to-mint" />}
      <Link
        href={`/problems/${problem.id}?from=problems`}
        className="grid gap-2.5 py-4 pl-5 pr-16 transition-colors duration-fast hover:bg-surface-hover sm:pl-6 md:grid-cols-[7.5rem_minmax(0,1fr)_auto] md:items-center md:gap-6"
      >
        <span className="flex items-center gap-2">
          {done ? (
            <span className={badge("success")}>
              <Check className="h-3 w-3" aria-hidden="true" />
              Completed
            </span>
          ) : (
            <span className={badge(DIFFICULTY_BADGE[problem.difficulty])}>
              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
              {problem.difficulty}
            </span>
          )}
        </span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-text-primary">
            <span className="truncate">{problem.title}</span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-all duration-fast group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
            <span className="figures font-semibold text-accent">{problem.code}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{problem.section}</span>
            {started && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-warning">In progress</span>
              </>
            )}
          </p>
        </div>
        <span className="figures flex items-center gap-1.5 text-xs font-medium text-text-secondary md:justify-end">
          <Clock className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          {problem.estimatedMinutes} min
        </span>
      </Link>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 sm:right-5">
        <ListPopover problemId={problem.id} />
      </div>
    </div>
  );
}
