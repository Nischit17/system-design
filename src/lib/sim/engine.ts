import { componentLabel, getComponent } from "@/lib/catalog/components";
import type { Graph, GraphNode } from "./graph";
import {
  BATCH_INSTANCE_COST_USD,
  CACHE_SIZE_TABLE,
  DB_SIZE_TABLE,
  FEED_INSTANCE_COST_USD,
  FLAT_COST,
  GPU_TABLE,
  IMAGE_PROCESSOR_INSTANCE_COST_USD,
  KV_SIZE_TABLE,
  LOAD_BALANCER_CAPACITY_RPS,
  OBJECT_STORE_PREFIX_RPS,
  SEARCH_INDEXER_INSTANCE_COST_USD,
  SERVERLESS_COST_PER_CONCURRENCY_USD,
  SIZE_TABLE,
  STREAM_PARTITION_COST_USD,
  TRANSCODER_INSTANCE_COST_USD,
  VIDEO_ENCODER_INSTANCE_COST_USD,
  WEBSOCKET_INSTANCE_COST_USD,
  WORKER_INSTANCE_COST_USD,
} from "./tables";

/* ------------------------------------------------------------------ */
/* small helpers                                                        */
/* ------------------------------------------------------------------ */

export const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
export const str = (v: unknown, fallback = ""): string => (v === undefined || v === null ? fallback : String(v));
export const enabled = (node: GraphNode | undefined | null, key: string) => str(node?.config[key]) === "Enabled";
export const round1 = (n: number) => Math.round(n * 10) / 10;

export function formatQuantity(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  if (Math.abs(n) >= 1_000_000) return `${round1(n / 1_000_000)}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`;
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString();
  return String(round1(n));
}

export function nodesOf(g: Graph, ...types: string[]): GraphNode[] {
  return g.nodes.filter((n) => types.includes(n.type));
}
export function outgoing(g: Graph, id: string): GraphNode[] {
  const targets = new Set(g.edges.filter((e) => e.source === id).map((e) => e.target));
  return g.nodes.filter((n) => targets.has(n.id));
}
export function incoming(g: Graph, id: string): GraphNode[] {
  const sources = new Set(g.edges.filter((e) => e.target === id).map((e) => e.source));
  return g.nodes.filter((n) => sources.has(n.id));
}
export function linked(g: Graph, a: string, b: string): boolean {
  return g.edges.some((e) => e.source === a && e.target === b);
}
export function linkedEitherWay(g: Graph, a: string, b: string): boolean {
  return g.edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
}
export function reachable(g: Graph, fromId: string): Set<string> {
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of g.edges) {
      if (e.source === id && !seen.has(e.target)) {
        seen.add(e.target);
        stack.push(e.target);
      }
    }
  }
  return seen;
}

/** True when a directed path visits nodes of these types in order (direct hops). */
export function pathExists(g: Graph, types: string[]): boolean {
  if (types.length === 0) return true;
  let frontier = nodesOf(g, types[0]).map((n) => n.id);
  for (let i = 1; i < types.length; i++) {
    const next = new Set<string>();
    for (const id of frontier) for (const n of outgoing(g, id)) if (n.type === types[i]) next.add(n.id);
    frontier = [...next];
    if (frontier.length === 0) return false;
  }
  return frontier.length > 0;
}

/** Nodes with no edges at all (ignores single-node graphs). */
export function orphanNodes(g: Graph): GraphNode[] {
  if (g.nodes.length < 2) return [];
  return g.nodes.filter((n) => !g.edges.some((e) => e.source === n.id || e.target === n.id));
}

/* ------------------------------------------------------------------ */
/* capacity                                                             */
/* ------------------------------------------------------------------ */

const sizeOf = (node: GraphNode) => {
  const s = str(node.config.size);
  return s in SIZE_TABLE ? s : "Medium";
};
export const instancesOf = (node: GraphNode) => Math.max(1, Math.floor(num(node.config.instances, 1)));

export function serverCapacityRps(node: GraphNode): number {
  return SIZE_TABLE[sizeOf(node)].capacityRps * instancesOf(node);
}
export function serverMemoryGb(node: GraphNode): number {
  return SIZE_TABLE[sizeOf(node)].ramGb * instancesOf(node);
}
export function serverSizeLabel(node: GraphNode): string {
  const n = instancesOf(node);
  return n > 1 ? `${n} x ${sizeOf(node)}` : sizeOf(node);
}

export function dbSizeOf(node: GraphNode): string {
  const s = str(node.config.size);
  return s in DB_SIZE_TABLE ? s : "Small";
}
export function dbReadCapacity(node: GraphNode): number {
  if (node.type === "postgresql" || node.type === "mysql") return DB_SIZE_TABLE[dbSizeOf(node)].readCapacityPerSec;
  const kv = KV_SIZE_TABLE[str(node.config.size, "Small")] ?? KV_SIZE_TABLE.Small;
  return kv.readCapacityPerSec;
}
export function dbWriteCapacity(node: GraphNode): number {
  if (node.type === "postgresql" || node.type === "mysql") return DB_SIZE_TABLE[dbSizeOf(node)].writeCapacityPerSec;
  const kv = KV_SIZE_TABLE[str(node.config.size, "Small")] ?? KV_SIZE_TABLE.Small;
  return kv.writeCapacityPerSec;
}
export function cacheOpsCapacity(node: GraphNode): number {
  const t = CACHE_SIZE_TABLE[str(node.config.size, "Small")] ?? CACHE_SIZE_TABLE.Small;
  return t.opsPerSec * (1 + Math.max(0, num(node.config.replicas)));
}
export function cacheMemoryGb(node: GraphNode): number {
  return (CACHE_SIZE_TABLE[str(node.config.size, "Small")] ?? CACHE_SIZE_TABLE.Small).memoryGb;
}
/** Per-instance rates are fixed by each problem (passed in), never typed into the canvas. */
export function workerThroughputPerSec(node: GraphNode, ratePerInstance = 50): number {
  return Math.max(0, ratePerInstance) * instancesOf(node);
}
export const GATEWAY_CONNECTIONS_PER_INSTANCE = 50_000;
export function serverlessEstimatedRps(node: GraphNode): number {
  return Math.round((1000 / Math.max(1, num(node.config.avgDurationMs, 200))) * Math.max(0, num(node.config.concurrency, 10)));
}
export function llmTokensPerSec(node: GraphNode): number {
  const gpu = GPU_TABLE[str(node.config.gpuType, "H100")] ?? GPU_TABLE.H100;
  const batching = str(node.config.batchingMode) === "Continuous batching" ? 2.4 : 1;
  const quant = str(node.config.quantization) === "INT4" ? 2.2 : str(node.config.quantization) === "FP8" ? 1.6 : 1;
  const tier = str(node.config.modelTier).startsWith("Small") ? 4 : str(node.config.modelTier).startsWith("Flagship") ? 0.5 : 1;
  return Math.round(gpu.tokensPerSec * Math.max(1, num(node.config.gpuCount, 1)) * batching * quant * tier);
}
export function objectStoreRequestCapacity(node: GraphNode): number {
  return OBJECT_STORE_PREFIX_RPS * (str(node.config.keyLayout) === "Hashed prefixes" ? 8 : 1);
}
export function gatewayConnectionCapacity(node: GraphNode): number {
  return GATEWAY_CONNECTIONS_PER_INSTANCE * instancesOf(node);
}

/* ------------------------------------------------------------------ */
/* cost                                                                 */
/* ------------------------------------------------------------------ */

export function nodeCostUsd(node: GraphNode): number {
  switch (node.type) {
    case "application-server":
    case "model-server":
      return SIZE_TABLE[sizeOf(node)].monthlyCostUsd * instancesOf(node);
    case "postgresql":
    case "mysql": {
      const shards = str(node.config.partitioning) === "Enabled" ? Math.max(1, Math.floor(num(node.config.shardCount, 1))) : 1;
      return DB_SIZE_TABLE[dbSizeOf(node)].monthlyCostUsd * shards;
    }
    case "redis":
      return (CACHE_SIZE_TABLE[str(node.config.size, "Small")] ?? CACHE_SIZE_TABLE.Small).monthlyCostUsd * (1 + Math.max(0, num(node.config.replicas)));
    case "dynamodb":
    case "mongodb":
    case "cassandra":
      return (KV_SIZE_TABLE[str(node.config.size, "Small")] ?? KV_SIZE_TABLE.Small).monthlyCostUsd;
    case "elasticsearch":
    case "search-index": {
      const base = (KV_SIZE_TABLE[str(node.config.size, "Small")] ?? KV_SIZE_TABLE.Small).monthlyCostUsd;
      return base * (1 + Math.max(0, num(node.config.replicas)));
    }
    case "worker":
      return WORKER_INSTANCE_COST_USD * instancesOf(node);
    case "image-processor":
      return IMAGE_PROCESSOR_INSTANCE_COST_USD * instancesOf(node);
    case "video-encoder":
      return VIDEO_ENCODER_INSTANCE_COST_USD * instancesOf(node);
    case "transcoder":
      return TRANSCODER_INSTANCE_COST_USD * instancesOf(node);
    case "batch-scoring-job":
      return BATCH_INSTANCE_COST_USD * instancesOf(node);
    case "websocket-gateway":
      return WEBSOCKET_INSTANCE_COST_USD * instancesOf(node);
    case "feed-service":
      return FEED_INSTANCE_COST_USD * instancesOf(node);
    case "search-indexer":
      return SEARCH_INDEXER_INSTANCE_COST_USD * instancesOf(node);
    case "serverless-function":
      return SERVERLESS_COST_PER_CONCURRENCY_USD * Math.max(1, num(node.config.concurrency, 10));
    case "event-stream":
      return STREAM_PARTITION_COST_USD * Math.max(1, num(node.config.partitions, 1)) * Math.max(1, num(node.config.replicationFactor, 1));
    case "training-job":
    case "llm-inference-server": {
      const gpu = GPU_TABLE[str(node.config.gpuType, node.type === "training-job" ? "A100" : "H100")] ?? GPU_TABLE.A100;
      return gpu.monthlyCostUsd * Math.max(1, num(node.config.gpuCount, 1));
    }
    case "object-storage": {
      const cls = str(node.config.storageClass, "Standard");
      const base = cls === "Archive" ? 6 : cls === "Infrequent access" ? 14 : 25;
      return base;
    }
    case "labeling-queue":
      return Math.max(1, num(node.config.labelers, 10)) * 400;
    default:
      return FLAT_COST[node.type] ?? 0;
  }
}

export function totalCostUsd(g: Graph, types?: string[]): number {
  return g.nodes.filter((n) => !types || types.includes(n.type)).reduce((sum, n) => sum + nodeCostUsd(n), 0);
}

/* ------------------------------------------------------------------ */
/* topology + load tests                                               */
/* ------------------------------------------------------------------ */

export interface Topology {
  entry: GraphNode | null;
  lbs: GraphNode[];
  servers: GraphNode[];
  unreachable: GraphNode[];
}

/** The app tier: an entry point (load balancer or lone server) and the servers it can reach. */
export function resolveTopology(g: Graph, serverType = "application-server"): Topology {
  const servers = nodesOf(g, serverType);
  const lbs = nodesOf(g, "load-balancer", "api-gateway");
  const tier = [...servers, ...lbs];
  const tierIds = new Set(tier.map((n) => n.id));
  const targeted = new Set(g.edges.filter((e) => tierIds.has(e.source)).map((e) => e.target));
  const roots = tier.filter((n) => !targeted.has(n.id));
  const entry = roots.find((n) => n.type === "load-balancer") ?? roots.find((n) => n.type === "api-gateway") ?? roots[0] ?? null;
  if (!entry) return { entry: null, lbs, servers: [], unreachable: servers };
  if (entry.type === serverType) {
    return { entry, lbs, servers: [entry], unreachable: servers.filter((s) => s.id !== entry.id) };
  }
  // servers reachable from the entry through any chain of balancers/gateways
  const seen = reachable(g, entry.id);
  const served = servers.filter((s) => seen.has(s.id));
  return { entry, lbs, servers: served, unreachable: servers.filter((s) => !seen.has(s.id)) };
}

export function algorithmOf(entry: GraphNode | null): string {
  if (!entry || entry.type !== "load-balancer") return "Round Robin";
  return str(entry.config.algorithm, "Round Robin");
}

/** Fraction of traffic each server receives under the entry's routing algorithm. */
export function trafficShares(entry: GraphNode | null, servers: GraphNode[], capacityOf = serverCapacityRps): Map<string, number> {
  const shares = new Map<string, number>();
  if (servers.length === 0) return shares;
  if (!entry || entry.type === "application-server" || entry.type === "model-server") {
    servers.forEach((s) => shares.set(s.id, entry && s.id === entry.id ? 1 : servers.length === 1 ? 1 : 0));
    return shares;
  }
  const alg = algorithmOf(entry);
  const weightOf = (s: GraphNode) =>
    alg === "Weighted Round Robin"
      ? Math.max(0, num(s.config.trafficWeight, 25))
      : alg === "Least Connections"
        ? capacityOf(s)
        : instancesOf(s);
  let total = servers.reduce((sum, s) => sum + weightOf(s), 0);
  const fallbackEqual = total <= 0;
  if (fallbackEqual) total = servers.length;
  servers.forEach((s) => shares.set(s.id, (fallbackEqual ? 1 : weightOf(s)) / total));
  return shares;
}

export interface ServerReading {
  nodeId: string;
  label: string;
  sizeLabel: string;
  trafficRps: number;
  capacityRps: number;
  cpuPercent: number;
  passed: boolean;
}

export interface LoadTest {
  rps: number;
  totalCapacityRps: number;
  perServer: ServerReading[];
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRatePercent: number;
  lbOverloaded: boolean;
}

function latencyForUtil(u: number, baseMs: number) {
  if (u >= 1) return 2500;
  return baseMs / Math.max(0.04, 1 - u);
}

export function readingsFor(
  g: Graph,
  entry: GraphNode | null,
  servers: GraphNode[],
  rps: number,
  cpuMax: number,
  capacityOf = serverCapacityRps,
): ServerReading[] {
  const shares = trafficShares(entry, servers, capacityOf);
  return servers.map((s, i) => {
    const traffic = Math.round(rps * (shares.get(s.id) ?? 0));
    const cap = capacityOf(s);
    const cpu = cap > 0 ? Math.round((traffic / cap) * 100) : traffic > 0 ? 999 : 0;
    return {
      nodeId: s.id,
      label: `${componentLabel(s.type)} ${i + 1}`,
      sizeLabel: serverSizeLabel(s),
      trafficRps: traffic,
      capacityRps: cap,
      cpuPercent: cpu,
      passed: cpu <= cpuMax,
    };
  });
}

export function runLoadTest(g: Graph, rps: number, cpuMax = 80, serverType = "application-server"): LoadTest {
  const topo = resolveTopology(g, serverType);
  const capacityOf = serverCapacityRps;
  const perServer = readingsFor(g, topo.entry, topo.servers, rps, cpuMax, capacityOf);
  const totalCapacityRps = topo.servers.reduce((sum, s) => sum + capacityOf(s), 0);
  const overflow = perServer.reduce((sum, r) => sum + Math.max(0, r.trafficRps - r.capacityRps), 0);
  const lbOverloaded = topo.entry?.type === "load-balancer" && rps > LOAD_BALANCER_CAPACITY_RPS;
  const lbOverflow = lbOverloaded ? rps - LOAD_BALANCER_CAPACITY_RPS : 0;
  const served = perServer.length ? 0 : rps;
  const errorRps = Math.min(rps, overflow + lbOverflow + served);
  const totalTraffic = perServer.reduce((s, r) => s + r.trafficRps, 0) || 1;
  const meanLatency = perServer.length
    ? perServer.reduce((sum, r) => sum + latencyForUtil(r.trafficRps / Math.max(1, r.capacityRps), 22) * (r.trafficRps / totalTraffic), 0)
    : 2500;
  const worstUtil = perServer.reduce((m, r) => Math.max(m, r.trafficRps / Math.max(1, r.capacityRps)), 0);
  const worstLatency = latencyForUtil(worstUtil, 22);
  return {
    rps,
    totalCapacityRps,
    perServer,
    p50Ms: Math.round(Math.min(2500, meanLatency * 0.85)),
    p95Ms: Math.round(Math.min(5000, Math.max(meanLatency * 2.1, worstLatency * 1.4))),
    p99Ms: Math.round(Math.min(8000, Math.max(meanLatency * 3.2, worstLatency * 2.2))),
    errorRatePercent: rps > 0 ? round1((errorRps / rps) * 100) : 0,
    lbOverloaded,
  };
}

export interface FailureTest {
  rps: number;
  unhealthyLabel: string;
  healthChecksEnabled: boolean;
  perServer: ServerReading[];
  successfulRps: number;
  failedRps: number;
  passed: boolean;
}

/** Take the largest server out of rotation and replay the load. */
export function runFailureTest(g: Graph, rps: number, cpuMax = 80): FailureTest {
  const topo = resolveTopology(g);
  const lb = topo.entry?.type === "load-balancer" ? topo.entry : null;
  const healthChecks = !!lb && (enabled(lb, "healthChecks") || g.nodes.some((n) => n.type === "health-check" && linkedEitherWay(g, n.id, lb.id)));
  if (topo.servers.length === 0) {
    return { rps, unhealthyLabel: "every server", healthChecksEnabled: healthChecks, perServer: [], successfulRps: 0, failedRps: rps, passed: false };
  }
  const ordered = [...topo.servers];
  const victimIndex = ordered.reduce((best, s, i) => (serverCapacityRps(s) > serverCapacityRps(ordered[best]) ? i : best), 0);
  const victim = ordered[victimIndex];
  const label = `${componentLabel(victim.type)} ${victimIndex + 1}`;
  const survivors = ordered.filter((s) => s.id !== victim.id);
  let perServer: ServerReading[];
  let failed = 0;
  if (healthChecks) {
    perServer = readingsFor(g, topo.entry, survivors, rps, cpuMax).map((r) => ({
      ...r,
      label: `${componentLabel("application-server")} ${ordered.findIndex((s) => s.id === r.nodeId) + 1}`,
    }));
  } else {
    const shares = trafficShares(topo.entry, ordered);
    failed += Math.round(rps * (shares.get(victim.id) ?? 0));
    perServer = readingsFor(g, topo.entry, ordered, rps, cpuMax)
      .filter((r) => r.nodeId !== victim.id)
      .map((r) => ({ ...r, label: `${componentLabel("application-server")} ${ordered.findIndex((s) => s.id === r.nodeId) + 1}` }));
  }
  failed += perServer.reduce((sum, r) => sum + Math.max(0, r.trafficRps - r.capacityRps), 0);
  if (survivors.length === 0) failed = rps;
  failed = Math.min(rps, Math.round(failed));
  const successfulRps = rps - failed;
  return {
    rps,
    unhealthyLabel: label,
    healthChecksEnabled: healthChecks,
    perServer,
    successfulRps,
    failedRps: failed,
    passed: successfulRps >= 0.98 * rps && perServer.every((r) => r.passed),
  };
}

/* ------------------------------------------------------------------ */
/* memory (Little's law)                                                */
/* ------------------------------------------------------------------ */

export interface MemoryTarget {
  jobsPerSec: number;
  avgJobDurationSec: number;
  memoryPerJobMb: number;
  maxMemoryPercent: number;
}

export function resolveMemoryCapacity(g: Graph, t: MemoryTarget) {
  const topo = resolveTopology(g);
  const concurrency = t.jobsPerSec * t.avgJobDurationSec;
  const demandGb = (concurrency * t.memoryPerJobMb) / 1024;
  const shares = trafficShares(topo.entry, topo.servers);
  const perServer = topo.servers.map((s, i) => {
    const gb = demandGb * (shares.get(s.id) ?? 0);
    const ram = serverMemoryGb(s);
    const util = ram > 0 ? (gb / ram) * 100 : Infinity;
    return { nodeId: s.id, label: `Application Server ${i + 1}`, demandGb: gb, ramGb: ram, memoryUtilizationPercent: util };
  });
  const totalRam = topo.servers.reduce((sum, s) => sum + serverMemoryGb(s), 0);
  const worst = perServer.reduce((m, r) => Math.max(m, r.memoryUtilizationPercent), perServer.length ? 0 : Infinity);
  return {
    concurrency,
    demandGb,
    totalRamGb: totalRam,
    perServer,
    memoryUtilizationPercent: worst,
    fleetUtilizationPercent: totalRam > 0 ? (demandGb / totalRam) * 100 : Infinity,
  };
}

/* ------------------------------------------------------------------ */
/* workload isolation (API tier vs scheduled batch work)               */
/* ------------------------------------------------------------------ */

export interface IsolationTarget {
  /** jobs per second one worker instance completes */
  workerRatePerSec: number;
  apiRequestsPerSec: number;
  batchLoadPercent: number;
  maxUtilizationPercent: number;
  batchTotalJobs: number;
  batchDeadlineMinutes: number;
}

export function resolveComputeIsolation(g: Graph, t: IsolationTarget) {
  const topo = resolveTopology(g);
  const schedulers = nodesOf(g, "job-scheduler", "message-queue");
  const workers = nodesOf(g, "worker").filter((w) => schedulers.some((s) => linked(g, s.id, w.id)));
  const lbIds = new Set(topo.lbs.map((l) => l.id));
  const workerPoolSeparated =
    workers.length > 0 && !workers.some((w) => g.edges.some((e) => e.target === w.id && lbIds.has(e.source)));
  const apiCapacity = topo.servers.reduce((sum, s) => sum + serverCapacityRps(s), 0);
  const batchOnApi = !workerPoolSeparated;
  const apiUtil = apiCapacity > 0 ? (t.apiRequestsPerSec / apiCapacity) * 100 + (batchOnApi ? t.batchLoadPercent : 0) : Infinity;
  const workerRate = workers.reduce((sum, w) => sum + workerThroughputPerSec(w, t.workerRatePerSec), 0);
  const drainMinutes = workerRate > 0 ? t.batchTotalJobs / workerRate / 60 : Infinity;
  return { workers, workerPoolSeparated, apiUtilizationPercent: apiUtil, batchDrainMinutes: drainMinutes, workerRatePerSec: workerRate };
}

/* ------------------------------------------------------------------ */
/* relational database load                                             */
/* ------------------------------------------------------------------ */

export const isRelational = (n: GraphNode) => n.type === "postgresql" || n.type === "mysql";

export function primaryDbNode(g: Graph): GraphNode | null {
  const dbs = g.nodes.filter(isRelational);
  return dbs.find((d) => str(d.config.role) === "Primary") ?? dbs.find((d) => str(d.config.role) !== "Replica") ?? null;
}

export function replicasOf(g: Graph, primary: GraphNode | null): GraphNode[] {
  if (!primary) return [];
  return g.nodes.filter(
    (d) =>
      isRelational(d) &&
      d.id !== primary.id &&
      str(d.config.role) === "Replica" &&
      (str(d.config.replicatesFrom) === primary.id || linkedEitherWay(g, d.id, primary.id)),
  );
}

export interface CacheTarget {
  workingSetGb: number;
  /** average seconds between reads of the same key */
  reuseSeconds?: number;
  /** longest acceptable staleness when relying on TTL alone */
  maxStalenessSeconds?: number;
}

export function cacheHitRate(cache: GraphNode | null | undefined, t: CacheTarget): number {
  if (!cache) return 0;
  const ttl = Math.max(0, num(cache.config.ttlSeconds, 300));
  if (ttl === 0) return 0;
  const memFactor = Math.min(1, cacheMemoryGb(cache) / Math.max(0.1, t.workingSetGb));
  const policy = str(cache.config.evictionPolicy, "allkeys-lru");
  const policyFactor = policy === "noeviction" && memFactor < 1 ? 0.6 : policy === "allkeys-lfu" ? 1.02 : 1;
  const reuse = Math.max(1, t.reuseSeconds ?? 20);
  const ttlFactor = ttl / (ttl + reuse);
  return Math.min(0.99, 0.98 * memFactor * ttlFactor * policyFactor);
}

/** The cache node app servers read through (first Redis used as a cache that an app server talks to). */
export function readThroughCache(g: Graph, fromTypes = ["application-server"]): GraphNode | null {
  const froms = nodesOf(g, ...fromTypes);
  return (
    nodesOf(g, "redis").find(
      (r) => str(r.config.usage, "Cache") === "Cache" && froms.some((a) => linked(g, a.id, r.id)),
    ) ?? null
  );
}

export interface DbTarget {
  readsPerSec: number;
  writesPerSec: number;
  maxUtilizationPercent: number;
  cache?: CacheTarget;
}

export function resolveDatabaseLoad(g: Graph, t: DbTarget) {
  const primary = primaryDbNode(g);
  const replicas = replicasOf(g, primary);
  const apps = nodesOf(g, "application-server", "worker", "connection-pool");
  const readReplicas = replicas.filter((r) => apps.some((a) => linked(g, a.id, r.id)));
  const cache = t.cache ? readThroughCache(g) : null;
  const hit = t.cache ? cacheHitRate(cache, t.cache) : 0;
  const dbReads = t.readsPerSec * (1 - hit);
  const readers = primary ? [primary, ...readReplicas] : [];
  const readShare = readers.length ? dbReads / readers.length : dbReads;
  const primaryReadCap = primary ? dbReadCapacity(primary) : 0;
  const primaryWriteCap = primary ? dbWriteCapacity(primary) : 0;
  const primaryUtil = primary
    ? (primaryReadCap > 0 ? (readShare / primaryReadCap) * 100 : readShare > 0 ? Infinity : 0) +
      (primaryWriteCap > 0 ? (t.writesPerSec / primaryWriteCap) * 100 : t.writesPerSec > 0 ? Infinity : 0)
    : Infinity;
  const replicaUtil = readReplicas.length
    ? Math.max(...readReplicas.map((r) => (dbReadCapacity(r) > 0 ? (readShare / dbReadCapacity(r)) * 100 : Infinity)))
    : null;
  const writeUtil = primaryWriteCap > 0 ? (t.writesPerSec / primaryWriteCap) * 100 : t.writesPerSec > 0 ? Infinity : 0;
  return {
    primary,
    replicas,
    readReplicas,
    cache,
    hitRatePercent: hit * 100,
    dbReadsPerSec: dbReads,
    primaryUtilizationPercent: primaryUtil,
    replicaUtilizationPercent: replicaUtil,
    primaryWriteUtilizationPercent: writeUtil,
    worstUtilizationPercent: Math.max(primaryUtil, replicaUtil ?? 0),
  };
}

export function resolveConnections(g: Graph) {
  const primary = primaryDbNode(g);
  const pools = nodesOf(g, "connection-pool").filter((p) => primary && linked(g, p.id, primary.id));
  const apps = nodesOf(g, "application-server", "worker");
  let total = 0;
  for (const a of apps) {
    const viaPool = pools.some((p) => linked(g, a.id, p.id));
    if (viaPool) continue;
    if (primary && linked(g, a.id, primary.id)) total += instancesOf(a) * Math.max(1, num(a.config.dbConnectionsPerInstance, 20));
  }
  for (const p of pools) total += Math.max(1, num(p.config.maxServerConnections, 100));
  const max = primary ? Math.max(1, num(primary.config.maxConnections, 100)) : 0;
  return { primary, pools, totalConnections: total, maxConnections: max, exhausted: !primary || total > max };
}

/* ------------------------------------------------------------------ */
/* queues                                                               */
/* ------------------------------------------------------------------ */

export interface QueueTarget {
  /** jobs per second one worker instance completes */
  workerRatePerSec: number;
  arrivalPerSec: number;
  backlogJobs: number;
  maxDrainMinutes: number;
  maxWorkerUtilizationPercent?: number;
}

export function resolveQueueBacklog(g: Graph, t: QueueTarget) {
  const queue = nodesOf(g, "message-queue")[0] ?? null;
  const workers = queue ? outgoing(g, queue.id).filter((n) => n.type === "worker" || n.type === "serverless-function") : [];
  const service = workers.reduce(
    (sum, w) => sum + (w.type === "worker" ? workerThroughputPerSec(w, t.workerRatePerSec) : serverlessEstimatedRps(w)),
    0,
  );
  const net = service - t.arrivalPerSec;
  const drainMinutes = net > 0 ? t.backlogJobs / net / 60 : Infinity;
  const util = service > 0 ? (t.arrivalPerSec / service) * 100 : Infinity;
  return { queue, workers, serviceRatePerSec: service, drainMinutes, workerUtilizationPercent: util };
}

/* ------------------------------------------------------------------ */
/* CDN                                                                  */
/* ------------------------------------------------------------------ */

export interface CdnTarget {
  requestsPerSec: number;
  cacheableFraction: number;
  contentType?: string;
  originCapacityRps: number;
  maxOriginUtilizationPercent: number;
  farRegionLatencyMs?: number;
}

export function resolveCdn(g: Graph, t?: CdnTarget) {
  const cdn = nodesOf(g, "cdn")[0] ?? null;
  const target: CdnTarget =
    t ?? { requestsPerSec: 1000, cacheableFraction: 0.8, originCapacityRps: 1000, maxOriginUtilizationPercent: 80 };
  const clientsFront = cdn ? incoming(g, cdn.id).some((n) => n.category === "client" || n.type === "dns") : false;
  const hasOrigin = cdn ? outgoing(g, cdn.id).length > 0 : false;
  let hit = 0;
  if (cdn && hasOrigin) {
    const content = str(cdn.config.cachedContent);
    const contentMatch = !target.contentType || content === target.contentType || content === "Static + API GETs" ? 1 : 0.35;
    const ttl = Math.max(0, num(cdn.config.ttlSeconds, 3600));
    const ttlFactor = ttl / (ttl + 60);
    hit = Math.min(0.98, 0.97 * contentMatch * ttlFactor);
  }
  const shield = enabled(cdn, "originShield");
  const missRps = target.requestsPerSec * (1 - target.cacheableFraction * hit);
  const originRps = shield ? target.requestsPerSec * (1 - target.cacheableFraction) + (missRps - target.requestsPerSec * (1 - target.cacheableFraction)) * 0.2 : missRps;
  const util = target.originCapacityRps > 0 ? (originRps / target.originCapacityRps) * 100 : Infinity;
  const global = str(cdn?.config.edgeLocations, "Global") === "Global";
  const far = target.farRegionLatencyMs ?? 600;
  const regionalP95 = cdn && hasOrigin && global ? Math.round(far * (1 - hit * target.cacheableFraction) + 35 * hit * target.cacheableFraction) : far;
  return {
    cdn,
    clientsFront,
    hitRatePercent: hit * 100,
    originRps,
    originUtilizationPercent: util,
    regionalP95Ms: regionalP95,
  };
}

/* ------------------------------------------------------------------ */
/* sharding                                                             */
/* ------------------------------------------------------------------ */

export interface ShardTarget {
  writesPerSec: number;
  /** partition keys that spread load evenly */
  goodKeys: string[];
  /** keys that concentrate traffic: share of writes landing on the hottest shard */
  hotKeys?: Record<string, number>;
  /** monotonically increasing keys (time, sequence ids) */
  monotonicKeys?: string[];
  maxShardUtilizationPercent: number;
}

export function resolveShardDistribution(g: Graph, t: ShardTarget) {
  const db = primaryDbNode(g) ?? nodesOf(g, "dynamodb", "cassandra", "mongodb")[0] ?? null;
  if (!db) return { db: null, shards: 0, key: "", hotShareFraction: 1, hottestShardUtilizationPercent: Infinity };
  const partitioned = isRelational(db) ? enabled(db, "partitioning") : true;
  const shards = partitioned ? Math.max(1, Math.floor(num(db.config.shardCount, 1))) : 1;
  const key = str(db.config.partitionKey).trim().toLowerCase();
  const strategy = str(db.config.partitionStrategy, "Hash");
  let share = 1 / shards;
  if (shards > 1) {
    if (!key) share = 1;
    else if (t.monotonicKeys?.includes(key) && strategy === "Range") share = 1;
    else if (t.hotKeys && key in t.hotKeys) share = Math.max(1 / shards, t.hotKeys[key]);
    else if (!t.goodKeys.includes(key)) share = Math.min(1, 2.5 / shards);
    else share = (1 / shards) * 1.1;
  }
  const cap = dbWriteCapacity(db);
  const util = cap > 0 ? ((t.writesPerSec * share) / cap) * 100 : Infinity;
  return { db, shards, key, hotShareFraction: share, hottestShardUtilizationPercent: util };
}

/* ------------------------------------------------------------------ */
/* request chain latency                                                */
/* ------------------------------------------------------------------ */

/** Sum of per-hop latency along the slowest path from `fromType`. Hop costs come from `hopMs`. */
export function chainLatencyMs(g: Graph, fromType: string, hopMs: Record<string, number>): number {
  const start = nodesOf(g, fromType)[0];
  if (!start) return 0;
  const memo = new Map<string, number>();
  const visit = (id: string, depth: number): number => {
    if (depth > 20) return 0;
    if (memo.has(id)) return memo.get(id)!;
    const node = g.nodes.find((n) => n.id === id);
    const own = node ? (hopMs[node.type] ?? 2) : 0;
    const next = outgoing(g, id);
    const tail = next.length ? Math.max(...next.map((n) => visit(n.id, depth + 1))) : 0;
    const total = own + tail;
    memo.set(id, total);
    return total;
  };
  return visit(start.id, 0);
}

/* ------------------------------------------------------------------ */
/* misc                                                                 */
/* ------------------------------------------------------------------ */

export function describeFlow(g: Graph): string[] {
  // longest simple path starting at a node with no incoming edges
  const roots = g.nodes.filter((n) => !g.edges.some((e) => e.target === n.id));
  let best: string[] = [];
  const walk = (id: string, path: string[], seen: Set<string>) => {
    const node = g.nodes.find((n) => n.id === id);
    if (!node) return;
    const nextPath = [...path, getComponent(node.type)?.label ?? node.type];
    if (nextPath.length > best.length) best = nextPath;
    for (const n of outgoing(g, id)) if (!seen.has(n.id)) walk(n.id, nextPath, new Set([...seen, n.id]));
  };
  for (const r of roots.length ? roots : g.nodes.slice(0, 1)) walk(r.id, [], new Set([r.id]));
  return best;
}
