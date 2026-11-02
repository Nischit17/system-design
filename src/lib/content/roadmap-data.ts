import { getProblemByCode, problemPair } from "./registry";
import { TRACKS } from "./tracks";
import type { Difficulty } from "./types";

/** Serializable per-code info the roadmap/track UIs need on the client. */
export interface CodeInfo {
  code: string;
  title: string;
  difficulty: Difficulty;
  minutes: number;
  scratchId?: string;
  fixId?: string;
  concepts: string[];
}

export function codeInfoMap(): Record<string, CodeInfo> {
  const out: Record<string, CodeInfo> = {};
  for (const t of TRACKS)
    for (const s of t.sections)
      for (const code of s.codes) {
        const base = getProblemByCode(code);
        if (!base) continue;
        const pair = problemPair(code);
        out[code] = {
          code,
          title: base.title,
          difficulty: base.difficulty,
          minutes: base.estimatedMinutes,
          scratchId: pair.scratch?.id,
          fixId: pair.fix?.id,
          concepts: base.concepts,
        };
      }
  return out;
}
