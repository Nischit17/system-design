import type { Check, Problem, Scenario, SimSpec } from "@/lib/content/types";
import type { Graph, GraphNode } from "./graph";
import * as E from "./engine";

/* ------------------------------------------------------------------ */
/* Check context: everything a requirement test can ask about a design */
/* ------------------------------------------------------------------ */

export interface Ctx {
  g: Graph;
  sim?: SimSpec;
  nodes(...types: string[]): GraphNode[];
  first(type: string): GraphNode | undefined;
  has(type: string, min?: number): boolean;
  count(type: string): number;
  /** Any node of `from` has a direct edge to any node of `to`. */
  edge(from: string, to: string): boolean;
  /** Every node of `from` has an edge to some node of `to` (and at least one `from` exists). */
  every(from: string, to: string): boolean;
  /** Every node of `to` receives an edge from some node of `from` (and at least one `to` exists). */
  feeds(from: string, to: string): boolean;
  path(...types: string[]): boolean;
  cfg(type: string, key: string): string;
  n(type: string, key: string, fallback?: number): number;
  is(type: string, key: string, value: string): boolean;
  all(type: string, key: string, value: string): boolean;
  topology(): E.Topology;
  load(rps?: number, cpuMax?: number): E.LoadTest;
  failure(rps?: number, cpuMax?: number): E.FailureTest;
  cost(types?: string[]): number;
  memory(t?: E.MemoryTarget): ReturnType<typeof E.resolveMemoryCapacity>;
  isolation(t?: E.IsolationTarget): ReturnType<typeof E.resolveComputeIsolation>;
  db(t?: E.DbTarget): ReturnType<typeof E.resolveDatabaseLoad>;
  connections(): ReturnType<typeof E.resolveConnections>;
  queue(t?: E.QueueTarget): ReturnType<typeof E.resolveQueueBacklog>;
  cdn(t?: E.CdnTarget): ReturnType<typeof E.resolveCdn>;
  shards(t?: E.ShardTarget): ReturnType<typeof E.resolveShardDistribution>;
  cacheHit(t?: E.CacheTarget): number;
  orphans(): GraphNode[];
}

export function makeCtx(g: Graph, sim?: SimSpec): Ctx {
  const memo = new Map<string, unknown>();
  const cached = <T,>(key: string, fn: () => T): T => {
    if (!memo.has(key)) memo.set(key, fn());
    return memo.get(key) as T;
  };
  const ofType = (type: string) => g.nodes.filter((n) => n.type === type);
  const ctx: Ctx = {
    g,
    sim,
    nodes: (...types) => E.nodesOf(g, ...types),
    first: (type) => g.nodes.find((n) => n.type === type),
    has: (type, min = 1) => ofType(type).length >= min,
    count: (type) => ofType(type).length,
    edge: (from, to) => g.edges.some((e) => {
      const s = g.nodes.find((n) => n.id === e.source);
      const t = g.nodes.find((n) => n.id === e.target);
      return s?.type === from && t?.type === to;
    }),
    every: (from, to) => {
      const froms = ofType(from);
      return froms.length > 0 && froms.every((f) => E.outgoing(g, f.id).some((n) => n.type === to));
    },
    feeds: (from, to) => {
      const tos = ofType(to);
      return tos.length > 0 && tos.every((t) => E.incoming(g, t.id).some((n) => n.type === from));
    },
    path: (...types) => E.pathExists(g, types),
    cfg: (type, key) => E.str(ofType(type)[0]?.config[key]),
    n: (type, key, fallback = 0) => E.num(ofType(type)[0]?.config[key], fallback),
    is: (type, key, value) => ofType(type).some((n) => E.str(n.config[key]) === value),
    all: (type, key, value) => {
      const list = ofType(type);
      return list.length > 0 && list.every((n) => E.str(n.config[key]) === value);
    },
    topology: () => cached("topo", () => E.resolveTopology(g)),
    load: (rps = sim?.sustainedRps ?? 0, cpuMax = sim?.cpuMaxPercent ?? 80) =>
      cached(`load:${rps}:${cpuMax}`, () => E.runLoadTest(g, rps, cpuMax)),
    failure: (rps = sim?.sustainedRps ?? 0, cpuMax = sim?.cpuMaxPercent ?? 80) =>
      cached(`fail:${rps}:${cpuMax}`, () => E.runFailureTest(g, rps, cpuMax)),
    cost: (types = sim?.budgetTypes) =>
      cached(`cost:${types?.join(",") ?? "*"}`, () => (sim?.costFn && types === sim?.budgetTypes ? sim.costFn(ctx) : E.totalCostUsd(g, types))),
    memory: (t = sim?.memory) => cached("mem", () => E.resolveMemoryCapacity(g, t!)),
    isolation: (t = sim?.isolation) => cached("iso", () => E.resolveComputeIsolation(g, t!)),
    db: (t = sim?.db) => cached(`db:${JSON.stringify(t)}`, () => E.resolveDatabaseLoad(g, t!)),
    connections: () => cached("conn", () => E.resolveConnections(g)),
    queue: (t = sim?.queue) => cached(`queue:${JSON.stringify(t)}`, () => E.resolveQueueBacklog(g, t!)),
    cdn: (t = sim?.cdn) => cached(`cdn:${JSON.stringify(t)}`, () => E.resolveCdn(g, t)),
    shards: (t = sim?.shards) => cached(`shards:${JSON.stringify(t)}`, () => E.resolveShardDistribution(g, t!)),
    cacheHit: (t = sim?.cache ?? sim?.db?.cache) =>
      cached(`hit:${JSON.stringify(t)}`, () => (t ? E.cacheHitRate(E.readThroughCache(g), t) * 100 : 0)),
    orphans: () => cached("orphans", () => E.orphanNodes(g)),
  };
  return ctx;
}

/* ------------------------------------------------------------------ */
/* scoring                                                              */
/* ------------------------------------------------------------------ */

export const CATEGORY_LABELS: Record<string, string> = {
  capacity: "Capacity",
  utilization: "Resource Utilization",
  quality: "Architecture Quality",
  reliability: "Reliability",
  cost: "Cost Efficiency",
  validity: "Architecture Validity",
};
const CATEGORY_ORDER = ["capacity", "utilization", "quality", "reliability", "cost", "validity"];

export interface RuleOutcome {
  id: string;
  label: string;
  text: string;
  passed: boolean;
  earned: number;
  points: number;
  message: string;
  recommendation?: string;
  soft: boolean;
  bonus: boolean;
  kind: "requirement" | "quality" | "bonus";
}

export interface CategoryOutcome {
  key: string;
  label: string;
  earned: number;
  max: number;
  message: string;
  rules?: RuleOutcome[];
}

export type Band = "Excellent" | "Strong" | "Pass" | "Needs Improvement" | "Major Issues";

export interface EvaluationResult {
  score: number;
  maxScore: number;
  passed: boolean;
  passingScore: number;
  band: Band;
  graded: "simulation" | "checklist";
  costUsd: number;
  budgetUsd: number | null;
  categories: CategoryOutcome[];
  outcomes: RuleOutcome[];
  sustained?: E.LoadTest;
  peak?: E.LoadTest;
  failureTest?: E.FailureTest;
  warnings: string[];
  recommendations: string[];
  flow: string[];
}

export function bandFor(score: number): Band {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Strong";
  if (score >= 70) return "Pass";
  if (score >= 50) return "Needs Improvement";
  return "Major Issues";
}

const resolveText = (v: Check["pass"], c: Ctx, fallback: string) =>
  typeof v === "function" ? v(c) : (v ?? fallback);

export function isSimulationGraded(p: Pick<Problem, "sim">): boolean {
  return !!p.sim && (!!p.sim.sustainedRps || !!p.sim.budgetMaxUsd || !!p.sim.memory || !!p.sim.db || !!p.sim.queue || !!p.sim.cdn || !!p.sim.shards || !!p.sim.isolation);
}

export function liveRequirementChecks(problem: Problem, graph: Graph): boolean[] | null {
  try {
    const c = makeCtx(graph, problem.sim);
    return problem.checks.map((ch) => {
      try {
        return !!ch.test(c);
      } catch {
        return false;
      }
    });
  } catch {
    return null;
  }
}

function outcomesFor(checks: Check[], c: Ctx): RuleOutcome[] {
  return checks.map((ch, i) => {
    let passed = false;
    try {
      passed = !!ch.test(c);
    } catch {
      passed = false;
    }
    const points = ch.points ?? (ch.soft ? 5 : 10);
    const label = ch.label ?? CATEGORY_LABELS[ch.category ?? "quality"] ?? String(ch.category);
    return {
      id: `rule-${i}`,
      label,
      text: ch.text,
      passed,
      earned: passed ? points : 0,
      points,
      message: passed ? resolveText(ch.pass, c, ch.text) : resolveText(ch.fail, c, `Not met: ${ch.text}`),
      recommendation: passed ? undefined : (ch.fix ?? ch.text),
      soft: !!ch.soft,
      bonus: !!ch.bonus,
      kind: ch.bonus ? "bonus" : ch.soft ? "quality" : "requirement",
    };
  });
}

/** Extra quality signals every design is judged on, beyond the stated requirements. */
function qualityChecks(problem: Problem): Check[] {
  const extra: Check[] = [];
  extra.push({
    text: "Every component on the canvas participates in the design.",
    category: "validity",
    label: "Architecture Validity",
    soft: true,
    points: 5,
    test: (c) => c.orphans().length === 0,
    pass: "Every component is wired into the request or data path.",
    fail: (c) =>
      `${c.orphans().length} component${c.orphans().length === 1 ? " is" : "s are"} not connected to anything (${c
        .orphans()
        .map((n) => n.type.replace(/-/g, " "))
        .join(", ")}).`,
    fix: "Connect or remove components that sit alone on the canvas; an unconnected box does nothing in production.",
  });
  const sim = problem.sim;
  if (sim?.sustainedRps && sim.cpuMaxPercent && !sim.memory) {
    const cpuMax = sim.cpuMaxPercent;
    const rps = sim.sustainedRps;
    extra.push({
      text: "Servers run with sensible headroom, neither saturated nor idle.",
      category: "utilization",
      label: "Resource Utilization",
      soft: true,
      points: 10,
      test: (c) => {
        const t = c.load(rps, cpuMax);
        if (!t.perServer.length) return false;
        const avg = t.perServer.reduce((s, r) => s + r.cpuPercent, 0) / t.perServer.length;
        return avg >= Math.min(45, cpuMax - 25) && avg <= cpuMax;
      },
      pass: (c) => {
        const t = c.load(rps, cpuMax);
        const avg = Math.round(t.perServer.reduce((s, r) => s + r.cpuPercent, 0) / Math.max(1, t.perServer.length));
        return `Average application CPU ${avg}% under sustained load, inside the healthy band.`;
      },
      fail: (c) => {
        const t = c.load(rps, cpuMax);
        if (!t.perServer.length) return "No application server receives traffic.";
        const avg = Math.round(t.perServer.reduce((s, r) => s + r.cpuPercent, 0) / t.perServer.length);
        return avg > cpuMax
          ? `Average application CPU ${avg}% is above the ${cpuMax}% target.`
          : `Average application CPU is only ${avg}%; the fleet is larger than this traffic needs.`;
      },
      fix: "Right-size the fleet: enough capacity for the target with headroom, without paying for idle servers.",
    });
  }
  return extra;
}

function warningsFor(problem: Problem, c: Ctx): string[] {
  const w: string[] = [];
  const topo = c.topology();
  const lb = topo.entry?.type === "load-balancer" ? topo.entry : null;
  if (lb && topo.servers.length > 1) {
    const caps = topo.servers.map((s) => E.serverCapacityRps(s));
    const uneven = Math.max(...caps) !== Math.min(...caps);
    if (uneven && E.algorithmOf(lb) === "Round Robin")
      w.push("Round Robin sends every server the same share of traffic; smaller servers in an uneven fleet will saturate first.");
    if (E.str(lb.config.healthChecks) !== "Enabled" && !c.has("health-check"))
      w.push("Health checks are disabled, so a crashed server keeps receiving its share of requests until someone notices.");
  }
  if (topo.unreachable.length) w.push(`${topo.unreachable.length} application server(s) receive no traffic from the entry point.`);
  if (problem.sim?.budgetMaxUsd !== undefined) {
    const cost = c.cost();
    const budget = problem.sim.budgetMaxUsd;
    if (cost > budget) w.push(`Monthly cost $${cost.toLocaleString()} is over the $${budget.toLocaleString()} budget.`);
  }
  const sticky = c.is("load-balancer", "sessionAffinity", "Enabled");
  if (sticky && c.is("application-server", "sessionStorage", "Local memory"))
    w.push("Sticky sessions keep users on one server, but sessions held only in that server's memory still vanish if it crashes.");
  return w;
}

export function evaluateChecks(problem: Problem, checks: Check[], graph: Graph, sim = problem.sim): EvaluationResult {
  const c = makeCtx(graph, sim);
  const graded = isSimulationGraded({ sim }) ? "simulation" : "checklist";
  const base = outcomesFor(checks, c);
  const quality = outcomesFor(qualityChecks({ ...problem, sim }), c);
  const all = [...base, ...quality];
  const counted = all.filter((o) => !o.bonus);
  const max = counted.reduce((s, o) => s + o.points, 0) || 1;
  const earned = counted.reduce((s, o) => s + o.earned, 0);
  const bonusEarned = all.filter((o) => o.bonus).reduce((s, o) => s + o.earned, 0);
  const score = Math.min(100, Math.round(((earned + bonusEarned) / max) * 100));
  const hardOk = base.filter((o) => !o.soft && !o.bonus).every((o) => o.passed);
  const passingScore = problem.passingScore;
  const passed = hardOk && score >= passingScore;

  // group into categories
  const groups = new Map<string, { label: string; rules: RuleOutcome[] }>();
  [...checks, ...qualityChecks({ ...problem, sim })].forEach((ch, i) => {
    const o = all[i];
    if (o.bonus) return;
    const key = String(ch.category ?? "quality");
    const label = CATEGORY_LABELS[key] ?? key;
    if (!groups.has(key)) groups.set(key, { label, rules: [] });
    groups.get(key)!.rules.push(o);
  });
  const categories: CategoryOutcome[] = [...groups.entries()]
    .sort(([a], [b]) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([key, { label, rules }]) => {
      const failing = rules.find((r) => !r.passed);
      return {
        key,
        label,
        earned: rules.reduce((s, r) => s + r.earned, 0),
        max: rules.reduce((s, r) => s + r.points, 0),
        message: failing ? failing.message : rules[rules.length - 1].message,
        rules: rules.length > 1 ? rules : undefined,
      };
    });

  const recommendations = all.filter((o) => !o.passed && o.recommendation).map((o) => o.recommendation!) as string[];
  const result: EvaluationResult = {
    score,
    maxScore: 100,
    passed,
    passingScore,
    band: bandFor(score),
    graded,
    costUsd: c.cost(),
    budgetUsd: sim?.budgetMaxUsd ?? null,
    categories,
    outcomes: all,
    warnings: graded === "simulation" ? warningsFor({ ...problem, sim }, c) : [],
    recommendations: [...new Set(recommendations)].slice(0, 6),
    flow: E.describeFlow(graph),
  };
  if (sim?.sustainedRps) {
    result.sustained = c.load(sim.sustainedRps, sim.cpuMaxPercent ?? 80);
    if (sim.peakRps && sim.peakRps !== sim.sustainedRps) result.peak = c.load(sim.peakRps, sim.cpuMaxPercent ?? 80);
    if (sim.failureTest) result.failureTest = c.failure(sim.sustainedRps, sim.cpuMaxPercent ?? 80);
  }
  return result;
}

export function evaluateDesign(problem: Problem, graph: Graph): EvaluationResult {
  return evaluateChecks(problem, problem.checks, graph);
}

export interface ScenarioResult {
  id: string;
  label: string;
  narrative: string;
  required: boolean;
  locked: boolean;
  result: EvaluationResult;
}

export function evaluateScenarios(problem: Problem, graph: Graph): ScenarioResult[] {
  const scenarios: Scenario[] = problem.scenarios ?? [];
  const results = scenarios.map((s) => {
    const result = evaluateChecks(problem, s.checks, graph, s.sim ?? problem.sim);
    return { id: s.id, label: s.label, narrative: s.narrative, required: s.required, locked: false, result };
  });
  const allRequiredPass = results.filter((r) => r.required).every((r) => r.result.passed);
  return results.map((r) => (r.required ? r : { ...r, locked: !allRequiredPass }));
}
