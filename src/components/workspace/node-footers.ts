import { getComponent } from "@/lib/catalog/components";
import type { SimSpec } from "@/lib/content/types";
import type { Graph, GraphNode } from "@/lib/sim/graph";
import * as E from "@/lib/sim/engine";

/** Live readouts drawn under each canvas node. */
export type Footer =
  | { kind: "meter"; label: string; value: string; fillPercent: number; ok: boolean }
  | {
      kind: "panel";
      surface: "tint" | "neutral";
      lines: { left: string; right?: string; muted?: boolean }[];
      bar?: { label: string; value: string; fillPercent: number; ok: boolean };
    };

export interface FooterContext {
  graph: Graph;
  sim?: SimSpec;
  cached: <T>(key: string, fn: () => T) => T;
  readings: Map<string, E.ServerReading>;
  memory: Map<string, { memoryUtilizationPercent: number }>;
}

const q = E.formatQuantity;
const money = (n: number) => `$${E.formatQuantity(n)}/mo`;

function panel(node: GraphNode, lines: { left: string; right?: string; muted?: boolean }[], bar?: Extract<Footer, { kind: "panel" }>["bar"]): Footer {
  return { kind: "panel", surface: getComponent(node.type)?.category === "database" ? "neutral" : "tint", lines, bar };
}

function utilBar(label: string, value: number, max: number, suffix = ""): Extract<Footer, { kind: "panel" }>["bar"] {
  const finite = Number.isFinite(value);
  return {
    label,
    value: finite ? `${Math.round(value)}%${suffix}` : `no capacity${suffix}`,
    fillPercent: finite ? Math.min(Math.max(value, 0), 100) : 100,
    ok: finite && value <= max,
  };
}

const costOnly = (n: GraphNode) => panel(n, [{ left: `COST: ${money(E.nodeCostUsd(n))}` }]);

const relational = (n: GraphNode, ctx: FooterContext): Footer => {
  const caps = { left: `READS: ${E.dbReadCapacity(n).toLocaleString()}/s`, right: `WRITES: ${E.dbWriteCapacity(n).toLocaleString()}/s` };
  const db = ctx.sim?.db;
  if (db) {
    const r = ctx.cached("db", () => E.resolveDatabaseLoad(ctx.graph, db));
    if (r.primary?.id === n.id) return panel(n, [caps], utilBar("LOAD", r.primaryUtilizationPercent, db.maxUtilizationPercent));
    if (r.readReplicas.some((x) => x.id === n.id) && r.replicaUtilizationPercent !== null)
      return panel(n, [caps], utilBar("READ", r.replicaUtilizationPercent, db.maxUtilizationPercent));
  }
  const role = E.str(n.config.role, "Standalone") || "Standalone";
  return panel(n, [caps, { left: `ROLE: ${role}`, right: `CONN: ${E.num(n.config.maxConnections, 100)}`, muted: true }]);
};

const keyValue = (n: GraphNode) =>
  panel(n, [
    { left: `READS: ${q(E.dbReadCapacity(n))}/s`, right: `WRITES: ${q(E.dbWriteCapacity(n))}/s` },
    { left: `SIZE: ${E.str(n.config.size, "Small").toUpperCase()}`, right: money(E.nodeCostUsd(n)), muted: true },
  ]);

const FOOTERS: Record<string, (n: GraphNode, ctx: FooterContext) => Footer | null> = {
  "application-server": (n, ctx) => {
    const reading = ctx.readings.get(n.id);
    const mem = ctx.memory.get(n.id)?.memoryUtilizationPercent;
    const caps = { left: `RPS: ${E.serverCapacityRps(n).toLocaleString()}`, right: `RAM: ${E.serverMemoryGb(n).toLocaleString()} GB` };
    if (ctx.sim?.memory) return panel(n, [caps], utilBar("MEM", mem ?? 0, ctx.sim.memory.maxMemoryPercent));
    if (!ctx.sim?.sustainedRps) return panel(n, [caps]);
    const cpu = reading?.cpuPercent ?? 0;
    return panel(n, [caps], utilBar("CPU", cpu, ctx.sim.cpuMaxPercent ?? 80));
  },
  "load-balancer": (n, ctx) => {
    const backends = ctx.graph.edges
      .filter((e) => e.source === n.id)
      .map((e) => ctx.graph.nodes.find((x) => x.id === e.target))
      .filter((x): x is GraphNode => x?.type === "application-server")
      .reduce((s, x) => s + E.serverCapacityRps(x), 0);
    const required = ctx.sim?.sustainedRps;
    if (!required) return panel(n, [{ left: `BACKENDS: ${backends.toLocaleString()} RPS`, right: "MAX: 10,000" }]);
    return { kind: "meter", label: "RPS", value: `${backends.toLocaleString()} / ${required.toLocaleString()}`, fillPercent: Math.min((backends / required) * 100, 100), ok: backends >= required };
  },
  postgresql: relational,
  mysql: relational,
  dynamodb: keyValue,
  mongodb: keyValue,
  cassandra: keyValue,
  elasticsearch: keyValue,
  "search-index": keyValue,
  redis: (n, ctx) => {
    const lines: { left: string; right?: string; muted?: boolean }[] = [
      { left: `OPS: ${q(E.cacheOpsCapacity(n))}/s`, right: `MEM: ${E.cacheMemoryGb(n)} GB` },
    ];
    const t = ctx.sim?.cache ?? ctx.sim?.db?.cache;
    if (t && E.str(n.config.usage, "Cache") === "Cache") {
      const cache = ctx.cached("cache-node", () => E.readThroughCache(ctx.graph));
      if (cache?.id === n.id) {
        const hit = E.cacheHitRate(n, t) * 100;
        lines.push({ left: `HIT: ${Math.round(hit)}%`, right: `TTL: ${q(E.num(n.config.ttlSeconds, 300))} s`, muted: true });
        return panel(n, lines);
      }
    }
    lines.push({ left: `USED AS: ${E.str(n.config.usage, "Cache").toUpperCase()}`, right: money(E.nodeCostUsd(n)), muted: true });
    return panel(n, lines);
  },
  worker: (n, ctx) => {
    const rate = ctx.sim?.queue?.workerRatePerSec ?? ctx.sim?.isolation?.workerRatePerSec ?? 50;
    const lines = [{ left: `JOBS/S: ${q(E.workerThroughputPerSec(n, rate))}`, right: `INSTANCES: ${E.instancesOf(n)}` }];
    const qt = ctx.sim?.queue;
    if (qt) {
      const r = ctx.cached("queue", () => E.resolveQueueBacklog(ctx.graph, qt));
      if (r.workers.some((w) => w.id === n.id)) {
        const drain = Number.isFinite(r.drainMinutes) ? `${q(r.drainMinutes)} min` : "never";
        const bar = utilBar("UTIL", r.workerUtilizationPercent, qt.maxWorkerUtilizationPercent ?? 90, ` · DRAIN ${drain}`);
        return panel(n, lines, bar ? { ...bar, ok: bar.ok && r.drainMinutes <= qt.maxDrainMinutes } : undefined);
      }
    }
    const it = ctx.sim?.isolation;
    if (it) {
      const r = ctx.cached("iso", () => E.resolveComputeIsolation(ctx.graph, it));
      if (r.workers.some((w) => w.id === n.id)) {
        return {
          kind: "panel",
          surface: "tint",
          lines,
          bar: {
            label: "BATCH",
            value: Number.isFinite(r.batchDrainMinutes) ? `${q(r.batchDrainMinutes)} min` : "never",
            fillPercent: Math.min(100, (r.batchDrainMinutes / it.batchDeadlineMinutes) * 100),
            ok: r.batchDrainMinutes <= it.batchDeadlineMinutes,
          },
        };
      }
    }
    return panel(n, lines);
  },
  "message-queue": (n, ctx) => {
    const lines: { left: string; right?: string; muted?: boolean }[] = [];
    const qt = ctx.sim?.queue;
    let bar: Extract<Footer, { kind: "panel" }>["bar"];
    if (qt) {
      const r = ctx.cached("queue", () => E.resolveQueueBacklog(ctx.graph, qt));
      if (r.queue?.id === n.id) {
        lines.push({ left: `SERVICE: ${q(r.serviceRatePerSec)}/s`, right: `DRAIN: ${Number.isFinite(r.drainMinutes) ? `${q(r.drainMinutes)} min` : "never"}` });
        bar = utilBar("WORKER UTIL", r.workerUtilizationPercent, qt.maxWorkerUtilizationPercent ?? 90);
      }
    }
    lines.push({
      left: `RETRY: ${E.str(n.config.retry) === "Enabled" ? `on (${E.num(n.config.maxRetries) || "∞"})` : "off"}`,
      right: `DLQ: ${E.str(n.config.dlqEnabled) === "Enabled" ? "on" : "off"}`,
      muted: true,
    });
    return panel(n, lines, bar);
  },
  "event-stream": (n) =>
    panel(n, [
      { left: `PARTITIONS: ${Math.max(1, E.num(n.config.partitions, 1))}`, right: `RF: ${Math.max(1, E.num(n.config.replicationFactor, 1))}` },
      { left: `RETENTION: ${q(E.num(n.config.retentionHours, 24))} h`, right: money(E.nodeCostUsd(n)), muted: true },
    ]),
  cdn: (n, ctx) => {
    const r = ctx.cached("cdn", () => E.resolveCdn(ctx.graph, ctx.sim?.cdn));
    const lines = [{ left: `HIT: ${Math.round(r.hitRatePercent)}%`, right: `p95: ${q(r.regionalP95Ms)} ms` }];
    if (ctx.sim?.cdn) return panel(n, lines, utilBar("ORIGIN", r.originUtilizationPercent, ctx.sim.cdn.maxOriginUtilizationPercent));
    return panel(n, [...lines, { left: `TTL: ${q(E.num(n.config.ttlSeconds, 3600))} s`, right: money(E.nodeCostUsd(n)), muted: true }]);
  },
  "websocket-gateway": (n) =>
    panel(n, [
      { left: `CONNECTIONS: ${q(E.gatewayConnectionCapacity(n))}`, right: `INSTANCES: ${E.instancesOf(n)}` },
      { left: `LOOKUP: ${E.str(n.config.connectionState, "Local only").toUpperCase()}`, muted: true },
    ]),
  "auto-scaling": (n) =>
    panel(n, [
      { left: `RANGE: ${E.num(n.config.min, 1)} to ${E.num(n.config.max, 10)}`, right: `TARGET: ${E.num(n.config.targetPercent, 70)}%` },
      { left: `SIGNAL: ${E.str(n.config.metric, "CPU utilization").split(" ")[0].toUpperCase()}`, right: `REACTION: ${E.num(n.config.scaleOutCooldownSec, 300)} s`, muted: true },
    ]),
  "retry-policy": (n) =>
    panel(n, [{ left: `ATTEMPTS: ${E.num(n.config.maxAttempts, 5)}`, right: `BACKOFF: ${E.str(n.config.backoff, "Immediate").toUpperCase()}` }]),
  "circuit-breaker": (n) =>
    panel(n, [{ left: `OPEN AT: ${E.num(n.config.failureThresholdPercent, 50)}%`, right: `FALLBACK: ${E.str(n.config.fallback, "Error").split(" ")[0].toUpperCase()}` }]),
  "rate-limiter": (n) =>
    panel(n, [{ left: `LIMIT: ${q(E.num(n.config.requestsPerSecond, 100))}/s`, right: E.str(n.config.algorithm, "Fixed window").toUpperCase() }]),
  "api-gateway": (n) =>
    panel(n, [{ left: `AUTH: ${E.str(n.config.auth, "None").toUpperCase()}`, right: `LIMIT: ${q(E.num(n.config.rateLimitPerClientRps, 1000))}/s` }]),
  "object-storage": (n) =>
    panel(n, [
      { left: `REQ/S: ${q(E.objectStoreRequestCapacity(n))}`, right: money(E.nodeCostUsd(n)) },
      { left: `CLASS: ${E.str(n.config.storageClass, "Standard").toUpperCase()}`, muted: true },
    ]),
  "serverless-function": (n) =>
    panel(n, [{ left: `CONCURRENT: ${q(E.num(n.config.concurrency, 10))}`, right: `EST RPS: ${q(E.serverlessEstimatedRps(n))}` }]),
  "model-server": (n) =>
    panel(n, [
      { left: `RPS: ${E.serverCapacityRps(n).toLocaleString()}`, right: `RAM: ${E.serverMemoryGb(n).toLocaleString()} GB` },
      { left: `WARM: ${E.instancesOf(n)}`, right: `COLD START: ${q(E.num(n.config.coldStartSeconds, 90))} s`, muted: true },
    ]),
  "training-job": (n) =>
    panel(n, [{ left: `GPUS: ${E.num(n.config.gpuCount, 8)} × ${E.str(n.config.gpuType, "A100")}`, right: `LOADER: ${q(E.num(n.config.dataLoaderThroughputSamplesPerSec, 2000))}/s` }]),
  "llm-inference-server": (n) =>
    panel(n, [{ left: `TOK/S: ${q(E.llmTokensPerSec(n))}`, right: `GPUS: ${E.num(n.config.gpuCount, 8)} × ${E.str(n.config.gpuType, "H100")}` }]),
  "vector-database": (n) =>
    panel(n, [
      { left: `INDEX: ${E.str(n.config.indexType, "HNSW").toUpperCase()}`, right: `SHARDS: ${Math.max(1, E.num(n.config.shardCount, 1))}` },
      { left: `HYBRID: ${E.str(n.config.hybridSearch) === "Enabled" ? "ON" : "OFF"}`, right: money(E.nodeCostUsd(n)), muted: true },
    ]),
  "batch-scoring-job": (n) => panel(n, [{ left: `INSTANCES: ${E.instancesOf(n)}`, right: money(E.nodeCostUsd(n)) }]),
  "disaster-recovery-region": (n) =>
    panel(n, [{ left: `RPO: ${q(E.num(n.config.rpoMinutes, 1440))} min`, right: `RTO: ${q(E.num(n.config.rtoMinutes, 720))} min` }]),
  "waiting-room": (n) => panel(n, [{ left: `ADMIT: ${q(E.num(n.config.admissionRatePerMinute, 1000))}/min`, right: money(E.nodeCostUsd(n)) }]),
  "key-generator": costOnly,
  "model-registry": costOnly,
  "experiment-tracker": costOnly,
  "data-validator": costOnly,
  "payment-gateway": costOnly,
  "media-packager": costOnly,
  "egress-proxy": costOnly,
  "dataset-store": costOnly,
  "feature-store": costOnly,
  "connection-pool": (n) => panel(n, [{ left: `DB CONNECTIONS: ${q(E.num(n.config.maxServerConnections, 100))}`, right: money(E.nodeCostUsd(n)) }]),
};

export function footerContext(graph: Graph, sim?: SimSpec): FooterContext {
  const memo = new Map<string, unknown>();
  const cached = <T,>(key: string, fn: () => T): T => {
    if (!memo.has(key)) memo.set(key, fn());
    return memo.get(key) as T;
  };
  let readings = new Map<string, E.ServerReading>();
  let memory = new Map<string, { memoryUtilizationPercent: number }>();
  try {
    if (sim?.sustainedRps) readings = new Map(E.runLoadTest(graph, sim.sustainedRps, sim.cpuMaxPercent ?? 80).perServer.map((r) => [r.nodeId, r]));
    if (sim?.memory) memory = new Map(E.resolveMemoryCapacity(graph, sim.memory).perServer.map((r) => [r.nodeId, r]));
  } catch {
    /* footers are best-effort */
  }
  return { graph, sim, cached, readings, memory };
}

export function footerFor(node: GraphNode, ctx: FooterContext): Footer | null {
  try {
    return FOOTERS[node.type]?.(node, ctx) ?? null;
  } catch {
    return null;
  }
}
