import type { Problem, ProblemDef } from "./types";
import { TRACKS, type Track, type TrackSection } from "./tracks";
import { COMPUTE_TRAFFIC } from "./problems/compute-traffic";
import { DATA_STORAGE } from "./problems/data-storage";
import { CACHING_DELIVERY } from "./problems/caching-delivery";
import { EVENTS_COMMUNICATION } from "./problems/events-communication";
import { SERVICE_RESILIENCE } from "./problems/service-resilience";
import { PRODUCTION_OPERATIONS } from "./problems/production-operations";
import { EXPERT } from "./problems/expert";
import { ML_DATA } from "./problems/ml-data";
import { ML_TRAINING } from "./problems/ml-training";
import { ML_SERVING } from "./problems/ml-serving";
import { LLM } from "./problems/llm";

const ALL_DEFS: ProblemDef[] = [
  ...COMPUTE_TRAFFIC,
  ...DATA_STORAGE,
  ...CACHING_DELIVERY,
  ...EVENTS_COMMUNICATION,
  ...SERVICE_RESILIENCE,
  ...PRODUCTION_OPERATIONS,
  ...EXPERT,
  ...ML_DATA,
  ...ML_TRAINING,
  ...ML_SERVING,
  ...LLM,
];

const DEF_BY_CODE = new Map(ALL_DEFS.map((d) => [d.code, d]));

function placement(code: string): { track: Track; section: TrackSection } | null {
  for (const track of TRACKS) for (const section of track.sections) if (section.codes.includes(code)) return { track, section };
  return null;
}

const sectionDomainLabel = (track: Track, section: TrackSection) =>
  track.slug === "expert-system-architecture" || track.slug === "llm-system-design" ? "System Design" : section.title;

function resolve(def: ProblemDef, mode: "scratch" | "fix" | "single"): Problem {
  const where = placement(def.code);
  const fix = mode === "fix" ? def.fix! : undefined;
  const code = mode === "fix" ? def.code.replace(/^SSA/, "FTS") : def.code;
  const checks = fix?.checks ?? def.checks;
  const guide = def.guide
    ? {
        ...def.guide,
        title: fix?.guideTitle ?? (mode === "fix" ? def.guide.title.replace(/^Required/, "Target") : def.guide.title),
        description: fix?.guideDescription ?? def.guide.description,
        notes: fix?.notes ?? def.guide.notes,
      }
    : undefined;
  return {
    id: `${code}-${def.slug}`,
    code,
    title: def.title,
    difficulty: def.difficulty,
    estimatedMinutes: def.minutes,
    description: fix?.description ?? def.description,
    designGuide: guide,
    requirements: checks.map((c) => c.text),
    checks,
    scenarios: def.scenarios,
    concepts: def.concepts,
    readingMaterials: def.reading ?? [],
    availableComponents: def.components,
    sim: def.sim,
    startingGraph: fix?.starting,
    startingMetrics: fix?.metrics,
    referenceDesign: { ...def.reference, ...(fix?.reference ?? {}) },
    passingScore: def.passingScore ?? 90,
    mode,
    trackSlug: where?.track.slug ?? "",
    sectionId: where?.section.id ?? "",
    sectionTitle: where?.section.title ?? "",
    domainLabel: where ? sectionDomainLabel(where.track, where.section) : "System Design",
    sectionChallenge: def.sectionChallenge || where?.section.challenges?.includes(def.code),
    siblingId: def.fix ? `${mode === "fix" ? def.code : def.code.replace(/^SSA/, "FTS")}-${def.slug}` : undefined,
  };
}

/** Every playable problem, in the order the Problems page lists them. */
function buildAll(): Problem[] {
  const out: Problem[] = [];
  const dualTracks = TRACKS.filter((t) => t.dualMode);
  const foundation = dualTracks.filter((t) => t.tier === "Foundations");
  const advanced = dualTracks.filter((t) => t.tier === "Advanced");
  for (const group of [foundation, advanced]) {
    const codes = group.flatMap((t) => t.sections.flatMap((s) => s.codes));
    for (const c of codes) {
      const def = DEF_BY_CODE.get(c);
      if (def) out.push(resolve(def, "scratch"));
    }
    for (const c of codes) {
      const def = DEF_BY_CODE.get(c);
      if (def?.fix) out.push(resolve(def, "fix"));
    }
  }
  for (const t of TRACKS.filter((t) => !t.dualMode).sort((a, b) => (a.family === b.family ? a.order - b.order : 0))) {
    for (const s of t.sections)
      for (const c of s.codes) {
        const def = DEF_BY_CODE.get(c);
        if (def) out.push(resolve(def, "single"));
      }
  }
  return out;
}

export const ALL_PROBLEMS: Problem[] = buildAll();
const BY_ID = new Map(ALL_PROBLEMS.map((p) => [p.id, p]));
const BY_CODE = new Map(ALL_PROBLEMS.map((p) => [p.code, p]));

export function getProblem(id: string): Problem | undefined {
  return BY_ID.get(id) ?? BY_CODE.get(id.split("-")[0]);
}

export function getProblemByCode(code: string): Problem | undefined {
  return BY_CODE.get(code);
}

/** The scratch / fix pair for a roadmap card (fix may be undefined for single-mode tracks). */
export function problemPair(code: string): { scratch?: Problem; fix?: Problem } {
  const base = BY_CODE.get(code);
  const fix = BY_CODE.get(code.replace(/^SSA/, "FTS"));
  return { scratch: base, fix: fix && fix !== base ? fix : undefined };
}

/** Next problem in the same track and mode, used by the "Next problem" button. */
export function nextProblem(problem: Problem): Problem | null {
  const track = TRACKS.find((t) => t.slug === problem.trackSlug);
  if (!track) return null;
  const codes = track.sections.flatMap((s) => s.codes);
  const base = problem.code.replace(/^FTS/, "SSA");
  const i = codes.indexOf(base);
  for (let j = i + 1; j < codes.length; j++) {
    const code = problem.mode === "fix" ? codes[j].replace(/^SSA/, "FTS") : codes[j];
    const p = BY_CODE.get(code);
    if (p) return p;
  }
  return null;
}

export function problemsForSection(section: TrackSection): Problem[] {
  return section.codes.flatMap((c) => {
    const p = BY_CODE.get(c);
    return p ? [p] : [];
  });
}

export const POPULAR = {
  gold: ["EX0009", "EX0005", "EX0010", "EX0008", "EX0006", "EX0012"],
  silver: ["EX0004", "EX0007", "EX0011", "EX0013"],
  bronze: ["EX0001", "EX0002", "EX0003"],
};

export function popularQuestions() {
  const pick = (codes: string[]) => codes.flatMap((c) => (BY_CODE.get(c) ? [BY_CODE.get(c)!] : []));
  return { gold: pick(POPULAR.gold), silver: pick(POPULAR.silver), bronze: pick(POPULAR.bronze) };
}

export const TOTAL_PROBLEM_COUNT = ALL_PROBLEMS.length;
