import type { Difficulty, Problem } from "./types";

/** Lightweight shape sent to client lists. */
export interface ProblemSummary {
  id: string;
  code: string;
  title: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  category: string;
  section: string;
  mode: Problem["mode"];
}

export function toSummary(p: Problem): ProblemSummary {
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    difficulty: p.difficulty,
    estimatedMinutes: p.estimatedMinutes,
    category: "System Design",
    section: p.domainLabel,
    mode: p.mode,
  };
}

export const DIFFICULTY_TONE: Record<Difficulty, { dot: string; text: string; hex: string }> = {
  Easy: { dot: "bg-success", text: "text-success", hex: "#1f8f5f" },
  Medium: { dot: "bg-warning", text: "text-warning", hex: "#b06430" },
  Hard: { dot: "bg-danger", text: "text-danger", hex: "#c1444e" },
};
