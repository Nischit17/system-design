import type { ProblemDef } from "../types";
import { appTier, budget, capacityAtLeast, column, configIs, cpuCeiling, fmt, healthChecksOn, lbEntry, numberAtLeast, rule, serversBehindLb, survivesServerLoss } from "../builders";
import type { Ctx } from "@/lib/sim/evaluate";
import type { GraphSpec } from "@/lib/sim/graph";
import * as E from "@/lib/sim/engine";

type NodeSpec = GraphSpec["nodes"][number];

const AS = "/tracks/production-operations-advanced/sections/advanced-software-system-architecture-section-7";
const OB = "/tracks/production-operations-advanced/sections/advanced-software-system-architecture-section-8";
const DP = "/tracks/production-operations-advanced/sections/advanced-software-system-architecture-section-9";
const CO = "/tracks/production-operations-advanced/sections/advanced-software-system-architecture-section-10";

const PERCENTILES = "Percentiles (p50/p95/p99)";
const apps = (c: Ctx) => c.nodes("application-server");
/** The autoscaling policy attached (either edge direction) to a node of this type. */
const scalerOf = (c: Ctx, type: string) => c.nodes("auto-scaling").find((s) => c.nodes(type).some((n) => E.linkedEitherWay(c.g, s.id, n.id)));
const attached = (c: Ctx, nodeId: string) => c.nodes("auto-scaling").find((s) => E.linkedEitherWay(c.g, s.id, nodeId));
const perInstance = (n: ReturnType<Ctx["nodes"]>[number]) => E.serverCapacityRps({ ...n, config: { ...n.config, instances: 1 } });
/** Instance count once the attached autoscaler has scaled all the way out. */
const scaledInstances = (c: Ctx, n: ReturnType<Ctx["nodes"]>[number]) => {
  const s = attached(c, n.id);
  return s ? Math.max(E.instancesOf(n), E.num(s.config.max, 1)) : E.instancesOf(n);
};
const peakCapacity = (c: Ctx) => c.topology().servers.reduce((sum, s) => sum + perInstance(s) * scaledInstances(c, s), 0);
const baseCapacity = (c: Ctx) => c.topology().servers.reduce((sum, s) => sum + E.serverCapacityRps(s), 0);
const percentileMetrics = (c: Ctx) => c.is("metrics-store", "aggregation", PERCENTILES);

/* ---------------- Autoscaling & Capacity Management ---------------- */

const JOB_RATE = 5;
const STEADY_JOBS = 20;
const BURST_JOBS = 36000;
const thumbWorkers = (c: Ctx) => c.nodes("worker").filter((w) => E.incoming(c.g, w.id).some((n) => n.type === "message-queue"));
const workerBase = (c: Ctx) => thumbWorkers(c).reduce((sum, w) => sum + E.instancesOf(w), 0);
const workerMax = (c: Ctx) => thumbWorkers(c).reduce((sum, w) => sum + scaledInstances(c, w), 0);
const drainMinutes = (c: Ctx) => {
  const net = workerMax(c) * JOB_RATE - STEADY_JOBS;
  return net > 0 ? BURST_JOBS / net / 60 : Infinity;
};
const thumbNodes = (p: string, worker: number, scaler: Record<string, string | number>): NodeSpec[] => [
  { id: `${p}api`, type: "application-server", x: 40, y: 200, config: { size: "Medium" } },
  { id: `${p}q`, type: "message-queue", x: 300, y: 200, config: { retry: "Enabled", maxRetries: 5, dlqEnabled: "Enabled" } },
  { id: `${p}workers`, type: "worker", x: 560, y: 200, config: { instances: worker, idempotent: "Enabled" } },
  { id: `${p}as`, type: "auto-scaling", x: 560, y: 40, config: scaler },
  { id: `${p}store`, type: "object-storage", x: 820, y: 200 },
];
const thumbEdges = (p: string) => [
  { source: `${p}api`, target: `${p}q` },
  { source: `${p}q`, target: `${p}workers` },
  { source: `${p}as`, target: `${p}workers` },
  { source: `${p}workers`, target: `${p}store` },
];
const wrongSignal: ProblemDef = {
  code: "SSA0065",
  slug: "scaling-on-the-wrong-signal",
  title: "Scaling on the Wrong Signal",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Glimmer's thumbnail workers autoscale on CPU. The jobs spend most of their time waiting on object storage, so CPU sits near 30% while the morning upload burst leaves 36,000 jobs queued for two hours. Each worker instance completes 5 jobs per second and steady traffic is 20 jobs per second. Scale on a signal that reflects the real backlog, and clear the burst within 15 minutes.",
  guide: {
    title: "Required processing path",
    description: "Workers drain the queue; the autoscaler watches the backlog, not CPU.",
    flow: ["application-server", "message-queue", "worker", "object-storage"],
    secondary: { title: "Scaling policy", flow: ["auto-scaling", "worker"] },
    notes: ["The worker's Instances field is the always-on fleet; the scaler's max is the fleet at full scale."],
  },
  concepts: ["Choosing a scaling signal", "Backlog-driven autoscaling"],
  reading: [{ title: "Autoscaling learning path", description: "Review scaling signals.", href: `${AS}#signals` }],
  components: ["application-server", "message-queue", "worker", "auto-scaling", "object-storage"],
  checks: [
    rule("Feed thumbnail jobs from a queue to a worker pool.", (c) => c.path("message-queue", "worker"), { category: "validity", label: "Job path" }),
    rule("Scale the workers on queue depth / backlog.", (c) => E.str(scalerOf(c, "worker")?.config.metric) === "Queue depth / backlog", {
      category: "Scaling signal",
      label: "Backlog signal",
      points: 25,
      fail: (c) =>
        scalerOf(c, "worker")
          ? `The policy scales on ${E.str(scalerOf(c, "worker")!.config.metric)}; these workers wait on I/O, so CPU stays low while the queue grows.`
          : "No autoscaling policy is attached to the workers.",
    }),
    rule("Keep enough workers always on that steady traffic (20 jobs/s) runs at 80% or less.", (c) => workerBase(c) * JOB_RATE * 0.8 >= STEADY_JOBS, {
      category: "capacity",
      label: "Steady state",
      fail: (c) => `${workerBase(c)} always-on worker(s) complete ${workerBase(c) * JOB_RATE} jobs/s; 20 jobs/s at 80% needs 5 workers.`,
    }),
    rule("Scale out far enough to clear a 36,000-job burst within 15 minutes.", (c) => drainMinutes(c) <= 15, {
      category: "capacity",
      label: "Burst drain",
      points: 20,
      pass: (c) => `At full scale the burst clears in ${Math.round(drainMinutes(c))} minutes.`,
      fail: (c) => (Number.isFinite(drainMinutes(c)) ? `At full scale the burst takes ${Math.round(drainMinutes(c))} minutes to clear.` : "At full scale the workers can't keep up with steady traffic."),
    }),
  ],
  reference: {
    config: ["5 always-on workers (25 jobs/s, 80% at steady state).", "Auto Scaling on queue depth / backlog, min 5, max 14: 70 jobs/s clears the burst in 12 minutes."],
    explanation: [
      "CPU only tracks load for CPU-bound work. I/O-bound workers can be fully busy at 30% CPU, so a CPU policy never fires.",
      "Backlog is the signal users actually feel: when jobs pile up, add workers; when the queue is empty, shrink.",
    ],
    graph: { nodes: thumbNodes("", 5, { metric: "Queue depth / backlog", min: 5, max: 14, targetPercent: 70 }), edges: thumbEdges("") },
  },
  fix: {
    description: "Glimmer's workers scale on CPU (min 2, max 4). CPU never passes 30%, the policy never fires, and the morning burst takes two hours to clear. Repair the scaling policy.",
    starting: { nodes: thumbNodes("fx-", 2, { metric: "CPU utilization", min: 2, max: 4, targetPercent: 70 }), edges: thumbEdges("fx-") },
    metrics: { rps: 20, trafficUnit: "jobs/s", appCpuPercent: 30, monthlyCostUsd: 525, p95Ms: 7200000 },
  },
};

const SPIKE_RPS = 2000;
const readyIn60s = (c: Ctx) =>
  c.topology().servers.reduce((sum, s) => {
    const sc = attached(c, s.id);
    const warm = sc ? Math.min(E.num(sc.config.warmPool), Math.max(0, E.num(sc.config.max, 1) - E.instancesOf(s))) : 0;
    return sum + perInstance(s) * (E.instancesOf(s) + warm);
  }, 0);
const campaignNodes = (p: string, scaler: Record<string, string | number>): NodeSpec[] => [
  { id: `${p}lb`, type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
  { id: `${p}app`, type: "application-server", x: 340, y: 200, config: { size: "Large", instances: 1, coldStartSeconds: 240 } },
  { id: `${p}as`, type: "auto-scaling", x: 340, y: 40, config: scaler },
];
const campaignEdges = (p: string) => [
  { source: `${p}lb`, target: `${p}app` },
  { source: `${p}as`, target: `${p}app` },
];
const tooLate: ProblemDef = {
  code: "SSA0066",
  slug: "scale-out-arrives-too-late",
  title: "Scale-Out Arrives Too Late",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Petalbox serves 500 RPS most of the time. When a push campaign goes out, traffic reaches 2,000 RPS within 60 seconds. The autoscaler reacts, but new Large instances take four minutes to boot, so the spike is over, and full of errors, before they arrive. Have enough capacity serving within 60 seconds, without running the full spike fleet all day.",
  guide: {
    title: "Required request path",
    description: "A small always-on fleet plus pre-initialized warm instances that join in seconds.",
    flow: ["load-balancer", "application-server"],
    secondary: { title: "Scaling policy", flow: ["auto-scaling", "application-server"] },
    notes: ["Warm-pool instances are already booted and join the fleet in seconds.", "Cold instances still take four minutes."],
  },
  concepts: ["Warm pools", "Scale-out lag"],
  reading: [{ title: "Autoscaling learning path", description: "Review scaling speed.", href: `${AS}#warm-pools` }],
  components: ["load-balancer", "application-server", "auto-scaling"],
  checks: [
    lbEntry(),
    rule("Attach an autoscaling policy to the application servers.", (c) => !!scalerOf(c, "application-server"), { category: "validity", label: "Scaling policy" }),
    rule("Have capacity for 2,000 RPS at 80% CPU within 60 seconds of the spike.", (c) => readyIn60s(c) * 0.8 >= SPIKE_RPS, {
      category: "capacity",
      label: "Ready in 60 s",
      points: 25,
      fail: (c) => `Only ${fmt(readyIn60s(c))} RPS can be serving within 60 seconds; 2,000 RPS at 80% needs 2,500.`,
    }),
    rule("Keep warm-pool instances ready so scale-out takes seconds, not minutes.", (c) => E.num(scalerOf(c, "application-server")?.config.warmPool) > 0, {
      category: "Scaling speed",
      label: "Warm pool",
      points: 15,
    }),
    rule("Keep the always-on fleet small: 500 RPS should run at 45% CPU or more.", (c) => baseCapacity(c) > 0 && 500 / baseCapacity(c) >= 0.45, {
      category: "cost",
      label: "Baseline size",
      fail: (c) => `The always-on fleet provides ${fmt(baseCapacity(c))} RPS, so baseline traffic runs at ${Math.round((500 / Math.max(1, baseCapacity(c))) * 100)}% and you pay for idle servers all day.`,
    }),
  ],
  reference: {
    config: ["One always-on Large instance (500 RPS at 63%).", "Auto Scaling: min 1, max 6, warm pool 3, 30 s cooldown. Within 60 s: 4 x 800 = 3,200 RPS (63% at 2,000 RPS)."],
    explanation: [
      "Autoscaling can only help as fast as new capacity arrives. With four-minute boots, the decision is right and the timing is wrong.",
      "A warm pool keeps instances booted but idle, so they join in seconds and cost far less than running them in the fleet.",
    ],
    graph: { nodes: campaignNodes("", { metric: "Request concurrency", min: 1, max: 6, warmPool: 3, scaleOutCooldownSec: 30, targetPercent: 60 }), edges: campaignEdges("") },
  },
  fix: {
    description: "Petalbox's autoscaler adds cold instances during push campaigns, but they take four minutes to boot. Each campaign causes about three minutes of errors before capacity arrives. Repair the scaling setup.",
    starting: { nodes: campaignNodes("fx-", { metric: "CPU utilization", min: 1, max: 6, warmPool: 0, scaleOutCooldownSec: 300, targetPercent: 70 }), edges: campaignEdges("fx-") },
    metrics: { rps: 2000, appCpuPercent: 100, monthlyCostUsd: 800, p95Ms: 6200, errorRatePercent: 38 },
  },
};

const PEAK_DB_RPS = 6000;
const peakConnections = (c: Ctx) => {
  const primary = E.primaryDbNode(c.g);
  if (!primary) return Infinity;
  const pools = c.nodes("connection-pool").filter((p) => E.linked(c.g, p.id, primary.id));
  const direct = apps(c).filter((a) => E.linked(c.g, a.id, primary.id));
  return (
    direct.reduce((sum, a) => sum + scaledInstances(c, a) * Math.max(1, E.num(a.config.dbConnectionsPerInstance, 20)), 0) +
    pools.reduce((sum, p) => sum + Math.max(1, E.num(p.config.maxServerConnections, 100)), 0)
  );
};
const dbMaxConnections = (c: Ctx) => E.num(E.primaryDbNode(c.g)?.config.maxConnections, 100);
const tookDownDb: ProblemDef = {
  code: "SSA0067",
  slug: "scaling-up-took-down-the-database",
  title: "Scaling Up Took Down the Database",
  difficulty: "Hard",
  minutes: 20,
  description:
    "During Ironwood's flash sale the autoscaler kept adding app servers, each opening 50 connections to PostgreSQL. At the eleventh instance the database hit its 500-connection limit and refused every new connection, so adding servers made the outage worse. Serve the 6,000 RPS peak at 80% CPU or less while keeping the database inside its limits as the fleet grows.",
  guide: {
    title: "Required request path",
    description: "Pool connections in front of the database and make scaling aware of the database's health.",
    flow: ["load-balancer", "application-server", "connection-pool", "postgresql"],
    secondary: { title: "Scaling policy", flow: ["auto-scaling", "application-server"] },
    notes: ["Transaction pooling lets many app connections share a few database connections."],
  },
  concepts: ["Downstream-aware scaling", "Connection budgets"],
  reading: [{ title: "Autoscaling learning path", description: "Review scaling with dependencies.", href: `${AS}#downstream` }],
  components: ["load-balancer", "application-server", "auto-scaling", "connection-pool", "postgresql"],
  checks: [
    lbEntry(),
    rule("Scale out far enough to serve 6,000 RPS at 80% CPU or less.", (c) => peakCapacity(c) * 0.8 >= PEAK_DB_RPS, {
      category: "capacity",
      label: "Peak capacity",
      points: 15,
      fail: (c) => `At full scale the fleet provides ${fmt(peakCapacity(c))} RPS; 6,000 RPS at 80% needs 7,500.`,
    }),
    rule("Put a connection pool in transaction mode between the servers and PostgreSQL.", (c) => c.path("application-server", "connection-pool", "postgresql") && c.is("connection-pool", "mode", "Transaction"), {
      category: "Connections",
      label: "Pooling",
      points: 20,
    }),
    rule("Keep database connections at full scale within PostgreSQL's limit.", (c) => peakConnections(c) <= dbMaxConnections(c), {
      category: "Connections",
      label: "Connection budget",
      points: 15,
      pass: (c) => `At full scale the database sees ${fmt(peakConnections(c))} of ${fmt(dbMaxConnections(c))} connections.`,
      fail: (c) => `At full scale the database would see ${fmt(peakConnections(c))} connections against a limit of ${fmt(dbMaxConnections(c))}.`,
    }),
    configIs("auto-scaling", "downstreamAware", "Enabled", "Make scaling downstream-aware so the fleet stops growing when the database is saturated.", "Scaling signal", 15, { label: "Downstream-aware" }),
  ],
  reference: {
    config: [
      "Large servers: 3 always on, Auto Scaling on CPU to max 10 (8,000 RPS, 75% at peak), downstream-aware.",
      "Connection pool (transaction mode, 200 server connections) in front of a Large PostgreSQL with 500 max connections.",
    ],
    explanation: [
      "Every app instance adds connections, but the database's limit doesn't grow with the fleet. Past that limit, more servers means more failures.",
      "A transaction-mode pool caps database connections no matter how many app instances exist; downstream awareness stops scale-out that the database can't absorb.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
        { id: "app", type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 3, dbConnectionsPerInstance: 50 } },
        { id: "as", type: "auto-scaling", x: 300, y: 40, config: { metric: "CPU utilization", min: 3, max: 10, targetPercent: 70, downstreamAware: "Enabled" } },
        { id: "pool", type: "connection-pool", x: 560, y: 200, config: { maxServerConnections: 200, mode: "Transaction" } },
        { id: "db", type: "postgresql", x: 820, y: 200, config: { size: "Large", maxConnections: 500 } },
      ],
      edges: [
        { source: "lb", target: "app" },
        { source: "as", target: "app" },
        { source: "app", target: "pool" },
        { source: "pool", target: "db" },
      ],
    },
  },
  fix: {
    description: "Ironwood's autoscaler can grow to 30 instances that each open 50 database connections, against a 500-connection limit. Last sale, scale-out exhausted the database and every request failed. Repair the scaling and connection setup.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
        { id: "fx-app", type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 3, dbConnectionsPerInstance: 50 } },
        { id: "fx-as", type: "auto-scaling", x: 300, y: 40, config: { metric: "CPU utilization", min: 3, max: 30, targetPercent: 70 } },
        { id: "fx-db", type: "postgresql", x: 600, y: 200, config: { size: "Large", maxConnections: 500 } },
      ],
      edges: [
        { source: "fx-lb", target: "fx-app" },
        { source: "fx-as", target: "fx-app" },
        { source: "fx-app", target: "fx-db" },
      ],
    },
    metrics: { rps: 6000, appCpuPercent: 64, monthlyCostUsd: 7500, dbConnections: 550, errorRatePercent: 46 },
  },
};

const FORECAST = 5800;
const zoneGroups = column("zone", "application-server", 3, 380, 220, { size: "Large", instances: 5 }, 150);
const blackFriday: ProblemDef = {
  code: "SSA0068",
  slug: "black-friday-capacity-plan",
  title: "Black Friday Capacity Plan",
  difficulty: "Hard",
  minutes: 25,
  sectionChallenge: true,
  description:
    "Larchmont normally serves 1,500 RPS, and marketing forecasts 5,800 RPS for Black Friday. Plan the event fleet: stay at or below 75% CPU at the forecast, keep serving at 75% or less even if a whole availability zone fails at peak, and keep the app tier (load balancer plus servers) within $10,000 for the event month. Run one server group per availability zone, in at least three zones.",
  guide: {
    title: "Required request path",
    description: "One load balancer with health checks in front of a server group in each availability zone.",
    flow: ["load-balancer", "application-server"],
    notes: ["The failure test takes the largest server group out of rotation.", "Plan for N+1 zones, not N+1 servers."],
  },
  concepts: ["Capacity planning", "Zone-level redundancy"],
  reading: [{ title: "Autoscaling learning path", description: "Review capacity plans for known peaks.", href: `${AS}#capacity-plans` }],
  components: ["load-balancer", "application-server", "health-check"],
  sim: { sustainedRps: FORECAST, peakRps: FORECAST, cpuMaxPercent: 75, failureTest: true, budgetMaxUsd: 10000, budgetTypes: ["load-balancer", "application-server"] },
  checks: [
    lbEntry(),
    serversBehindLb(),
    healthChecksOn(),
    cpuCeiling(FORECAST, 75),
    rule("Run one server group per availability zone, in at least three zones.", (c) => c.topology().servers.length >= 3, { category: "reliability", label: "Three zones" }),
    survivesServerLoss(FORECAST, 75),
    budget(10000, "the app tier", 15, ["load-balancer", "application-server"]),
  ],
  reference: {
    config: [
      "Three zone groups of 5 Large instances (12,000 RPS, 48% at forecast).",
      "Losing a zone leaves 10 instances (8,000 RPS, 73% at forecast).",
      "Cost: $180 + 15 x $620 = $9,480.",
    ],
    explanation: [
      "A plan that only covers the forecast fails the moment something breaks. Size so the survivors still have headroom.",
      "With three zones you only pay for 50% extra; with two you'd need 100% extra to survive losing one.",
      "Three groups of 9 Medium instances also pass at $9,090, with less headroom per instance.",
    ],
    graph: {
      nodes: [{ id: "lb", type: "load-balancer", x: 40, y: 220, config: { healthChecks: "Enabled" } }, ...zoneGroups],
      edges: zoneGroups.map((z) => ({ source: "lb", target: z.id })),
    },
  },
  fix: {
    description: "Last Black Friday Larchmont ran one group of 8 Large servers in a single zone. At 5,800 RPS CPU hit 91%, and a zone outage would have taken the whole site down. Repair the plan for this year.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 40, y: 220 },
        { id: "fx-app", type: "application-server", x: 380, y: 220, config: { size: "Large", instances: 8 } },
      ],
      edges: [{ source: "fx-lb", target: "fx-app" }],
    },
    metrics: { rps: 5800, appCpuPercent: 91, monthlyCostUsd: 5140, p95Ms: 1900, errorRatePercent: 4 },
  },
};

/* ---------------- Observability & Production Diagnostics ---------------- */

const averageNodes = (p: string, aggregation: string, retentionDays: number, viaCollector: boolean): NodeSpec[] => [
  { id: `${p}lb`, type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
  { id: `${p}app`, type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 2 } },
  { id: `${p}db`, type: "postgresql", x: 580, y: 60 },
  ...(viaCollector ? [{ id: `${p}collector`, type: "telemetry-collector", x: 580, y: 330, config: { bufferMinutes: 10, samplingPercent: 100 } }] : []),
  { id: `${p}metrics`, type: "metrics-store", x: 860, y: 330, config: { aggregation, retentionDays } },
];
const averageEdges = (p: string, viaCollector: boolean) => [
  { source: `${p}lb`, target: `${p}app` },
  { source: `${p}app`, target: `${p}db` },
  ...(viaCollector
    ? [
        { source: `${p}app`, target: `${p}collector` },
        { source: `${p}collector`, target: `${p}metrics` },
      ]
    : [{ source: `${p}app`, target: `${p}metrics` }]),
];
const averageLooksFine: ProblemDef = {
  code: "SSA0069",
  slug: "the-average-looks-fine",
  title: "The Average Looks Fine",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Ashgrove's dashboard shows an average latency of 120 ms and nobody gets paged, yet support says checkout is painfully slow for some customers. One request in twenty takes more than four seconds, and the average hides it. Build a metrics pipeline that shows the tail, and keep enough history to compare with last month.",
  guide: {
    title: "Required telemetry path",
    description: "Servers send telemetry to a collector, which writes percentile metrics to a metrics store.",
    flow: ["application-server", "telemetry-collector", "metrics-store"],
    notes: ["An average of 120 ms is consistent with 5% of requests taking several seconds."],
  },
  concepts: ["Percentile metrics", "Tail latency"],
  reading: [{ title: "Observability learning path", description: "Review latency percentiles.", href: `${OB}#percentiles` }],
  components: ["load-balancer", "application-server", "postgresql", "telemetry-collector", "metrics-store"],
  checks: [
    rule("Send telemetry from the application servers to a telemetry collector.", (c) => c.edge("application-server", "telemetry-collector"), { category: "validity", label: "Collection" }),
    rule("Store metrics in a metrics store fed by the collector.", (c) => c.path("telemetry-collector", "metrics-store"), { category: "validity", label: "Storage" }),
    configIs("metrics-store", "aggregation", PERCENTILES, "Record latency as percentiles (p50/p95/p99), not just the average.", "Visibility", 25, { label: "Percentiles" }),
    numberAtLeast("metrics-store", "retentionDays", 30, "Keep at least 30 days of metrics so you can compare with last month.", "Visibility", 10, { label: "Retention" }),
    rule("Keep telemetry off the request path: servers hand data to a collector rather than writing to storage directly.", (c) => !c.edge("application-server", "metrics-store"), { label: "Decoupled telemetry" }),
  ],
  reference: {
    config: ["App servers -> telemetry collector -> metrics store (percentiles, 90-day retention)."],
    explanation: [
      "Averages blend the fast majority with the slow minority. p95 and p99 show what your unluckiest users experience, which is what they remember.",
      "Alert on p99, not the mean, and the four-second tail pages someone the day it appears.",
    ],
    graph: { nodes: averageNodes("", PERCENTILES, 90, true), edges: averageEdges("", true) },
  },
  fix: {
    description: "Ashgrove's servers write averages straight to a metrics store with 7 days of retention. Average latency reads 120 ms while 5% of checkouts take over four seconds. Repair the metrics pipeline.",
    starting: { nodes: averageNodes("fx-", "Average only", 7, false), edges: averageEdges("fx-", false) },
    metrics: { rps: 1400, appCpuPercent: 51, monthlyCostUsd: 1720, p50Ms: 95, p95Ms: 4100, p99Ms: 7800 },
  },
};

const traceNodes = (p: string, samplingPercent: number, tailSampling: string, bothServices: boolean): { nodes: NodeSpec[]; edges: { source: string; target: string }[] } => ({
  nodes: [
    { id: `${p}lb`, type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
    { id: `${p}api`, type: "application-server", x: 300, y: 120, config: { size: "Large", instances: 2 } },
    { id: `${p}payments`, type: "application-server", x: 560, y: 120, config: { size: "Medium" } },
    { id: `${p}collector`, type: "telemetry-collector", x: 430, y: 340, config: { bufferMinutes: 10, samplingPercent: 100 } },
    { id: `${p}traces`, type: "trace-store", x: 720, y: 340, config: { samplingPercent, tailSampling } },
  ],
  edges: [
    { source: `${p}lb`, target: `${p}api` },
    { source: `${p}api`, target: `${p}payments` },
    { source: `${p}api`, target: `${p}collector` },
    ...(bothServices ? [{ source: `${p}payments`, target: `${p}collector` }] : []),
    { source: `${p}collector`, target: `${p}traces` },
  ],
});
const droppedTrace: ProblemDef = {
  code: "SSA0070",
  slug: "the-trace-we-needed-was-dropped",
  title: "The Trace We Needed Was Dropped",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Rowan Pay keeps a random 1% of traces, chosen when each request starts. The intermittent payment failures they need to debug happen in about 1 request in 2,000, so the matching trace is almost never kept. Keep every error and slow request, keep a small sample of normal traffic for cost, and trace across both services.",
  guide: {
    title: "Required telemetry path",
    description: "Both services send spans to one collector; the trace store decides what to keep after each trace completes.",
    flow: ["application-server", "telemetry-collector", "trace-store"],
    notes: ["Head sampling decides before anyone knows whether the request will fail."],
  },
  concepts: ["Tail-based sampling", "Distributed tracing"],
  reading: [{ title: "Observability learning path", description: "Review trace sampling.", href: `${OB}#tracing` }],
  components: ["load-balancer", "application-server", "telemetry-collector", "trace-store"],
  checks: [
    rule("Send spans from the services to a collector that writes to a trace store.", (c) => c.path("application-server", "telemetry-collector", "trace-store"), { category: "validity", label: "Trace path" }),
    configIs("trace-store", "tailSampling", "Enabled", "Choose which traces to keep after they finish (tail sampling), so every error and slow trace is kept.", "Visibility", 25, { label: "Tail sampling" }),
    rule("Keep 10% or less of ordinary traces to control storage cost.", (c) => c.nodes("trace-store").some((t) => E.num(t.config.samplingPercent) > 0 && E.num(t.config.samplingPercent) <= 10), { category: "cost", label: "Baseline sample" }),
    rule("Trace across service boundaries: every service sends spans to the collector.", (c) => apps(c).length >= 2 && c.every("application-server", "telemetry-collector"), { label: "End-to-end traces" }),
  ],
  reference: {
    config: ["API and payments services -> telemetry collector -> trace store (tail sampling on, 5% of normal traces)."],
    explanation: [
      "Head sampling throws away 99% of traces before anyone knows which ones matter. Tail sampling waits for the outcome, then keeps every error and slow trace.",
      "A small random sample of healthy traffic stays as a baseline for comparison.",
    ],
    graph: traceNodes("", 5, "Enabled", true),
  },
  fix: {
    description: "Rowan Pay samples 1% of traces at the start of each request, and only the API service reports spans. Engineers have never captured a trace of the failing payments. Repair the tracing setup.",
    starting: traceNodes("fx-", 1, "Disabled", false),
    metrics: { rps: 900, appCpuPercent: 42, monthlyCostUsd: 1730, errorRatePercent: 0.05 },
  },
};

const queueAgeNodes = (p: string, healthy: boolean): NodeSpec[] => [
  { id: `${p}orders`, type: "application-server", x: 40, y: 200, config: { size: "Medium" } },
  { id: `${p}q`, type: "message-queue", x: 300, y: 200, config: healthy ? { retry: "Enabled", maxRetries: 5, dlqEnabled: "Enabled" } : { retry: "Enabled", maxRetries: 0 } },
  { id: `${p}workers`, type: "worker", x: 560, y: 200, config: { instances: 3, idempotent: "Enabled" } },
  { id: `${p}as`, type: "auto-scaling", x: 560, y: 40, config: healthy ? { metric: "Queue depth / backlog", min: 3, max: 12 } : { metric: "CPU utilization", min: 3, max: 6 } },
  { id: `${p}db`, type: "postgresql", x: 820, y: 200 },
  ...(healthy
    ? [
        { id: `${p}collector`, type: "telemetry-collector", x: 300, y: 380, config: { bufferMinutes: 10, samplingPercent: 100 } },
        { id: `${p}metrics`, type: "metrics-store", x: 560, y: 380, config: { aggregation: PERCENTILES, retentionDays: 30 } },
      ]
    : []),
];
const queueAgeEdges = (p: string, healthy: boolean) => [
  { source: `${p}orders`, target: `${p}q` },
  { source: `${p}q`, target: `${p}workers` },
  { source: `${p}as`, target: `${p}workers` },
  { source: `${p}workers`, target: `${p}db` },
  ...(healthy
    ? [
        { source: `${p}q`, target: `${p}collector` },
        { source: `${p}collector`, target: `${p}metrics` },
      ]
    : []),
];
const oldMessages: ProblemDef = {
  code: "SSA0071",
  slug: "old-messages-short-queue",
  title: "Old Messages, Short Queue",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Overnight, Sablewood's fulfillment consumer silently slowed down. Traffic was low, so the queue never passed its 10,000-message depth alert, but by morning the oldest order had waited three hours. Watch what customers actually feel (how old the oldest message is), make a slowdown add workers on its own, and keep a single poison message from blocking the line.",
  guide: {
    title: "Required processing path",
    description: "Orders flow through a queue to workers; the queue's metrics (depth and oldest-message age) flow to a metrics store.",
    flow: ["application-server", "message-queue", "worker", "postgresql"],
    secondary: { title: "Queue telemetry", flow: ["message-queue", "telemetry-collector", "metrics-store"] },
    notes: ["Depth depends on traffic; age tells you how long customers are waiting."],
  },
  concepts: ["Queue age monitoring", "Backlog alerts"],
  reading: [{ title: "Observability learning path", description: "Review queue health signals.", href: `${OB}#queue-age` }],
  components: ["application-server", "message-queue", "worker", "auto-scaling", "postgresql", "telemetry-collector", "metrics-store"],
  checks: [
    rule("Deliver orders from the queue to fulfillment workers.", (c) => c.path("message-queue", "worker"), { category: "validity", label: "Fulfillment path" }),
    rule("Export queue metrics, including the age of the oldest message, to a telemetry collector.", (c) => c.edge("message-queue", "telemetry-collector"), { category: "Visibility", label: "Queue telemetry", points: 15 }),
    rule("Store queue metrics as percentiles in a metrics store.", (c) => c.path("telemetry-collector", "metrics-store") && percentileMetrics(c), { category: "Visibility", label: "Age percentiles", points: 15 }),
    rule("Scale the workers on queue depth / backlog so a slowdown adds workers.", (c) => E.str(scalerOf(c, "worker")?.config.metric) === "Queue depth / backlog", { category: "Scaling signal", label: "Backlog scaling", points: 15 }),
    rule("Set poison messages aside with bounded retries and a dead-letter queue.", (c) => c.is("message-queue", "dlqEnabled", "Enabled") && c.nodes("message-queue").some((q) => E.num(q.config.maxRetries) > 0), {
      category: "reliability",
      label: "Dead letters",
    }),
  ],
  reference: {
    config: ["Queue (5 retries, DLQ) -> workers scaled on backlog (3 to 12).", "Queue metrics -> telemetry collector -> metrics store (percentiles, 30 days)."],
    explanation: [
      "Depth alerts need a threshold that fits every traffic level, and no single number does. Message age is the customer-facing number: 'orders wait N minutes'.",
      "Scaling on backlog means a slow consumer gets help automatically; the dead-letter queue keeps one bad message from aging the rest.",
    ],
    graph: { nodes: queueAgeNodes("", true), edges: queueAgeEdges("", true) },
  },
  fix: {
    description: "Sablewood monitors only queue depth, scales workers on CPU, and retries failing messages forever. A slow consumer left orders waiting three hours overnight without a single alert. Repair the monitoring and processing setup.",
    starting: { nodes: queueAgeNodes("fx-", false), edges: queueAgeEdges("fx-", false) },
    metrics: { rps: 120, trafficUnit: "orders/s", appCpuPercent: 22, monthlyCostUsd: 760 },
  },
};

const obsServices = column("svc", "application-server", 3, 320, 200, { size: "Medium" }, 130);
const observabilityChallenge: ProblemDef = {
  code: "SSA0072",
  slug: "observability-stack-challenge",
  title: "Observability Stack Challenge",
  difficulty: "Hard",
  minutes: 25,
  sectionChallenge: true,
  description:
    "Kestrel's three services take hours to debug during incidents: metrics are averages, logs are free text kept for three days, and traces are a random 1%. Build one telemetry pipeline that answers the three questions of every incident (is it broken, where, and why), without losing data when a telemetry backend has a blip.",
  guide: {
    title: "Required telemetry path",
    description: "Every service sends to one collector, which buffers and fans out to metrics, logs and traces.",
    flow: ["application-server", "telemetry-collector", "metrics-store"],
    extra: [
      { title: "Logs", flow: ["telemetry-collector", "log-store"] },
      { title: "Traces", flow: ["telemetry-collector", "trace-store"] },
    ],
    notes: ["Metrics tell you that something is wrong, traces tell you where, and logs tell you why."],
  },
  concepts: ["Metrics, logs and traces", "Telemetry pipelines"],
  reading: [{ title: "Observability learning path", description: "Review how the three signals fit together.", href: `${OB}#pipelines` }],
  components: ["load-balancer", "application-server", "telemetry-collector", "metrics-store", "log-store", "trace-store"],
  checks: [
    rule("Send telemetry from every service to a collector.", (c) => apps(c).length >= 3 && c.every("application-server", "telemetry-collector"), { category: "validity", label: "Collection" }),
    rule("Store percentile metrics for at least 30 days.", (c) => c.path("telemetry-collector", "metrics-store") && percentileMetrics(c) && c.nodes("metrics-store").some((m) => E.num(m.config.retentionDays) >= 30), {
      category: "Visibility",
      label: "Metrics",
      points: 15,
    }),
    rule("Store structured, searchable logs for at least 14 days.", (c) =>
      c.path("telemetry-collector", "log-store") && c.nodes("log-store").some((l) => E.str(l.config.structured) === "Enabled" && E.num(l.config.retentionDays) >= 14), {
      category: "Visibility",
      label: "Logs",
      points: 15,
    }),
    rule("Keep traces with tail sampling and a baseline sample of 10% or less.", (c) =>
      c.path("telemetry-collector", "trace-store") &&
      c.nodes("trace-store").some((t) => E.str(t.config.tailSampling) === "Enabled" && E.num(t.config.samplingPercent) > 0 && E.num(t.config.samplingPercent) <= 10), {
      category: "Visibility",
      label: "Traces",
      points: 15,
    }),
    numberAtLeast("telemetry-collector", "bufferMinutes", 5, "Buffer at least 5 minutes of telemetry in the collector so a backend blip doesn't drop data.", "reliability", 10, { label: "Buffering" }),
  ],
  reference: {
    config: [
      "Three services -> telemetry collector (10-minute buffer).",
      "Collector -> metrics store (percentiles, 30 days), log store (structured, 14 days), trace store (tail sampling, 5%).",
    ],
    explanation: [
      "Percentile metrics detect the problem, tail-sampled traces locate it, and structured logs explain it. Each signal answers a different question.",
      "One collector gives every service the same pipeline, and its buffer rides out backend outages without losing data.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
        ...obsServices,
        { id: "collector", type: "telemetry-collector", x: 600, y: 200, config: { bufferMinutes: 10, samplingPercent: 100 } },
        { id: "metrics", type: "metrics-store", x: 880, y: 70, config: { aggregation: PERCENTILES, retentionDays: 30 } },
        { id: "logs", type: "log-store", x: 880, y: 200, config: { structured: "Enabled", retentionDays: 14 } },
        { id: "traces", type: "trace-store", x: 880, y: 330, config: { tailSampling: "Enabled", samplingPercent: 5 } },
      ],
      edges: [
        ...obsServices.map((s) => ({ source: "lb", target: s.id })),
        ...obsServices.map((s) => ({ source: s.id, target: "collector" })),
        { source: "collector", target: "metrics" },
        { source: "collector", target: "logs" },
        { source: "collector", target: "traces" },
      ],
    },
  },
  fix: {
    description: "Kestrel's services write averages, free-text logs (3-day retention) and 1% random traces directly to their stores, with no collector. The last incident took six hours to diagnose. Repair the telemetry stack.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 40, y: 200 },
        ...column("fx-svc", "application-server", 3, 320, 200, { size: "Medium" }, 130),
        { id: "fx-metrics", type: "metrics-store", x: 660, y: 70, config: { aggregation: "Average only", retentionDays: 7 } },
        { id: "fx-logs", type: "log-store", x: 660, y: 200, config: { structured: "Disabled", retentionDays: 3 } },
        { id: "fx-traces", type: "trace-store", x: 660, y: 330, config: { tailSampling: "Disabled", samplingPercent: 1 } },
      ],
      edges: [
        ...["fx-svc-1", "fx-svc-2", "fx-svc-3"].map((s) => ({ source: "fx-lb", target: s })),
        ...["fx-svc-1", "fx-svc-2", "fx-svc-3"].flatMap((s) => [
          { source: s, target: "fx-metrics" },
          { source: s, target: "fx-logs" },
          { source: s, target: "fx-traces" },
        ]),
      ],
    },
    metrics: { rps: 1100, appCpuPercent: 47, monthlyCostUsd: 1400, p95Ms: 860 },
  },
};

/* ---------------- Deployment & Release Architecture ---------------- */

const routedVersions = (c: Ctx) => c.nodes("traffic-router").some((r) => E.outgoing(c.g, r.id).filter((n) => n.type === "application-server").length >= 2);
const canaryNodes = (p: string, router: Record<string, string | number>, twoVersions: boolean): NodeSpec[] => [
  { id: `${p}lb`, type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
  { id: `${p}router`, type: "traffic-router", x: 280, y: 200, config: router },
  { id: `${p}stable`, type: "application-server", x: 540, y: twoVersions ? 100 : 200, config: { size: "Large", instances: 3 } },
  ...(twoVersions ? [{ id: `${p}canary`, type: "application-server", x: 540, y: 300, config: { size: "Large", instances: 1 } }] : []),
  { id: `${p}collector`, type: "telemetry-collector", x: 800, y: 100, config: { bufferMinutes: 10, samplingPercent: 100 } },
  { id: `${p}metrics`, type: "metrics-store", x: 1060, y: 100, config: { aggregation: PERCENTILES, retentionDays: 30 } },
];
const canaryEdges = (p: string, twoVersions: boolean) => [
  { source: `${p}lb`, target: `${p}router` },
  { source: `${p}router`, target: `${p}stable` },
  { source: `${p}stable`, target: `${p}collector` },
  ...(twoVersions
    ? [
        { source: `${p}router`, target: `${p}canary` },
        { source: `${p}canary`, target: `${p}collector` },
      ]
    : []),
  { source: `${p}collector`, target: `${p}metrics` },
];
const brokeEveryone: ProblemDef = {
  code: "SSA0073",
  slug: "the-deploy-that-broke-everyone",
  title: "The Deploy That Broke Everyone",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Cobalt deploys every release to its whole fleet at once. Last Tuesday a bad build reached 100% of users within two minutes, and rolling back took forty more. Ship new versions to a small slice of traffic first, watch them with the right metrics, and undo a bad release automatically.",
  guide: {
    title: "Required release path",
    description: "A traffic router splits requests between the stable fleet and a small canary fleet.",
    flow: ["load-balancer", "traffic-router", "application-server"],
    secondary: { title: "Release signals", flow: ["application-server", "telemetry-collector", "metrics-store"] },
    notes: ["Compare the canary's p99 and error rate with the stable fleet's."],
  },
  concepts: ["Canary releases", "Automated rollback"],
  reading: [{ title: "Deployment learning path", description: "Review progressive delivery.", href: `${DP}#canary` }],
  components: ["load-balancer", "traffic-router", "application-server", "telemetry-collector", "metrics-store"],
  checks: [
    rule("Route traffic through a traffic router to the stable and new versions.", routedVersions, { category: "validity", label: "Two versions" }),
    configIs("traffic-router", "strategy", "Canary", "Release new versions as a canary.", "Release safety", 20, { label: "Canary" }),
    rule("Send 10% or less of traffic to the canary.", (c) => c.nodes("traffic-router").some((r) => E.num(r.config.canaryPercent) > 0 && E.num(r.config.canaryPercent) <= 10), {
      category: "Release safety",
      label: "Blast radius",
    }),
    configIs("traffic-router", "autoRollback", "Enabled", "Roll back automatically when the canary's error rate or latency regresses.", "Release safety", 15, { label: "Auto rollback" }),
    rule("Watch the release with percentile metrics.", (c) => c.edge("application-server", "telemetry-collector") && c.path("telemetry-collector", "metrics-store") && percentileMetrics(c), {
      category: "Visibility",
      label: "Release metrics",
    }),
  ],
  reference: {
    config: ["Traffic router: canary at 5%, auto rollback on.", "Stable fleet Large x3, canary fleet Large x1, both reporting percentile metrics."],
    explanation: [
      "A canary limits a bad release to a few percent of users for a few minutes, instead of everyone until someone notices.",
      "Automatic rollback removes the slowest step of any incident: a human deciding to undo.",
    ],
    graph: { nodes: canaryNodes("", { strategy: "Canary", canaryPercent: 5, autoRollback: "Enabled" }, true), edges: canaryEdges("", true) },
  },
  fix: {
    description: "Cobalt's traffic router deploys all at once with no rollback, so a bad build reached every user in two minutes and stayed for forty. Repair the release process.",
    starting: { nodes: canaryNodes("fx-", { strategy: "All at once", autoRollback: "Disabled" }, false), edges: canaryEdges("fx-", false) },
    metrics: { rps: 1800, appCpuPercent: 56, monthlyCostUsd: 2520, errorRatePercent: 34 },
  },
};

const BG_RPS = 3000;
const environments = (c: Ctx) => c.nodes("traffic-router").flatMap((r) => E.outgoing(c.g, r.id).filter((n) => n.type === "application-server"));
const blueGreenNodes = (p: string, router: Record<string, string | number>, both: boolean): NodeSpec[] => [
  { id: `${p}lb`, type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
  { id: `${p}router`, type: "traffic-router", x: 280, y: 200, config: router },
  { id: `${p}blue`, type: "application-server", x: 540, y: both ? 90 : 200, config: { size: "Large", instances: 5 } },
  ...(both ? [{ id: `${p}green`, type: "application-server", x: 540, y: 310, config: { size: "Large", instances: 5 } }] : []),
  { id: `${p}db`, type: "postgresql", x: 820, y: 200, config: { size: "Large" } },
];
const blueGreenEdges = (p: string, both: boolean) => [
  { source: `${p}lb`, target: `${p}router` },
  { source: `${p}router`, target: `${p}blue` },
  { source: `${p}blue`, target: `${p}db` },
  ...(both
    ? [
        { source: `${p}router`, target: `${p}green` },
        { source: `${p}green`, target: `${p}db` },
      ]
    : []),
];
const rollbackInSeconds: ProblemDef = {
  code: "SSA0074",
  slug: "rollback-in-seconds",
  title: "Rollback in Seconds",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Halcyon's payment API serves 3,000 RPS at peak, and regulators expect releases with zero downtime and a rollback measured in seconds. Rolling deploys take twenty minutes to undo. Keep two complete environments, switch traffic between them in one step, and size each one to carry the full peak on its own.",
  guide: {
    title: "Required release path",
    description: "A traffic router flips all traffic between two full-size environments that share the database.",
    flow: ["load-balancer", "traffic-router", "application-server", "postgresql"],
    notes: ["Rollback is just flipping the router back to the idle environment."],
  },
  concepts: ["Blue/green deployments", "Instant rollback"],
  reading: [{ title: "Deployment learning path", description: "Review blue/green releases.", href: `${DP}#blue-green` }],
  components: ["load-balancer", "traffic-router", "application-server", "postgresql"],
  checks: [
    rule("Route traffic through a traffic router to two environments.", routedVersions, { category: "validity", label: "Two environments" }),
    configIs("traffic-router", "strategy", "Blue/green", "Release with a blue/green switch.", "Release safety", 20, { label: "Blue/green" }),
    rule("Size both environments to carry the full 3,000 RPS at 80% CPU or less.", (c) => environments(c).length >= 2 && environments(c).every((e) => E.serverCapacityRps(e) * 0.8 >= BG_RPS), {
      category: "capacity",
      label: "Full-size environments",
      points: 20,
      fail: "One environment can't carry the full peak, so switching to it would overload it.",
    }),
    configIs("traffic-router", "autoRollback", "Enabled", "Switch back automatically if the new environment's health checks or error rate regress.", "Release safety", 15, { label: "Auto rollback" }),
    rule("Point both environments at the same database so a switch doesn't move data.", (c) => {
      const env = environments(c);
      return env.length >= 2 && c.nodes("postgresql", "mysql").some((d) => env.every((e) => E.linked(c.g, e.id, d.id)));
    }, { category: "validity", label: "Shared data" }),
  ],
  reference: {
    config: ["Traffic router: blue/green with auto rollback.", "Blue and green each Large x5 (4,000 RPS, 75% at peak), sharing one PostgreSQL."],
    explanation: [
      "Blue/green trades double compute during a release for a one-step, near-instant switch in either direction.",
      "Each side must carry the full peak, otherwise the switch itself becomes the outage.",
    ],
    graph: { nodes: blueGreenNodes("", { strategy: "Blue/green", autoRollback: "Enabled" }, true), edges: blueGreenEdges("", true) },
  },
  fix: {
    description: "Halcyon deploys its payment API all at once to a single environment. A bad release last month took 20 minutes to roll back and broke the regulator's downtime rule. Repair the release setup.",
    starting: { nodes: blueGreenNodes("fx-", { strategy: "All at once", autoRollback: "Disabled" }, false), edges: blueGreenEdges("fx-", false) },
    metrics: { rps: 3000, appCpuPercent: 75, monthlyCostUsd: 3720, errorRatePercent: 9 },
  },
};

const migrationNodes = (p: string, phase: string): NodeSpec[] => [
  { id: `${p}lb`, type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
  { id: `${p}router`, type: "traffic-router", x: 280, y: 200, config: { strategy: "Canary", canaryPercent: 10, autoRollback: "Enabled" } },
  { id: `${p}v1`, type: "application-server", x: 540, y: 100, config: { size: "Large", instances: 3 } },
  { id: `${p}v2`, type: "application-server", x: 540, y: 300, config: { size: "Large", instances: 1 } },
  { id: `${p}db`, type: "postgresql", x: 820, y: 200, config: { size: "Medium", migrationPhase: phase } },
];
const migrationEdges = (p: string) => [
  { source: `${p}lb`, target: `${p}router` },
  { source: `${p}router`, target: `${p}v1` },
  { source: `${p}router`, target: `${p}v2` },
  { source: `${p}v1`, target: `${p}db` },
  { source: `${p}v2`, target: `${p}db` },
];
const renamingColumn: ProblemDef = {
  code: "SSA0075",
  slug: "renaming-a-column-mid-rollout",
  title: "Renaming a Column Mid-Rollout",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Brightwater is renaming customers.phone to phone_number. During a canary rollout, the old and new app versions run side by side for about an hour. Last time the migration dropped the old column up front, and every old instance started failing. Run the schema change so both versions work for the whole rollout.",
  guide: {
    title: "Required release path",
    description: "Two app versions share one database whose schema supports both until the rollout ends.",
    flow: ["load-balancer", "traffic-router", "application-server", "postgresql"],
    notes: ["Expand: add the new column and write both. Contract: remove the old one after every instance is upgraded."],
  },
  concepts: ["Expand/contract migrations", "Backward-compatible schema changes"],
  reading: [{ title: "Deployment learning path", description: "Review zero-downtime migrations.", href: `${DP}#migrations` }],
  components: ["load-balancer", "traffic-router", "application-server", "postgresql"],
  checks: [
    rule("Run the old and new versions side by side behind a traffic router.", routedVersions, { category: "validity", label: "Two versions" }),
    rule("Point both versions at the same database.", (c) => c.nodes("postgresql", "mysql").some((d) => E.incoming(c.g, d.id).filter((n) => n.type === "application-server").length >= 2), { category: "validity", label: "Shared schema" }),
    configIs(
      "postgresql",
      "migrationPhase",
      "Expand",
      "Run the migration in the expand phase: add the new column and keep the old one while both versions run.",
      "Compatibility",
      25,
      { label: "Expand phase" },
    ),
    configIs("traffic-router", "autoRollback", "Enabled", "Keep automatic rollback on, so the old version can take traffic back at any point.", "Release safety", 10, { label: "Auto rollback" }),
  ],
  reference: {
    config: ["Traffic router: canary at 10%, auto rollback.", "PostgreSQL migration phase: Expand (both columns exist; the contract step runs after the rollout)."],
    explanation: [
      "During any gradual rollout two versions share one schema, so every migration must be compatible with both.",
      "Expand first and contract later turns one risky step into two safe ones, and rollback still works at every point.",
    ],
    graph: { nodes: migrationNodes("", "Expand"), edges: migrationEdges("") },
  },
  fix: {
    description: "Brightwater's migration drops the old phone column at the start of the rollout (contract phase) while v1 instances still read it. 75% of traffic is failing. Repair the migration plan.",
    starting: { nodes: migrationNodes("fx-", "Contract"), edges: migrationEdges("fx-") },
    metrics: { rps: 1200, appCpuPercent: 37, monthlyCostUsd: 2780, errorRatePercent: 75 },
  },
};

const flagNodes = (p: string, flags: Record<string, string | number>): NodeSpec[] => [
  { id: `${p}lb`, type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
  { id: `${p}app`, type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 3 } },
  { id: `${p}flags`, type: "feature-flag-service", x: 580, y: 80, config: flags },
  { id: `${p}db`, type: "postgresql", x: 580, y: 320 },
];
const flagEdges = (p: string) => [
  { source: `${p}lb`, target: `${p}app` },
  { source: `${p}app`, target: `${p}flags` },
  { source: `${p}app`, target: `${p}db` },
];
const shipDark: ProblemDef = {
  code: "SSA0076",
  slug: "ship-dark-release-later",
  title: "Ship Dark, Release Later",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Mossbank's new recommendations engine is finished, but product wants to turn it on gradually, starting with 5% of users, and switch it off instantly if engagement drops, without a deploy either way. Today every flag check is a network call to the flag service, which adds 40 ms and fails when the service does. Separate deploy from release.",
  guide: {
    title: "Required release path",
    description: "Code ships dark; a feature flag service decides who sees it, evaluated locally inside each server.",
    flow: ["load-balancer", "application-server", "feature-flag-service"],
    notes: ["Local evaluation caches the rule set and keeps working if the flag service goes down."],
  },
  concepts: ["Feature flags", "Decoupling deploy from release"],
  reading: [{ title: "Deployment learning path", description: "Review feature flags.", href: `${DP}#feature-flags` }],
  components: ["load-balancer", "application-server", "feature-flag-service", "postgresql"],
  checks: [
    rule("Evaluate feature flags from the application servers.", (c) => c.edge("application-server", "feature-flag-service"), { category: "validity", label: "Flag service" }),
    rule("Roll out to a percentage or targeted segment, not all at once.", (c) => c.nodes("feature-flag-service").some((f) => ["Percentage", "Targeted segments"].includes(E.str(f.config.rollout))), {
      category: "Release safety",
      label: "Gradual rollout",
      points: 15,
    }),
    rule("Start a percentage rollout at 5% or less.", (c) =>
      c.nodes("feature-flag-service").some((f) => E.str(f.config.rollout) === "Targeted segments" || (E.str(f.config.rollout) === "Percentage" && E.num(f.config.rolloutPercent) > 0 && E.num(f.config.rolloutPercent) <= 5)), {
      category: "Release safety",
      label: "Starting slice",
    }),
    configIs("feature-flag-service", "killSwitch", "Enabled", "Add a kill switch that turns the feature off instantly.", "Release safety", 15, { label: "Kill switch" }),
    configIs("feature-flag-service", "localEvaluation", "Enabled", "Evaluate flags locally from a cached rule set, so a flag service outage can't slow or fail requests.", "Latency", 15, { label: "Local evaluation" }),
  ],
  reference: {
    config: ["Feature flag service: percentage rollout starting at 5%, kill switch on, local evaluation on."],
    explanation: [
      "Feature flags turn a release into a configuration change: instant, gradual and reversible, with no deploy.",
      "Local evaluation keeps the 40 ms network hop, and the dependency, off the request path.",
    ],
    graph: { nodes: flagNodes("", { rollout: "Percentage", rolloutPercent: 5, killSwitch: "Enabled", localEvaluation: "Enabled" }), edges: flagEdges("") },
  },
  fix: {
    description: "Mossbank's flags are all-or-nothing with no kill switch, and every check is a remote call that adds 40 ms. The last launch had to be reverted with an emergency deploy. Repair the release mechanism.",
    starting: { nodes: flagNodes("fx-", { rollout: "All or nothing", killSwitch: "Disabled", localEvaluation: "Disabled" }), edges: flagEdges("fx-") },
    metrics: { rps: 1500, appCpuPercent: 63, monthlyCostUsd: 2140, p95Ms: 310 },
  },
};

/* ---------------- Cost & Architecture Optimization ---------------- */

const idleCpus: ProblemDef = {
  code: "SSA0077",
  slug: "paying-for-idle-cpus",
  title: "Paying for Idle CPUs",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Willowmere's API runs on eight 2XL servers left over from a launch-week traffic estimate that never came true. Real traffic is a steady 1,600 RPS and CPU averages 11%. Right-size the tier: stay at or below 70% CPU, keep enough headroom that the servers aren't idle, and bring the app tier (load balancer plus servers) to $2,200 a month or less.",
  guide: {
    title: "Required request path",
    description: "Pick the size and count with the lowest price for the capacity you actually need.",
    flow: ["load-balancer", "application-server"],
    notes: ["Compare price per RPS across sizes; the largest is rarely the cheapest."],
  },
  concepts: ["Right-sizing", "Price per unit of capacity"],
  reading: [{ title: "Cost learning path", description: "Review right-sizing.", href: `${CO}#right-sizing` }],
  components: ["load-balancer", "application-server"],
  sim: { sustainedRps: 1600, peakRps: 1600, cpuMaxPercent: 70, budgetMaxUsd: 2200, budgetTypes: ["load-balancer", "application-server"] },
  checks: [...appTier(1600, 70), budget(2200, "the app tier", 20, ["load-balancer", "application-server"])],
  reference: {
    config: ["Large x3: 2,400 RPS, 67% at 1,600 RPS.", "Cost: $180 + 3 x $620 = $2,040 (was $16,980)."],
    explanation: [
      "Over-provisioned fleets are the most common cloud waste: capacity bought for a forecast and never revisited.",
      "Large has nearly the best price per RPS; six Medium servers ($2,160) also pass but leave less room.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
        { id: "app", type: "application-server", x: 340, y: 200, config: { size: "Large", instances: 3 } },
      ],
      edges: [{ source: "lb", target: "app" }],
    },
  },
  fix: {
    description: "Willowmere pays $16,980 a month for eight 2XL servers running at 11% CPU. Repair the sizing to match real traffic.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 40, y: 200 },
        { id: "fx-app", type: "application-server", x: 340, y: 200, config: { size: "2XL", instances: 8 } },
      ],
      edges: [{ source: "fx-lb", target: "fx-app" }],
    },
    metrics: { rps: 1600, appCpuPercent: 11, monthlyCostUsd: 16980 },
  },
};

const logNodes = (p: string, archived: boolean): NodeSpec[] => [
  { id: `${p}lb`, type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
  { id: `${p}app`, type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 2 } },
  { id: `${p}collector`, type: "telemetry-collector", x: 560, y: 200, config: { bufferMinutes: 10, samplingPercent: 100 } },
  { id: `${p}logs`, type: "log-store", x: 820, y: 200, config: { structured: "Enabled", retentionDays: archived ? 30 : 3650 } },
  ...(archived ? [{ id: `${p}archive`, type: "object-storage", x: 1080, y: 200, config: { storageClass: "Archive", expireDays: 365 } }] : []),
];
const logEdges = (p: string, archived: boolean) => [
  { source: `${p}lb`, target: `${p}app` },
  { source: `${p}app`, target: `${p}collector` },
  { source: `${p}collector`, target: `${p}logs` },
  ...(archived ? [{ source: `${p}logs`, target: `${p}archive` }] : []),
];
const hotForever: ProblemDef = {
  code: "SSA0078",
  slug: "logs-kept-hot-forever",
  title: "Logs Kept Hot Forever",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Fennick keeps every log line from the last four years in its searchable log store, at search-cluster prices. Engineers only ever search the last 30 days, and compliance requires keeping logs for one year and then deleting them. Keep recent logs searchable, move the rest to cheap storage, and delete them on schedule.",
  guide: {
    title: "Required log path",
    description: "Recent logs stay searchable; older logs move to archive storage that expires them after a year.",
    flow: ["application-server", "telemetry-collector", "log-store", "object-storage"],
    notes: ["Archive storage costs a fraction of a search cluster per gigabyte."],
  },
  concepts: ["Data lifecycle tiers", "Retention policies"],
  reading: [{ title: "Cost learning path", description: "Review hot, warm and cold data.", href: `${CO}#lifecycle` }],
  components: ["load-balancer", "application-server", "telemetry-collector", "log-store", "object-storage"],
  checks: [
    rule("Ship logs from the servers to a log store.", (c) => c.edge("application-server", "log-store") || c.path("application-server", "telemetry-collector", "log-store"), { category: "validity", label: "Log path" }),
    rule("Keep only the last 30 days in the searchable log store.", (c) => c.nodes("log-store").some((l) => E.num(l.config.retentionDays) > 0 && E.num(l.config.retentionDays) <= 30), {
      category: "cost",
      label: "Hot retention",
      points: 15,
    }),
    rule("Export older logs to object storage.", (c) => c.edge("log-store", "object-storage"), { category: "validity", label: "Archive export" }),
    rule("Store exported logs in the Archive class, or move them there within 30 days.", (c) =>
      c.nodes("object-storage").some((o) => E.str(o.config.storageClass) === "Archive" || (E.num(o.config.lifecycleDays) > 0 && E.num(o.config.lifecycleDays) <= 30)), {
      category: "cost",
      label: "Archive tier",
      points: 15,
    }),
    rule("Delete archived logs after one year, as compliance requires.", (c) => c.nodes("object-storage").some((o) => E.num(o.config.expireDays) >= 365 && E.num(o.config.expireDays) <= 400), {
      category: "Compliance",
      label: "Expiry",
      points: 15,
    }),
  ],
  reference: {
    config: ["Log store: structured, 30-day retention.", "Older logs exported to object storage in the Archive class, expiring after 365 days."],
    explanation: [
      "Data has a temperature: what's searched daily belongs on fast storage; what's kept only for compliance belongs in the cheapest tier.",
      "An expiry rule enforces the retention policy automatically, which also limits what a breach could expose.",
    ],
    graph: { nodes: logNodes("", true), edges: logEdges("", true) },
  },
  fix: {
    description: "Fennick's log store keeps ten years of retention on search-cluster storage and nothing is ever archived or deleted. Logging is now 40% of the infrastructure bill. Repair the retention setup.",
    starting: { nodes: logNodes("fx-", false), edges: logEdges("fx-", false) },
    metrics: { rps: 1400, appCpuPercent: 48, monthlyCostUsd: 18400 },
  },
};

const DATA_TYPES = ["postgresql", "mysql", "redis", "dynamodb", "mongodb", "cassandra"];
const regionOf = (n: { config: Record<string, unknown> }) => E.str(n.config.region, "us-east");
const localReads = (c: Ctx) =>
  apps(c).length >= 2 && apps(c).every((a) => E.outgoing(c.g, a.id).some((n) => DATA_TYPES.includes(n.type) && regionOf(n) === regionOf(a)));
const transferNodes = (p: string, fixed: boolean): NodeSpec[] => [
  { id: `${p}dns`, type: "dns", x: 40, y: 220, config: { routingPolicy: "Latency based", healthChecks: "Enabled" } },
  { id: `${p}app-us`, type: "application-server", x: 300, y: 100, config: { size: "Large", instances: 2, region: "us-east" } },
  { id: `${p}app-eu`, type: "application-server", x: 300, y: 360, config: { size: "Large", instances: 2, region: "eu-west" } },
  { id: `${p}primary`, type: "postgresql", x: 620, y: 100, config: { size: "Medium", role: "Primary", region: "us-east" } },
  ...(fixed
    ? [
        { id: `${p}cache-us`, type: "redis", x: 620, y: -20, config: { size: "Small", region: "us-east" } },
        { id: `${p}replica`, type: "postgresql", x: 620, y: 360, config: { size: "Medium", role: "Replica", replicatesFrom: `${p === "" ? "ref-" : p}primary`, region: "eu-west" } },
        { id: `${p}cache-eu`, type: "redis", x: 620, y: 480, config: { size: "Small", region: "eu-west" } },
      ]
    : []),
];
const transferEdges = (p: string, fixed: boolean) => [
  { source: `${p}dns`, target: `${p}app-us` },
  { source: `${p}dns`, target: `${p}app-eu` },
  { source: `${p}app-us`, target: `${p}primary` },
  { source: `${p}app-eu`, target: `${p}primary` },
  ...(fixed
    ? [
        { source: `${p}app-us`, target: `${p}cache-us` },
        { source: `${p}app-eu`, target: `${p}replica` },
        { source: `${p}app-eu`, target: `${p}cache-eu` },
        { source: `${p}primary`, target: `${p}replica` },
      ]
    : []),
];
const transferBill: ProblemDef = {
  code: "SSA0079",
  slug: "the-surprise-transfer-bill",
  title: "The Surprise Transfer Bill",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Quarry Labs added an eu-west app tier for European users, but every read still crosses the Atlantic to the primary database in us-east. That's 2.4 TB of cross-region transfer a day, a five-figure monthly line item, and 90 ms added to every European page. Keep writes on the single primary, and serve each region's reads from data in that region.",
  guide: {
    title: "Required regional layout",
    description: "Each region reads locally from a cache and a database copy; only writes cross the ocean.",
    flow: ["dns", "application-server", "postgresql"],
    secondary: { title: "Regional cache", flow: ["application-server", "redis"] },
    notes: ["Set the Region field on every node.", "Replication sends each change across once, instead of on every read."],
  },
  concepts: ["Data locality", "Cross-region transfer cost"],
  reading: [{ title: "Cost learning path", description: "Review data transfer costs.", href: `${CO}#transfer` }],
  components: ["dns", "application-server", "postgresql", "redis"],
  checks: [
    configIs("dns", "routingPolicy", "Latency based", "Send each user to the nearest region with latency-based DNS.", "Latency", 10),
    rule("Keep a read replica in eu-west that copies from the primary.", (c) => c.nodes("postgresql", "mysql").some((d) => E.str(d.config.role) === "Replica" && regionOf(d) === "eu-west"), {
      category: "Locality",
      label: "EU replica",
      points: 15,
    }),
    rule("Serve every regional app tier's reads from a database or cache in its own region.", localReads, {
      category: "Locality",
      label: "Local reads",
      points: 25,
      fail: "At least one region still reads from data stored in another region.",
    }),
    rule("Cache hot reads in each region.", (c) => apps(c).length >= 2 && apps(c).every((a) => E.outgoing(c.g, a.id).some((n) => n.type === "redis" && regionOf(n) === regionOf(a))), {
      category: "cost",
      label: "Regional caches",
    }),
  ],
  reference: {
    config: ["Latency-based DNS to us-east and eu-west app tiers.", "us-east: primary + cache. eu-west: read replica + cache; EU writes still go to the primary."],
    explanation: [
      "Cross-region transfer is billed per gigabyte, and reads usually dwarf writes. Replication ships each change once; remote reads ship the same data over and over.",
      "Local reads also remove the ocean from European page loads.",
    ],
    graph: { nodes: transferNodes("", true), edges: transferEdges("", true) },
  },
  fix: {
    description: "Quarry Labs' eu-west app tier reads everything from the us-east primary: 2.4 TB a day of cross-region transfer and 90 ms on every European request. Repair the data layout.",
    starting: { nodes: transferNodes("fx-", false), edges: transferEdges("fx-", false) },
    metrics: { rps: 2600, appCpuPercent: 44, monthlyCostUsd: 21400, p95Ms: 310 },
  },
};

const CAPSTONE_RPS = 2200;
const capstoneNodes: NodeSpec[] = [
  { id: "lb", type: "load-balancer", x: 40, y: 220, config: { healthChecks: "Enabled" } },
  { id: "router", type: "traffic-router", x: 260, y: 220, config: { strategy: "Canary", canaryPercent: 5, autoRollback: "Enabled" } },
  { id: "stable", type: "application-server", x: 500, y: 120, config: { size: "Large", instances: 3 } },
  { id: "canary", type: "application-server", x: 500, y: 330, config: { size: "Large", instances: 1 } },
  { id: "as", type: "auto-scaling", x: 500, y: -20, config: { metric: "Request concurrency", min: 3, max: 6, targetPercent: 70 } },
  { id: "collector", type: "telemetry-collector", x: 760, y: 220, config: { bufferMinutes: 10, samplingPercent: 100 } },
  { id: "metrics", type: "metrics-store", x: 1000, y: 120, config: { aggregation: PERCENTILES, retentionDays: 30 } },
  { id: "traces", type: "trace-store", x: 1000, y: 330, config: { tailSampling: "Enabled", samplingPercent: 5 } },
];
const capstone: ProblemDef = {
  code: "SSA0080",
  slug: "production-operations-capstone",
  title: "Production Operations Capstone",
  difficulty: "Hard",
  minutes: 30,
  sectionChallenge: true,
  description:
    "Tidewater's API serves 2,200 RPS on an oversized fleet, deploys all at once, and debugs incidents from averages and random traces. Bring it up to production standard: a right-sized fleet at 75% CPU or less within $3,000 a month (load balancer, router and servers), autoscaling for surprises, canary releases with automatic rollback, percentile metrics, and tail-sampled traces.",
  guide: {
    title: "Required request path",
    description: "Load balancer, traffic router with a canary, and an autoscaled, right-sized fleet.",
    flow: ["load-balancer", "traffic-router", "application-server"],
    extra: [
      { title: "Scaling policy", flow: ["auto-scaling", "application-server"] },
      { title: "Telemetry", flow: ["application-server", "telemetry-collector", "metrics-store"] },
    ],
    notes: ["Instances on each server node are the always-on fleet that the load test uses."],
  },
  concepts: ["Operating in production", "Cost, safety and visibility together"],
  reading: [{ title: "Cost learning path", description: "Review the whole section.", href: `${CO}#capstone` }],
  components: ["load-balancer", "traffic-router", "application-server", "auto-scaling", "telemetry-collector", "metrics-store", "trace-store"],
  sim: { sustainedRps: CAPSTONE_RPS, peakRps: CAPSTONE_RPS, cpuMaxPercent: 75, budgetMaxUsd: 3000, budgetTypes: ["load-balancer", "traffic-router", "application-server"] },
  checks: [
    lbEntry(),
    capacityAtLeast(CAPSTONE_RPS, "sustained traffic"),
    cpuCeiling(CAPSTONE_RPS, 75),
    rule("Release through a traffic router running canaries with automatic rollback.", (c) => routedVersions(c) && c.is("traffic-router", "strategy", "Canary") && c.is("traffic-router", "autoRollback", "Enabled"), {
      category: "Release safety",
      label: "Canary releases",
      points: 15,
    }),
    rule("Attach an autoscaling policy to the application servers.", (c) => !!scalerOf(c, "application-server"), { category: "reliability", label: "Autoscaling" }),
    rule("Record percentile metrics from every server.", (c) => c.every("application-server", "telemetry-collector") && c.path("telemetry-collector", "metrics-store") && percentileMetrics(c), {
      category: "Visibility",
      label: "Metrics",
    }),
    rule("Keep traces with tail sampling.", (c) => c.path("telemetry-collector", "trace-store") && c.is("trace-store", "tailSampling", "Enabled"), { category: "Visibility", label: "Traces" }),
    budget(3000, "the load balancer, router and servers", 15, ["load-balancer", "traffic-router", "application-server"]),
  ],
  reference: {
    config: [
      "Traffic router: canary at 5% with auto rollback; stable Large x3, canary Large x1 (3,200 RPS, 69% at 2,200 RPS).",
      "Auto Scaling on request concurrency (3 to 6) for surprises.",
      "Telemetry collector -> percentile metrics and tail-sampled traces.",
      "Cost: $180 + $60 + 4 x $620 = $2,720.",
    ],
    explanation: [
      "Each practice covers a different way production fails: cost drift, traffic surprises, bad releases, and slow diagnosis.",
      "Together they make the system cheaper to run and safer to change, and a failure is caught in minutes instead of hours.",
    ],
    graph: {
      nodes: capstoneNodes,
      edges: [
        { source: "lb", target: "router" },
        { source: "router", target: "stable" },
        { source: "router", target: "canary" },
        { source: "as", target: "stable" },
        { source: "stable", target: "collector" },
        { source: "canary", target: "collector" },
        { source: "collector", target: "metrics" },
        { source: "collector", target: "traces" },
      ],
    },
  },
  fix: {
    description: "Tidewater runs four 2XL servers at 30% CPU ($8,580 a month), deploys all at once, and has only average metrics and 1% random traces. Repair the platform to production standard.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 40, y: 220 },
        { id: "fx-router", type: "traffic-router", x: 260, y: 220, config: { strategy: "All at once" } },
        { id: "fx-app", type: "application-server", x: 500, y: 220, config: { size: "2XL", instances: 4 } },
        { id: "fx-metrics", type: "metrics-store", x: 780, y: 120, config: { aggregation: "Average only", retentionDays: 7 } },
        { id: "fx-traces", type: "trace-store", x: 780, y: 330, config: { samplingPercent: 1 } },
      ],
      edges: [
        { source: "fx-lb", target: "fx-router" },
        { source: "fx-router", target: "fx-app" },
        { source: "fx-app", target: "fx-metrics" },
        { source: "fx-app", target: "fx-traces" },
      ],
    },
    metrics: { rps: 2200, appCpuPercent: 30, monthlyCostUsd: 8580, p95Ms: 420, errorRatePercent: 0.8 },
  },
};

export const PRODUCTION_OPERATIONS: ProblemDef[] = [
  wrongSignal,
  tooLate,
  tookDownDb,
  blackFriday,
  averageLooksFine,
  droppedTrace,
  oldMessages,
  observabilityChallenge,
  brokeEveryone,
  rollbackInSeconds,
  renamingColumn,
  shipDark,
  idleCpus,
  hotForever,
  transferBill,
  capstone,
];
