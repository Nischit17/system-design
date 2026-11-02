import type { GraphSpec } from "@/lib/sim/graph";
import type { Ctx } from "@/lib/sim/evaluate";
import type {
  CacheTarget,
  CdnTarget,
  DbTarget,
  IsolationTarget,
  MemoryTarget,
  QueueTarget,
  ShardTarget,
} from "@/lib/sim/engine";

export type Difficulty = "Easy" | "Medium" | "Hard";

export type CategoryKey =
  | "capacity"
  | "utilization"
  | "quality"
  | "reliability"
  | "cost"
  | "validity"
  | (string & {});

export interface Check {
  /** Requirement sentence shown in the Requirements tab. */
  text: string;
  test: (c: Ctx) => boolean;
  category?: CategoryKey;
  points?: number;
  /** Short label for the scoring breakdown (defaults to the category label). */
  label?: string;
  pass?: string | ((c: Ctx) => string);
  fail?: string | ((c: Ctx) => string);
  fix?: string;
  /** Soft checks cost points but never block a pass on their own. */
  soft?: boolean;
  /** Bonus checks only appear in checklist grading; they add points above the base. */
  bonus?: boolean;
}

export interface Scenario {
  id: string;
  label: string;
  narrative: string;
  required: boolean;
  checks: Check[];
  sim?: SimSpec;
}

export interface SimSpec {
  sustainedRps?: number;
  peakRps?: number;
  cpuMaxPercent?: number;
  budgetMaxUsd?: number;
  /** Component types counted toward the budget (default: every node). */
  budgetTypes?: string[];
  failureTest?: boolean;
  p95MaxMs?: number;
  p99MaxMs?: number;
  errorMaxPercent?: number;
  trafficUnit?: string;
  /** Overrides the plain sum of node prices (e.g. autoscaled fleets billed by the hour). */
  costFn?: (c: Ctx) => number;
  memory?: MemoryTarget;
  isolation?: IsolationTarget;
  db?: DbTarget;
  cache?: CacheTarget & { readsPerSec: number };
  queue?: QueueTarget;
  cdn?: CdnTarget;
  shards?: ShardTarget;
}

export interface DesignGuide {
  title: string;
  description: string;
  flow: string[];
  secondary?: { title: string; flow: string[] };
  extra?: { title: string; flow: string[] }[];
  notes?: string[];
}

export interface StartingMetrics {
  rps: number;
  trafficUnit?: string;
  appCpuPercent?: number;
  appMemoryPercent?: number;
  monthlyCostUsd: number;
  dbCpuPercent?: number;
  dbConnections?: number;
  p50Ms?: number;
  p95Ms?: number;
  p99Ms?: number;
  errorRatePercent?: number;
  perServer?: { label: string; cpuPercent: number }[];
}

export interface ReferenceDesign {
  flow?: string[];
  config: string[];
  explanation: string[];
  graph: GraphSpec;
}

/** Variant that starts from a broken, already-running system. */
export interface FixVariant {
  description: string;
  guideTitle?: string;
  guideDescription?: string;
  notes?: string[];
  starting: GraphSpec;
  metrics: StartingMetrics;
  /** Replaces checks when repairing needs different wording/conditions. */
  checks?: Check[];
  reference?: Partial<ReferenceDesign>;
}

export interface ProblemDef {
  code: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  minutes: number;
  description: string;
  guide?: DesignGuide;
  concepts: string[];
  reading?: { title: string; description: string; href: string }[];
  components: string[];
  sim?: SimSpec;
  checks: Check[];
  scenarios?: Scenario[];
  reference: ReferenceDesign;
  fix?: FixVariant;
  passingScore?: number;
  sectionChallenge?: boolean;
}

export type ProblemMode = "scratch" | "fix" | "single";

/** Fully resolved problem used by the UI. */
export interface Problem {
  id: string;
  code: string;
  title: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  description: string;
  designGuide?: DesignGuide;
  requirements: string[];
  checks: Check[];
  scenarios?: Scenario[];
  concepts: string[];
  readingMaterials: { title: string; description: string; href: string }[];
  availableComponents: string[];
  sim?: SimSpec;
  startingGraph?: GraphSpec;
  startingMetrics?: StartingMetrics;
  referenceDesign: ReferenceDesign;
  passingScore: number;
  mode: ProblemMode;
  trackSlug: string;
  sectionId: string;
  sectionTitle: string;
  domainLabel: string;
  sectionChallenge?: boolean;
  /** For scratch/fix pairs: the sibling problem id. */
  siblingId?: string;
}
