import type { Check, ProblemDef, Scenario } from "../types";
import { configIs, connects, fmt, healthChecksOn, node as n, numberAtLeast, numberAtMost, rule, wire as w } from "../builders";
import type { Ctx } from "@/lib/sim/evaluate";
import * as E from "@/lib/sim/engine";

type GraphNode = ReturnType<Ctx["nodes"]>[number];

const SEC = (n: number) => `/tracks/expert-system-architecture/sections/expert-system-architecture-section-${n}`;

/* ---------- authoring helpers ---------- */

const sc = (id: string, label: string, narrative: string, checks: Check[], required = true): Scenario => ({ id, label, narrative, required, checks });
/** Expert problems are graded by scenarios; the first scenario doubles as the core requirement list. */
const expert = (def: Omit<ProblemDef, "checks">): ProblemDef => ({ ...def, checks: def.scenarios![0].checks });

/* ---------- shared checks ---------- */

const tierRps = (c: Ctx) => c.topology().servers.reduce((s, x) => s + E.serverCapacityRps(x), 0);
const survivorRps = (c: Ctx) => {
  const caps = c.topology().servers.map((x) => E.serverCapacityRps(x));
  return caps.length < 2 ? 0 : caps.reduce((a, b) => a + b, 0) - Math.max(...caps);
};
const lbHealth = (c: Ctx) => c.nodes("load-balancer").some((l) => E.str(l.config.healthChecks) === "Enabled");
const val = (v: number | ((c: Ctx) => number), c: Ctx) => (typeof v === "number" ? v : v(c));

function serves(rps: number | ((c: Ctx) => number), cpu: number, text: string, points = 15): Check {
  return rule(text, (c) => tierRps(c) > 0 && (val(rps, c) / tierRps(c)) * 100 <= cpu, {
    category: "capacity",
    label: "Capacity",
    points,
    pass: (c) => `The tier provides ${fmt(tierRps(c))} RPS: ${Math.round((val(rps, c) / tierRps(c)) * 100)}% at ${fmt(val(rps, c))} RPS.`,
    fail: (c) => `The tier provides ${fmt(tierRps(c))} RPS; ${fmt(val(rps, c))} RPS at ${cpu}% needs ${fmt(Math.ceil((val(rps, c) * 100) / cpu))}.`,
  });
}
function survives(rps: number | ((c: Ctx) => number), cpu: number, text: string, points = 15): Check {
  return rule(text, (c) => lbHealth(c) && survivorRps(c) > 0 && (val(rps, c) / survivorRps(c)) * 100 <= cpu, {
    category: "reliability",
    label: "Server loss",
    points,
    fail: (c) =>
      !lbHealth(c)
        ? "The load balancer has no health checks, so it keeps routing to the failed group."
        : `After losing the largest server group, ${fmt(survivorRps(c))} RPS remain for ${fmt(val(rps, c))} RPS.`,
  });
}
const wsCapacity = (c: Ctx) => c.nodes("websocket-gateway").reduce((s, g) => s + E.gatewayConnectionCapacity(g), 0);
const holds = (count: number, points = 15): Check =>
  rule(`Hold ${fmt(count)} concurrent connections at 70% or less of gateway capacity.`, (c) => wsCapacity(c) * 0.7 >= count, {
    category: "capacity",
    label: "Connections",
    points,
    fail: (c) => `Gateways hold ${fmt(wsCapacity(c))} connections; ${fmt(count)} at 70% needs ${fmt(Math.ceil(count / 0.7))} (50,000 per instance).`,
  });
const workerRate = (c: Ctx, perInstance: number, from?: string) =>
  c
    .nodes("worker")
    .filter((x) => !from || E.incoming(c.g, x.id).some((i) => i.type === from))
    .reduce((s, x) => s + E.workerThroughputPerSec(x, perInstance), 0);
const cacheOps = (c: Ctx) => c.nodes("redis").reduce((s, r) => s + E.cacheOpsCapacity(r), 0);
const reaches = (c: Ctx, fromType: string, toType: string) =>
  c.nodes(fromType).some((f) => [...E.reachable(c.g, f.id)].some((id) => c.g.nodes.find((x) => x.id === id)?.type === toType));
const sharedRegistry = (c: Ctx) => c.is("websocket-gateway", "connectionState", "Shared registry");
const replicatedStore = (c: Ctx) =>
  c.nodes("dynamodb", "cassandra", "mongodb").some((d) => E.num(d.config.replicationFactor) >= 3) ||
  c.nodes("postgresql", "mysql").some((d) => E.str(d.config.role) !== "Replica" && E.replicasOf(c.g, d).length > 0 && E.str(d.config.autoFailover) === "Enabled");
const cdnFronted = (c: Ctx, content: string[]) =>
  c.nodes("cdn").some(
    (d) =>
      E.incoming(c.g, d.id).some((x) => x.category === "client" || x.type === "dns") && E.outgoing(c.g, d.id).length > 0 && content.includes(E.str(d.config.cachedContent)),
  );
const cdcIndex = (c: Ctx) =>
  c.nodes("search-indexer").some(
    (i) =>
      E.str(i.config.mode) === "Change data capture" &&
      E.incoming(c.g, i.id).some((x) => x.category === "database") &&
      E.outgoing(c.g, i.id).some((x) => x.type === "elasticsearch" || x.type === "search-index"),
  );
const percentiles = (c: Ctx) => c.is("metrics-store", "aggregation", "Percentiles (p50/p95/p99)");
const immutableAudit = (c: Ctx) => c.nodes("audit-log").some((a) => E.str(a.config.immutable) === "Enabled");
const idempotentWorkers = (c: Ctx) => c.has("worker") && c.all("worker", "idempotent", "Enabled");
const queueSafety = (c: Ctx) => c.nodes("message-queue").some((q) => E.str(q.config.retry) === "Enabled" && E.str(q.config.dlqEnabled) === "Enabled" && E.num(q.config.maxRetries) > 0);
const keyIs = (node: GraphNode | undefined, key: string) => E.str(node?.config.partitionKey).trim().toLowerCase() === key;
const streamKeyed = (c: Ctx, key: string) => c.nodes("event-stream").some((s) => keyIs(s, key));
const directUploads = (c: Ctx) => c.nodes("upload-service").some((u) => E.str(u.config.uploadMethod) === "Direct / Signed URL" && E.outgoing(c.g, u.id).some((x) => x.type === "object-storage"));
const drRegion = (c: Ctx, rto = 30) =>
  c.nodes("disaster-recovery-region").some((d) => ["Warm standby", "Active-active"].includes(E.str(d.config.mode)) && E.num(d.config.rtoMinutes) > 0 && E.num(d.config.rtoMinutes) <= rto);

/* ================= Section 1: Core Backend Systems ================= */

const ORIGIN_SHARE = 0.2;
const redirectOrigin = (c: Ctx) => 20000 * (cdnFronted(c, ["Static + API GETs"]) ? ORIGIN_SHARE : 1);
const shortenerApps = ["s1", "s2", "s3"];
const urlShortener = expert({
  code: "EX0001",
  slug: "url-shortener",
  title: "URL Shortener",
  difficulty: "Medium",
  minutes: 35,
  description:
    "Design a link-shortening service. Users create about 200 short links per second and every link must stay unique and resolvable for years. Redirects outnumber creations 100 to 1 and reach 20,000 per second when a link goes viral. Redirects should feel instant, survive the loss of a server group, and feed click analytics without slowing down.",
  guide: {
    title: "Core request path",
    description: "Cache redirects at the edge, generate codes without coordination, and keep link data durable.",
    flow: ["web-client", "cdn", "load-balancer", "application-server", "dynamodb"],
    extra: [
      { title: "Code generation", flow: ["application-server", "key-generator"] },
      { title: "Click analytics", flow: ["application-server", "event-stream", "worker", "cassandra"] },
    ],
    notes: ["About 80% of redirects are for links already cached at the edge.", "62^7 is about 3.5 trillion codes."],
  },
  concepts: ["Key generation at scale", "Read-heavy caching", "Async analytics"],
  reading: [{ title: "Core backend systems learning path", description: "Review ID generation and caching.", href: `${SEC(1)}#url-shortener` }],
  components: ["web-client", "cdn", "load-balancer", "application-server", "key-generator", "redis", "dynamodb", "postgresql", "event-stream", "worker", "cassandra"],
  scenarios: [
    sc("core", "Create and redirect", "Links are created and resolved correctly, with codes that never collide.", [
      rule("Use a load balancer as the entry point for the application tier.", (c) => c.topology().entry?.type === "load-balancer", { category: "validity", label: "Entry point" }),
      connects("application-server", "key-generator", "Generate short codes with a key generation service.", "Correctness", 15),
      rule("Use codes of at least 7 characters, handed out in batches of 100 or more.", (c) => c.nodes("key-generator").some((k) => E.num(k.config.keyLength) >= 7 && E.num(k.config.batchSize) >= 100), {
        category: "Correctness",
        label: "Code space",
      }),
      rule("Store links in a durable database.", (c) => apps(c).some((a) => E.outgoing(c.g, a.id).some((x) => ["dynamodb", "postgresql", "cassandra", "mysql"].includes(x.type))), {
        category: "validity",
        label: "Link store",
      }),
    ]),
    sc("viral", "Viral link", "A link is shared by a celebrity and redirects jump to 20,000 per second.", [
      rule("Cache redirects at a CDN in front of the load balancer.", (c) => cdnFronted(c, ["Static + API GETs"]), { category: "Latency", label: "Edge cache", points: 15 }),
      serves(redirectOrigin, 80, "Serve the redirects that reach the origin at 80% CPU or less."),
      rule("Cache hot links in Redis so the database only sees misses.", (c) => c.edge("application-server", "redis"), { category: "capacity", label: "Link cache" }),
    ]),
    sc("failure", "Zone failure", "One server group and one database node fail at peak.", [
      healthChecksOn(),
      survives(redirectOrigin, 90, "Keep origin redirects at 90% CPU or less after losing the largest server group."),
      rule("Replicate the link store at least 3 ways.", replicatedStore, { category: "reliability", label: "Durable links" }),
    ]),
    sc("analytics", "Click analytics", "Marketing wants per-link click counts without slowing redirects.", [
      rule("Publish clicks to an event stream consumed by workers, never writing analytics on the redirect path.", (c) => c.path("application-server", "event-stream", "worker") && !c.edge("application-server", "cassandra"), {
        category: "quality",
        label: "Async analytics",
        points: 15,
      }),
      numberAtLeast("event-stream", "partitions", 6, "Partition the click stream at least 6 ways.", "capacity", 10),
    ], false),
  ],
  reference: {
    config: [
      "CDN caches redirects (API GETs, 5-minute TTL); 4,000 RPS reach origin.",
      "Three server groups of 3 Large (7,200 RPS, 56%); losing one leaves 4,800 RPS (83%).",
      "Key generator: counter + Base62, 7 characters, batches of 1,000.",
      "Redis cache in front of DynamoDB (replication factor 3); clicks go to an event stream.",
    ],
    explanation: [
      "Redirects are reads of immutable data, which makes them ideal for caching at every layer.",
      "Batch-allocated counters give unique codes with no per-request coordination.",
      "Analytics never blocks a redirect: clicks become events processed later.",
    ],
    graph: {
      nodes: [
        n("web", "web-client", 40, 240),
        n("cdn", "cdn", 240, 240, { cachedContent: "Static + API GETs", ttlSeconds: 300 }),
        n("lb", "load-balancer", 440, 240, { healthChecks: "Enabled" }),
        ...shortenerApps.map((id, i) => n(id, "application-server", 660, 110 + i * 130, { size: "Large", instances: 3 })),
        n("kg", "key-generator", 920, 40, { strategy: "Counter + Base62", keyLength: 7, batchSize: 1000 }),
        n("cache", "redis", 920, 170, { size: "Medium" }),
        n("links", "dynamodb", 920, 300, { size: "Medium", replicationFactor: 3 }),
        n("stream", "event-stream", 920, 430, { partitions: 6, replicationFactor: 3 }),
        n("clicks", "worker", 1160, 430, { instances: 2 }),
        n("store", "cassandra", 1400, 430, { replicationFactor: 3 }),
      ],
      edges: [...w("web>cdn>lb", "stream>clicks>store"), ...shortenerApps.flatMap((s) => w(`lb>${s}`, `${s}>kg`, `${s}>cache`, `${s}>links`, `${s}>stream`))],
    },
  },
});
function apps(c: Ctx) {
  return c.nodes("application-server");
}

const providersReached = (c: Ctx) => ["push-provider", "email-provider", "sms-provider"].every((t) => reaches(c, "notification-orchestrator", t));
const notificationPlatform = expert({
  code: "EX0002",
  slug: "notification-platform",
  title: "Notification Platform",
  difficulty: "Hard",
  minutes: 40,
  description:
    "Design a notification platform that every product team uses to send push, email and SMS. Campaigns push it to 50,000 notifications per second, yet a password-reset or fraud alert must still arrive within seconds. The platform respects user preferences and quiet hours, never sends the same notification twice, and keeps working when a provider goes down.",
  guide: {
    title: "Core delivery path",
    description: "Accept requests fast, queue them by priority, and let an orchestrator decide channel, timing and dedup.",
    flow: ["api-gateway", "application-server", "message-queue", "notification-orchestrator"],
    extra: [{ title: "Channels", flow: ["notification-orchestrator", "rate-limiter", "push-provider"] }],
    notes: ["Providers throttle accounts that burst too hard.", "Transactional and marketing traffic have different urgency."],
  },
  concepts: ["Priority queues", "Channel orchestration", "Provider failover"],
  reading: [{ title: "Core backend systems learning path", description: "Review fan-out and delivery guarantees.", href: `${SEC(1)}#notifications` }],
  components: ["api-gateway", "application-server", "message-queue", "notification-orchestrator", "rate-limiter", "push-provider", "email-provider", "sms-provider", "postgresql", "redis"],
  scenarios: [
    sc("core", "Fan-out to channels", "Product teams send notifications through one API and users get them on the right channel.", [
      connects("application-server", "message-queue", "Accept requests and enqueue them, returning immediately.", "Latency"),
      rule("Route each notification through an orchestrator that reaches push, email and SMS providers.", (c) => c.path("message-queue", "notification-orchestrator") && providersReached(c), {
        category: "validity",
        label: "Channels",
        points: 15,
      }),
      rule("Respect user preferences and quiet hours.", (c) => c.is("notification-orchestrator", "userPreferences", "Enabled") && c.is("notification-orchestrator", "quietHours", "Enabled"), {
        category: "Correctness",
        label: "Preferences",
        points: 15,
      }),
    ]),
    sc("blast", "Marketing blast", "Five million marketing emails are queued when a fraud alert needs to go out.", [
      configIs("message-queue", "priority", "Priority lanes", "Give transactional and security notifications their own priority lane.", "Latency", 20),
      numberAtLeast("notification-orchestrator", "dedupWindowMinutes", 5, "Drop duplicate sends within a dedup window of at least 5 minutes.", "Correctness", 10),
      rule("Rate limit outbound sends so a blast doesn't get the provider account throttled.", (c) => reaches(c, "notification-orchestrator", "rate-limiter"), { category: "reliability", label: "Send rate" }),
    ]),
    sc("outage", "Provider outage", "The SMS provider goes down for 30 minutes.", [
      configIs("notification-orchestrator", "channelFallback", "Enabled", "Fall back to another channel when a provider fails.", "reliability", 15),
      rule("Retry failed sends and dead-letter the ones that never succeed.", queueSafety, { category: "reliability", label: "Retries" }),
    ]),
    sc("tracking", "Delivery tracking", "Support wants to see whether a given notification was delivered.", [
      rule("Record delivery status for every notification.", (c) => c.nodes("notification-orchestrator").some((o) => E.outgoing(c.g, o.id).some((x) => x.category === "database")), { category: "quality", label: "Receipts" }),
    ], false),
  ],
  reference: {
    config: [
      "Gateway -> notification API -> queue with priority lanes (retries, DLQ).",
      "Orchestrator: preferences, quiet hours, 10-minute dedup, channel fallback; writes receipts to PostgreSQL.",
      "Outbound rate limiter in front of push, email and SMS providers.",
    ],
    explanation: [
      "Separate lanes keep urgent notifications from queueing behind bulk campaigns.",
      "The orchestrator centralizes policy, so every team gets preferences, dedup and fallback for free.",
    ],
    graph: {
      nodes: [
        n("gw", "api-gateway", 40, 220, { auth: "API key" }),
        n("api", "application-server", 260, 220, { size: "Medium", instances: 2 }),
        n("q", "message-queue", 480, 220, { priority: "Priority lanes", retry: "Enabled", maxRetries: 5, dlqEnabled: "Enabled" }),
        n("orch", "notification-orchestrator", 700, 220, { dedupWindowMinutes: 10, quietHours: "Enabled", channelFallback: "Enabled", userPreferences: "Enabled" }),
        n("rl", "rate-limiter", 920, 220, { algorithm: "Token bucket", requestsPerSecond: 50000, scope: "Global" }),
        n("push", "push-provider", 1140, 90),
        n("email", "email-provider", 1140, 220),
        n("sms", "sms-provider", 1140, 350),
        n("db", "postgresql", 700, 400, { size: "Medium" }),
      ],
      edges: w("gw>api>q>orch>rl>push", "rl>email", "rl>sms", "orch>db"),
    },
  },
});

const rateLimiter = expert({
  code: "EX0003",
  slug: "distributed-rate-limiter",
  title: "Distributed Rate Limiter",
  difficulty: "Medium",
  minutes: 35,
  description:
    "Design the rate limiter for a public API that runs on 40 gateway nodes. Each customer is limited to 100 requests per second in total, not per node, and limit checks peak at 200,000 per second. Limits must be smooth (no bursts at window boundaries), survive a counter-store failure, and recover gracefully after an outage.",
  guide: {
    title: "Core request path",
    description: "Gateways consult a limiter whose counters live in a shared, replicated store.",
    flow: ["web-client", "api-gateway", "rate-limiter", "redis"],
    secondary: { title: "Allowed requests", flow: ["api-gateway", "application-server"] },
    notes: ["A fixed window lets a client send 200 requests in one second across a boundary."],
  },
  concepts: ["Global limits", "Token buckets and sliding windows", "Counter-store sizing"],
  reading: [{ title: "Core backend systems learning path", description: "Review rate-limiting algorithms.", href: `${SEC(1)}#rate-limiting` }],
  components: ["web-client", "api-gateway", "rate-limiter", "redis", "application-server"],
  scenarios: [
    sc("core", "Accurate limits", "A customer must get exactly 100 req/s across every gateway node.", [
      rule("Check limits from the gateway through a rate limiter backed by Redis.", (c) => c.path("api-gateway", "rate-limiter", "redis"), { category: "validity", label: "Limiter path" }),
      configIs("rate-limiter", "store", "Shared (Redis)", "Keep counters in a shared store so limits are global, not per node.", "Correctness", 20),
      configIs("rate-limiter", "scope", "Per client", "Limit each customer separately.", "Correctness", 10),
      rule("Use a sliding window or token bucket so clients can't double their rate at window boundaries.", (c) => c.nodes("rate-limiter").some((r) => ["Sliding window", "Token bucket"].includes(E.str(r.config.algorithm))), {
        category: "Correctness",
        label: "Smooth limits",
        points: 15,
      }),
    ]),
    sc("scale", "200,000 checks per second", "Peak traffic means 200,000 counter operations per second.", [
      rule("Size the counter store for 200,000 operations per second at 70% or less.", (c) => cacheOps(c) * 0.7 >= 200000, {
        category: "capacity",
        label: "Counter throughput",
        points: 20,
        fail: (c) => `Redis provides ${fmt(cacheOps(c))} ops/s; 200,000 at 70% needs ${fmt(285715)}.`,
      }),
      configIs("redis", "usage", "Rate limit counters", "Dedicate the Redis cluster to rate-limit counters.", "quality", 10),
    ]),
    sc("failover", "Counter-store failover", "A Redis node fails and later the whole API recovers from an outage.", [
      rule("Run Redis with at least one replica so a node failure doesn't reset every limit.", (c) => c.nodes("redis").some((r) => E.num(r.config.replicas) >= 1), { category: "reliability", label: "Replicas", points: 15 }),
      configIs("rate-limiter", "rampUpStrategy", "Gradual", "Ramp limits back up gradually after recovery so waiting clients don't stampede.", "reliability", 10),
    ]),
    sc("identity", "Customer identity", "Limits must follow customers, not IP addresses that many customers share.", [
      rule("Authenticate every client at the gateway.", (c) => c.nodes("api-gateway").some((g) => E.str(g.config.auth) !== "None"), { category: "Security", label: "Authentication" }),
    ], false),
  ],
  reference: {
    config: ["Gateway (API keys) -> rate limiter (token bucket, 100 req/s per client, shared Redis counters, gradual ramp-up).", "Redis Large with one replica: 400,000 ops/s, 50% at peak."],
    explanation: [
      "Local counters multiply a limit by the node count; a shared store enforces one global number.",
      "Token buckets allow short, bounded bursts while holding the long-run rate exactly.",
    ],
    graph: {
      nodes: [
        n("web", "web-client", 40, 200),
        n("gw", "api-gateway", 260, 200, { auth: "API key", rateLimitPerClientRps: 100 }),
        n("rl", "rate-limiter", 260, 400, { algorithm: "Token bucket", requestsPerSecond: 100, scope: "Per client", store: "Shared (Redis)", rampUpStrategy: "Gradual" }),
        n("redis", "redis", 520, 400, { size: "Large", replicas: 1, usage: "Rate limit counters" }),
        n("api", "application-server", 520, 200, { size: "Large", instances: 4 }),
      ],
      edges: w("web>gw>rl>redis", "gw>api"),
    },
  },
});

const fileSync = expert({
  code: "EX0004",
  slug: "dropbox",
  title: "Dropbox",
  difficulty: "Hard",
  minutes: 45,
  description:
    "Design a file sync service in the style of Dropbox. Users keep folders in sync across laptops and phones, files can be up to 10 GB, and connections drop all the time. A one-line edit to a large file shouldn't re-upload the whole file, identical files shouldn't be stored twice, and other devices should see changes within seconds.",
  guide: {
    title: "Core sync path",
    description: "File bytes go straight to object storage in chunks; metadata goes through the API; changes are pushed to devices.",
    flow: ["web-client", "chunking-service", "upload-service", "object-storage"],
    extra: [
      { title: "Metadata", flow: ["web-client", "api-gateway", "application-server", "postgresql"] },
      { title: "Change notifications", flow: ["application-server", "pub-sub", "websocket-gateway"] },
    ],
    notes: ["Chunk hashes double as dedup keys.", "Devices hold a WebSocket open to hear about changes."],
  },
  concepts: ["Chunked, resumable uploads", "Content deduplication", "Change notification"],
  reading: [{ title: "Core backend systems learning path", description: "Review large-file handling.", href: `${SEC(1)}#file-sync` }],
  components: ["web-client", "api-gateway", "application-server", "postgresql", "chunking-service", "upload-service", "object-storage", "pub-sub", "websocket-gateway", "cdn"],
  scenarios: [
    sc("core", "Upload and sync", "A user saves a 2 GB video and edits a document on their laptop.", [
      rule("Upload file bytes directly to object storage with signed URLs, not through the app servers.", directUploads, { category: "Efficiency", label: "Direct upload", points: 15 }),
      rule("Keep file metadata behind the API in PostgreSQL.", (c) => c.path("api-gateway", "application-server", "postgresql"), { category: "validity", label: "Metadata" }),
      rule("Split files into chunks of 8 MB or less so a small edit re-uploads only changed chunks.", (c) =>
        c.nodes("chunking-service").some((s) => E.num(s.config.chunkSizeMb) > 0 && E.num(s.config.chunkSizeMb) <= 8 && E.outgoing(c.g, s.id).some((x) => x.type === "upload-service" || x.type === "object-storage")), {
        category: "Efficiency",
        label: "Chunking",
        points: 15,
      }),
    ]),
    sc("flaky", "Flaky connections and duplicates", "Uploads fail halfway on trains, and many users store the same files.", [
      configIs("chunking-service", "resumable", "Enabled", "Resume interrupted uploads from the last confirmed chunk.", "reliability", 15),
      configIs("chunking-service", "dedup", "Enabled", "Deduplicate identical chunks so the same content is stored once.", "cost", 10),
    ]),
    sc("notify", "Change notification", "A change on the laptop should appear on the phone within seconds.", [
      rule("Push change events through pub/sub to WebSocket gateways that devices stay connected to.", (c) => c.path("application-server", "pub-sub", "websocket-gateway") && c.edge("web-client", "websocket-gateway"), {
        category: "Latency",
        label: "Push changes",
        points: 15,
      }),
      configIs("websocket-gateway", "connectionState", "Shared registry", "Track which gateway holds each device's connection in a shared registry.", "Correctness", 10),
    ]),
    sc("downloads", "Downloads at scale", "A shared folder link goes viral and thousands download the same files.", [
      rule("Serve downloads through a CDN in front of object storage.", (c) => c.nodes("cdn").some((d) => E.outgoing(c.g, d.id).some((x) => x.type === "object-storage")), { category: "Latency", label: "CDN" }),
    ], false),
  ],
  reference: {
    config: [
      "Client -> chunking service (4 MB chunks, dedup, resumable) -> upload service (signed URLs) -> object storage.",
      "Client -> gateway -> metadata service -> PostgreSQL; metadata changes -> pub/sub -> WebSocket gateways (shared registry).",
      "CDN in front of object storage for downloads.",
    ],
    explanation: [
      "Chunking turns a 10 GB problem into many small, resumable, deduplicable ones.",
      "Keeping bytes off the app servers means the API only handles small metadata requests.",
    ],
    graph: {
      nodes: [
        n("client", "web-client", 40, 260),
        n("gw", "api-gateway", 260, 120, { auth: "JWT" }),
        n("meta", "application-server", 500, 120, { size: "Large", instances: 2 }),
        n("db", "postgresql", 740, 40, { size: "Medium" }),
        n("bus", "pub-sub", 740, 180),
        n("ws", "websocket-gateway", 980, 180, { instances: 2, connectionState: "Shared registry" }),
        n("chunker", "chunking-service", 260, 320, { chunkSizeMb: 4, dedup: "Enabled", resumable: "Enabled" }),
        n("upload", "upload-service", 500, 320, { uploadMethod: "Direct / Signed URL" }),
        n("store", "object-storage", 740, 320),
        n("cdn", "cdn", 500, 460, { cachedContent: "Static assets" }),
      ],
      edges: w("client>gw>meta>db", "meta>bus>ws", "client>ws", "client>chunker>upload>store", "client>cdn>store"),
    },
  },
});

const messaging = expert({
  code: "EX0005",
  slug: "whatsapp",
  title: "WhatsApp",
  difficulty: "Hard",
  minutes: 50,
  sectionChallenge: true,
  description:
    "Design a mobile messaging service in the style of WhatsApp for 5 million concurrently connected users. Messages arrive in order within each conversation, are never shown twice, and wait safely for recipients who are offline. Groups have up to 1,024 members, users see who is online, and message history is kept durably.",
  guide: {
    title: "Core message path",
    description: "Devices hold WebSocket connections; messages are logged per conversation and fanned out by consumers.",
    flow: ["mobile-client", "load-balancer", "websocket-gateway", "application-server", "event-stream", "worker"],
    extra: [
      { title: "Connection routing", flow: ["websocket-gateway", "session-registry"] },
      { title: "Offline delivery", flow: ["worker", "push-provider"] },
    ],
    notes: ["Each gateway instance holds about 50,000 connections.", "Ordering only holds within a partition."],
  },
  concepts: ["Connection routing", "Per-conversation ordering", "Offline delivery"],
  reading: [{ title: "Core backend systems learning path", description: "Review real-time messaging.", href: `${SEC(1)}#messaging` }],
  components: ["mobile-client", "load-balancer", "websocket-gateway", "session-registry", "presence-service", "application-server", "event-stream", "worker", "cassandra", "push-provider", "upload-service", "object-storage", "cdn"],
  scenarios: [
    sc("core", "Real-time delivery", "Five million users are online and messages must reach them in under a second.", [
      rule("Connect devices through a load balancer to WebSocket gateways.", (c) => c.path("mobile-client", "load-balancer", "websocket-gateway"), { category: "validity", label: "Connections" }),
      holds(5_000_000),
      rule("Record which gateway holds each user's connection in a shared session registry.", (c) => sharedRegistry(c) && c.edge("websocket-gateway", "session-registry"), {
        category: "Correctness",
        label: "Routing",
        points: 15,
      }),
    ]),
    sc("ordering", "Ordering and offline users", "Two messages sent quickly must arrive in order, even to a phone that was off.", [
      rule("Log messages in an event stream partitioned by conversation_id (12+ partitions).", (c) => c.nodes("event-stream").some((s) => keyIs(s, "conversation_id") && E.num(s.config.partitions) >= 12), {
        category: "Ordering",
        label: "Per-chat order",
        points: 15,
      }),
      rule("Store message history in Cassandra replicated 3 ways.", (c) => c.nodes("cassandra").some((d) => E.num(d.config.replicationFactor) >= 3), { category: "reliability", label: "History" }),
      rule("Notify offline users through a push provider.", (c) => c.path("worker", "push-provider"), { label: "Offline push" }),
      rule("Make message consumers idempotent so a retried delivery never shows twice.", idempotentWorkers, { category: "Correctness", label: "No duplicates" }),
    ]),
    sc("groups", "Groups and presence", "A 1,024-member group is busy while everyone watches who is online.", [
      rule("Fan out group messages with stream consumers (2+ instances), not in the sender's request.", (c) => c.path("event-stream", "worker") && c.nodes("worker").some((x) => E.instancesOf(x) >= 2), {
        category: "Latency",
        label: "Async fan-out",
      }),
      rule("Track online status with a presence service using heartbeats of 30 seconds or less.", (c) =>
        c.nodes("presence-service").some((p) => E.num(p.config.heartbeatSeconds) > 0 && E.num(p.config.heartbeatSeconds) <= 30 && E.incoming(c.g, p.id).some((x) => x.type === "websocket-gateway")), {
        label: "Presence",
      }),
    ]),
    sc("media", "Photos and voice notes", "Users start sending photos and voice notes.", [
      rule("Upload media directly to object storage and serve it through a CDN.", (c) => directUploads(c) && c.nodes("cdn").some((d) => E.outgoing(c.g, d.id).some((x) => x.type === "object-storage")), {
        category: "Efficiency",
        label: "Media path",
        points: 15,
      }),
    ], false),
  ],
  reference: {
    config: [
      "Layer 4 load balancer -> 150 WebSocket gateway instances (7.5M connections, 67% at 5M) with a shared session registry.",
      "Chat service -> event stream (48 partitions keyed by conversation_id, RF 3) -> idempotent fan-out workers.",
      "Workers deliver online messages via the gateways, store history in Cassandra (RF 3) and push to offline devices.",
    ],
    explanation: [
      "A shared registry lets any server find the gateway holding a recipient's connection.",
      "Keying the log by conversation gives per-chat ordering while thousands of chats proceed in parallel.",
      "Offline users get a push; the durable log means nothing is lost while they're away.",
    ],
    graph: {
      nodes: [
        n("mobile", "mobile-client", 40, 260),
        n("lb", "load-balancer", 240, 260, { layer: "Layer 4", healthChecks: "Enabled" }),
        n("ws", "websocket-gateway", 460, 260, { instances: 150, connectionState: "Shared registry" }),
        n("registry", "session-registry", 460, 80, { ttlSeconds: 60 }),
        n("presence", "presence-service", 460, 440, { heartbeatSeconds: 20 }),
        n("chat", "application-server", 700, 260, { size: "Large", instances: 4 }),
        n("stream", "event-stream", 940, 260, { partitions: 48, partitionKey: "conversation_id", replicationFactor: 3, retentionHours: 72 }),
        n("fanout", "worker", 1180, 260, { instances: 8, idempotent: "Enabled" }),
        n("history", "cassandra", 1420, 140, { size: "Large", replicationFactor: 3 }),
        n("push", "push-provider", 1420, 380),
        n("upload", "upload-service", 240, 520, { uploadMethod: "Direct / Signed URL" }),
        n("media", "object-storage", 460, 600),
        n("cdn", "cdn", 240, 660, { cachedContent: "Images" }),
      ],
      edges: w("mobile>lb>ws>chat>stream>fanout>history", "ws>registry", "ws>presence", "fanout>push", "fanout>ws", "mobile>upload>media", "mobile>cdn>media"),
    },
  },
});

/* ================= Section 2: Consumer Systems at Scale ================= */

const FEED_RATE = 10000;
const feedRate = (c: Ctx) => c.nodes("feed-service").reduce((s, f) => s + E.instancesOf(f) * FEED_RATE, 0);
const timelineFeed = expert({
  code: "EX0006",
  slug: "twitter-x-feed",
  title: "Twitter/X Feed",
  difficulty: "Hard",
  minutes: 45,
  description:
    "Design the home timeline of a microblogging service in the style of Twitter/X. Users publish 6,000 posts per second and read timelines 300,000 times per second, expecting them in under 200 ms. Some accounts have 50 million followers. Timelines are ranked, and posts must never be lost.",
  guide: {
    title: "Core timeline path",
    description: "Precompute timelines for most users and merge celebrity posts at read time.",
    flow: ["web-client", "load-balancer", "application-server", "feed-service", "redis"],
    extra: [{ title: "Post fan-out", flow: ["application-server", "event-stream", "feed-service"] }],
    notes: ["Each feed service instance serves about 10,000 timeline reads per second.", "Fan-out on write for a 50M-follower account means 50M writes per post."],
  },
  concepts: ["Fan-out on write vs. read", "The celebrity problem", "Timeline caching"],
  reading: [{ title: "Consumer systems learning path", description: "Review feed architectures.", href: `${SEC(2)}#feeds` }],
  components: ["web-client", "load-balancer", "application-server", "feed-service", "redis", "event-stream", "ranking-service", "cassandra", "cdn", "object-storage"],
  scenarios: [
    sc("core", "Fast timelines", "300,000 timeline reads per second, each in under 200 ms.", [
      rule("Serve timelines from a feed service that precomputes them (fan-out on write or hybrid).", (c) =>
        c.edge("application-server", "feed-service") && c.nodes("feed-service").some((f) => ["Fan-out on write", "Hybrid"].includes(E.str(f.config.strategy))), {
        category: "Latency",
        label: "Precomputed timelines",
        points: 20,
      }),
      connects("feed-service", "redis", "Keep precomputed timelines in Redis.", "Latency"),
      rule("Size the feed tier for 300,000 reads per second at 75% or less.", (c) => feedRate(c) * 0.75 >= 300000, {
        category: "capacity",
        label: "Feed capacity",
        points: 15,
        fail: (c) => `Feed instances serve ${fmt(feedRate(c))} reads/s; 300,000 at 75% needs 40 instances.`,
      }),
      rule("Size the timeline cache for 300,000 operations per second at 70% or less.", (c) => cacheOps(c) * 0.7 >= 300000, { category: "capacity", label: "Cache capacity" }),
    ]),
    sc("celebrity", "Celebrity posts", "An account with 50 million followers posts during a live event.", [
      configIs("feed-service", "strategy", "Hybrid", "Use a hybrid strategy: fan out on write for most accounts, merge celebrity posts at read time.", "Latency", 15),
      rule("Treat accounts above 1 million followers or fewer as celebrities.", (c) => c.nodes("feed-service").some((f) => E.num(f.config.celebrityThreshold) > 0 && E.num(f.config.celebrityThreshold) <= 1_000_000), {
        label: "Celebrity threshold",
      }),
      rule("Fan posts out asynchronously from an event stream.", (c) => c.path("application-server", "event-stream") && (c.edge("event-stream", "feed-service") || c.edge("event-stream", "worker")), {
        category: "Latency",
        label: "Async fan-out",
      }),
    ]),
    sc("ranked", "Ranked and durable", "Timelines are ranked by relevance and no post is ever lost.", [
      rule("Rank timelines with a ranking service that uses more than recency.", (c) =>
        c.edge("feed-service", "ranking-service") && c.nodes("ranking-service").some((r) => E.str(r.config.model) !== "Recency"), {
        label: "Ranking",
      }),
      rule("Store posts in Cassandra replicated 3 ways.", (c) => c.nodes("cassandra").some((d) => E.num(d.config.replicationFactor) >= 3) && c.edge("application-server", "cassandra"), {
        category: "reliability",
        label: "Post store",
      }),
    ]),
    sc("media", "Images in posts", "Posts start carrying images viewed millions of times.", [
      rule("Serve post images through a CDN backed by object storage.", (c) => cdnFronted(c, ["Images", "Static assets", "Static + API GETs"]) && reaches(c, "cdn", "object-storage"), {
        category: "Latency",
        label: "Image CDN",
      }),
    ], false),
  ],
  reference: {
    config: [
      "Feed service: hybrid, celebrity threshold 500,000 followers, 40 instances (400,000 reads/s, 75%), timelines in Redis Large with 2 replicas.",
      "Posts -> event stream (32 partitions) -> feed service fan-out; posts stored in Cassandra (RF 3).",
      "Learned ranker re-orders each timeline.",
    ],
    explanation: [
      "Fan-out on write makes reads cheap but celebrity posts expensive; fan-out on read is the reverse. Hybrid uses each where it's cheap.",
      "Timelines live in memory because a 200 ms budget leaves no room for scatter-gather on every read.",
    ],
    graph: {
      nodes: [
        n("web", "web-client", 40, 240),
        n("lb", "load-balancer", 240, 240, { healthChecks: "Enabled" }),
        n("api", "application-server", 460, 240, { size: "Large", instances: 6 }),
        n("feed", "feed-service", 700, 140, { strategy: "Hybrid", celebrityThreshold: 500000, instances: 40 }),
        n("timelines", "redis", 940, 60, { size: "Large", replicas: 2 }),
        n("rank", "ranking-service", 940, 200, { model: "Learned ranker" }),
        n("stream", "event-stream", 460, 420, { partitions: 32, replicationFactor: 3 }),
        n("posts", "cassandra", 700, 380, { size: "Large", replicationFactor: 3 }),
        n("cdn", "cdn", 240, 520, { cachedContent: "Images" }),
        n("media", "object-storage", 460, 560),
      ],
      edges: w("web>lb>api>feed>timelines", "feed>rank", "api>stream>feed", "api>posts", "web>cdn>media"),
    },
  },
});

const IMG_RATE = 50;
const photoSharing = expert({
  code: "EX0007",
  slug: "instagram",
  title: "Instagram",
  difficulty: "Hard",
  minutes: 45,
  description:
    "Design a photo-sharing service in the style of Instagram. Users upload 1,500 photos per second at peak, each resized into several renditions. Photos are viewed 500,000 times per second around the world, almost all of them cacheable. Followers see new photos in their feed quickly, and post metadata must survive a database failure.",
  guide: {
    title: "Core photo path",
    description: "Upload directly to storage, resize asynchronously, and serve every view from the edge.",
    flow: ["mobile-client", "upload-service", "object-storage"],
    extra: [
      { title: "Processing", flow: ["application-server", "message-queue", "image-processor", "object-storage"] },
      { title: "Viewing", flow: ["mobile-client", "cdn", "object-storage"] },
    ],
    notes: ["Each image processor instance handles about 50 photos per second."],
  },
  concepts: ["Async media processing", "Global image delivery", "Feed generation"],
  reading: [{ title: "Consumer systems learning path", description: "Review media pipelines.", href: `${SEC(2)}#photos` }],
  components: ["mobile-client", "upload-service", "object-storage", "load-balancer", "application-server", "message-queue", "image-processor", "cdn", "feed-service", "redis", "postgresql"],
  scenarios: [
    sc("core", "Upload pipeline", "1,500 photos per second arrive and must be ready in every size within seconds.", [
      configIs("upload-service", "uploadMethod", "Direct / Signed URL", "Upload photos straight to object storage with signed URLs.", "Efficiency", 15),
      rule("Resize asynchronously: queue jobs for image processors that write renditions to object storage.", (c) =>
        c.path("message-queue", "image-processor") && c.nodes("image-processor").some((p) => E.outgoing(c.g, p.id).some((x) => x.type === "object-storage")), {
        category: "Latency",
        label: "Async resize",
        points: 15,
      }),
      rule("Size image processing for 1,500 photos per second at 80% or less.", (c) => c.nodes("image-processor").reduce((s, p) => s + E.instancesOf(p) * IMG_RATE, 0) * 0.8 >= 1500, {
        category: "capacity",
        label: "Processing capacity",
        points: 15,
      }),
    ]),
    sc("global", "Global viewing", "500,000 photo views per second from every continent.", [
      rule("Serve images from a global CDN in front of object storage.", (c) =>
        c.nodes("cdn").some((d) => E.str(d.config.cachedContent) === "Images" && E.str(d.config.edgeLocations, "Global") === "Global" && E.outgoing(c.g, d.id).some((x) => x.type === "object-storage")), {
        category: "Latency",
        label: "Image CDN",
        points: 15,
      }),
      configIs("cdn", "originShield", "Enabled", "Add an origin shield so CDN misses don't stampede object storage.", "capacity", 10),
      configIs("object-storage", "keyLayout", "Hashed prefixes", "Spread object keys across hashed prefixes to raise storage throughput.", "capacity", 10),
    ]),
    sc("feed", "Feeds and metadata", "Followers see new photos quickly and a database failure loses nothing.", [
      rule("Build feeds with a feed service backed by Redis.", (c) => c.path("application-server", "feed-service", "redis"), { category: "Latency", label: "Feeds" }),
      rule("Store post metadata with a replica and automatic failover.", replicatedStore, { category: "reliability", label: "Metadata" }),
    ]),
    sc("retries", "Processing failures", "A corrupt upload keeps crashing the resizer.", [
      rule("Retry failed resize jobs a bounded number of times and dead-letter the rest.", queueSafety, { category: "reliability", label: "Dead letters" }),
    ], false),
  ],
  reference: {
    config: [
      "Upload service (signed URLs) -> object storage (hashed prefixes).",
      "Post API -> queue (retries, DLQ) -> 40 image processors (2,000 photos/s, 75%) -> object storage.",
      "Global CDN for images with origin shield; feed service on Redis; PostgreSQL primary + replica with auto failover.",
    ],
    explanation: [
      "Uploading through app servers would make them proxy terabytes; signed URLs keep them on metadata only.",
      "At 500,000 views/s, the CDN is the system. Object storage only sees the misses.",
    ],
    graph: {
      nodes: [
        n("mobile", "mobile-client", 40, 260),
        n("upload", "upload-service", 260, 420, { uploadMethod: "Direct / Signed URL" }),
        n("store", "object-storage", 1020, 420, { keyLayout: "Hashed prefixes" }),
        n("lb", "load-balancer", 260, 140, { healthChecks: "Enabled" }),
        n("api", "application-server", 500, 140, { size: "Large", instances: 3 }),
        n("q", "message-queue", 760, 280, { retry: "Enabled", maxRetries: 5, dlqEnabled: "Enabled" }),
        n("resize", "image-processor", 1020, 280, { instances: 40 }),
        n("feed", "feed-service", 760, 40, { strategy: "Fan-out on write", instances: 6 }),
        n("fcache", "redis", 1020, 40, { size: "Medium" }),
        n("db", "postgresql", 760, 160, { size: "Medium", role: "Primary", autoFailover: "Enabled" }),
        n("rep", "postgresql", 1020, 160, { size: "Medium", role: "Replica", replicatesFrom: "ref-db" }),
        n("cdn", "cdn", 500, 560, { cachedContent: "Images", edgeLocations: "Global", originShield: "Enabled" }),
      ],
      edges: w("mobile>upload>store", "mobile>lb>api>q>resize>store", "api>feed>fcache", "api>db>rep", "mobile>cdn>store"),
    },
  },
});

const ENCODE_DEMAND = 30000;
const encodeRate = (c: Ctx) =>
  c.nodes("video-encoder").reduce((s, v) => s + E.instancesOf(v) * (E.str(v.config.ladder).includes("6") ? 200 : E.str(v.config.ladder).includes("4") ? 300 : 600), 0);
const videoPlatform = expert({
  code: "EX0008",
  slug: "youtube",
  title: "YouTube",
  difficulty: "Hard",
  minutes: 50,
  description:
    "Design a video platform in the style of YouTube. Creators upload 30,000 minutes of video every minute, often over unreliable connections, and each video must be encoded into adaptive renditions with playback manifests. Millions of viewers stream at once, and every title is searchable within moments of publishing.",
  guide: {
    title: "Core video path",
    description: "Resumable uploads to storage, queued encoding into an adaptive ladder, and segment delivery from the edge.",
    flow: ["web-client", "chunking-service", "upload-service", "object-storage"],
    extra: [
      { title: "Encoding", flow: ["application-server", "message-queue", "video-encoder", "manifest-generator"] },
      { title: "Playback", flow: ["web-client", "cdn", "object-storage"] },
    ],
    notes: ["One encoder instance handles 300 video-minutes per minute with 4 renditions, or 200 with 6."],
  },
  concepts: ["Adaptive bitrate encoding", "Segment delivery", "Search freshness"],
  reading: [{ title: "Consumer systems learning path", description: "Review video pipelines.", href: `${SEC(2)}#video` }],
  components: ["web-client", "chunking-service", "upload-service", "object-storage", "load-balancer", "application-server", "message-queue", "video-encoder", "manifest-generator", "cdn", "postgresql", "search-indexer", "elasticsearch", "event-stream", "worker"],
  scenarios: [
    sc("core", "Upload and encode", "30,000 minutes of video arrive every minute and must be watchable soon after.", [
      rule("Upload videos as resumable chunks, directly to object storage.", (c) => c.is("chunking-service", "resumable", "Enabled") && directUploads(c), { category: "Efficiency", label: "Resumable upload", points: 15 }),
      rule("Encode from a queue into an adaptive bitrate ladder.", (c) => c.path("message-queue", "video-encoder") && c.nodes("video-encoder").some((v) => E.str(v.config.ladder).startsWith("Adaptive")), {
        category: "quality",
        label: "Adaptive ladder",
        points: 15,
      }),
      rule("Size encoding for 30,000 video-minutes per minute at 80% or less.", (c) => encodeRate(c) * 0.8 >= ENCODE_DEMAND, {
        category: "capacity",
        label: "Encoding capacity",
        points: 15,
        fail: (c) => `Encoders process ${fmt(encodeRate(c))} video-minutes per minute; 30,000 at 80% needs 37,500.`,
      }),
      connects("video-encoder", "manifest-generator", "Generate playback manifests after encoding.", "validity"),
    ]),
    sc("streaming", "Streaming to millions", "A launch premiere draws millions of simultaneous viewers.", [
      rule("Serve video segments from a global CDN with an origin shield.", (c) =>
        c.nodes("cdn").some((d) => E.str(d.config.cachedContent) === "Video segments" && E.str(d.config.edgeLocations, "Global") === "Global" && E.str(d.config.originShield) === "Enabled"), {
        category: "Latency",
        label: "Segment CDN",
        points: 20,
      }),
      rule("Store segments under hashed key prefixes.", (c) => c.nodes("object-storage").every((o) => E.str(o.config.keyLayout) === "Hashed prefixes") && c.has("object-storage"), { category: "capacity", label: "Key layout" }),
    ]),
    sc("metadata", "Metadata and search", "New videos are searchable within moments and metadata reads scale.", [
      rule("Keep video metadata in PostgreSQL with a read replica.", (c) => {
        const p = E.primaryDbNode(c.g);
        return !!p && E.replicasOf(c.g, p).length > 0;
      }, { category: "capacity", label: "Metadata" }),
      rule("Index titles and descriptions for search with change data capture.", cdcIndex, { label: "Search index" }),
    ]),
    sc("views", "View counts", "View counters update for millions of plays without hammering the database.", [
      rule("Count views through an event stream consumed by workers.", (c) => c.path("application-server", "event-stream", "worker"), { label: "View events" }),
    ], false),
  ],
  reference: {
    config: [
      "Chunking (8 MB, resumable) -> upload service (signed URLs) -> raw object storage.",
      "API -> queue -> 160 encoders (4 renditions; 48,000 video-min/min, 63%) -> manifest generator (HLS + DASH) -> segment storage.",
      "Global CDN for video segments with origin shield; PostgreSQL + replica; CDC indexer into Elasticsearch.",
    ],
    explanation: [
      "Encoding is the expensive, bursty part, so it sits behind a queue and scales independently.",
      "Adaptive ladders let each player pick the bitrate its network can sustain.",
    ],
    graph: {
      nodes: [
        n("creator", "web-client", 40, 120),
        n("chunk", "chunking-service", 260, 120, { chunkSizeMb: 8, resumable: "Enabled" }),
        n("upload", "upload-service", 480, 120, { uploadMethod: "Direct / Signed URL" }),
        n("raw", "object-storage", 700, 120, { keyLayout: "Hashed prefixes" }),
        n("lb", "load-balancer", 260, 320, { healthChecks: "Enabled" }),
        n("api", "application-server", 480, 320, { size: "Large", instances: 3 }),
        n("q", "message-queue", 700, 320, { retry: "Enabled", maxRetries: 3, dlqEnabled: "Enabled" }),
        n("enc", "video-encoder", 920, 320, { instances: 160, ladder: "Adaptive (4 renditions)" }),
        n("manifest", "manifest-generator", 1140, 320, { format: "HLS + DASH" }),
        n("segments", "object-storage", 1360, 320, { keyLayout: "Hashed prefixes" }),
        n("viewer", "web-client", 1140, 60),
        n("cdn", "cdn", 1360, 160, { cachedContent: "Video segments", edgeLocations: "Global", originShield: "Enabled" }),
        n("db", "postgresql", 700, 480, { size: "Medium", role: "Primary" }),
        n("rep", "postgresql", 920, 600, { size: "Medium", role: "Replica", replicatesFrom: "ref-db" }),
        n("indexer", "search-indexer", 920, 480, { mode: "Change data capture", instances: 2 }),
        n("es", "elasticsearch", 1140, 480, { size: "Medium", replicas: 1 }),
        n("views", "event-stream", 480, 520, { partitions: 12, replicationFactor: 3 }),
        n("counter", "worker", 480, 660, { instances: 2 }),
      ],
      edges: w("creator>chunk>upload>raw", "creator>lb>api>q>enc>manifest>segments", "enc>segments", "viewer>cdn>segments", "api>db>rep", "db>indexer>es", "api>es", "api>views>counter>db"),
    },
  },
});

const streaming = expert({
  code: "EX0009",
  slug: "netflix",
  title: "Netflix",
  difficulty: "Hard",
  minutes: 50,
  description:
    "Design a subscription streaming service in the style of Netflix. A catalog of 20,000 titles is encoded ahead of time and protected with DRM. At evening peak 15 million streams play at once, playback should start within two seconds, and every home page is personalized. The service has to keep playing even if an entire region goes down.",
  guide: {
    title: "Core playback path",
    description: "Pre-encode and package titles, then stream segments from the edge while the API personalizes the experience.",
    flow: ["web-client", "dns", "cdn", "object-storage"],
    extra: [
      { title: "Studio pipeline", flow: ["object-storage", "video-encoder", "media-packager", "object-storage"] },
      { title: "Home page", flow: ["dns", "load-balancer", "application-server", "ranking-service"] },
    ],
    notes: ["The API tier handles about 12,000 requests per second at peak."],
  },
  concepts: ["Pre-encoded catalogs", "DRM packaging", "Regional failover"],
  reading: [{ title: "Consumer systems learning path", description: "Review streaming at scale.", href: `${SEC(2)}#streaming` }],
  components: ["web-client", "dns", "cdn", "object-storage", "video-encoder", "media-packager", "load-balancer", "application-server", "ranking-service", "redis", "cassandra", "event-stream", "worker", "disaster-recovery-region"],
  scenarios: [
    sc("core", "Playback", "15 million viewers press play during the evening peak.", [
      rule("Encode each title into an adaptive ladder of 6 renditions.", (c) => c.is("video-encoder", "ladder", "Adaptive (6 renditions)"), { label: "Encoding ladder" }),
      rule("Package titles with DRM before they reach storage.", (c) => c.path("video-encoder", "media-packager") && c.is("media-packager", "drm", "Enabled"), { category: "Security", label: "DRM", points: 15 }),
      rule("Stream video segments from a global CDN with an origin shield.", (c) =>
        cdnFronted(c, ["Video segments"]) && c.nodes("cdn").some((d) => E.str(d.config.originShield) === "Enabled" && E.str(d.config.edgeLocations, "Global") === "Global"), {
        category: "Latency",
        label: "Segment CDN",
        points: 20,
      }),
    ]),
    sc("home", "Personalized home page", "Every viewer gets their own rows of recommendations, fast.", [
      rule("Rank home-page rows with a learned ranking model.", (c) => c.edge("application-server", "ranking-service") && c.is("ranking-service", "model", "Learned ranker"), { label: "Personalization" }),
      connects("application-server", "redis", "Cache each viewer's home page in Redis.", "Latency"),
      serves(12000, 75, "Serve 12,000 API requests per second at 75% CPU or less."),
    ]),
    sc("region", "Region outage", "An entire cloud region fails during peak viewing.", [
      rule("Route viewers to healthy regions with health-checked DNS (failover or latency routing).", (c) =>
        c.nodes("dns").some((d) => E.str(d.config.healthChecks) === "Enabled" && ["Failover", "Latency based"].includes(E.str(d.config.routingPolicy))), {
        category: "reliability",
        label: "DNS failover",
        points: 15,
      }),
      rule("Keep a warm-standby or active-active region with recovery in 15 minutes or less.", (c) => drRegion(c, 15), { category: "reliability", label: "Second region", points: 15 }),
    ]),
    sc("history", "Viewing history", "Every play, pause and resume is recorded for 'continue watching'.", [
      rule("Record viewing events through an event stream into Cassandra.", (c) => c.path("application-server", "event-stream", "worker", "cassandra"), { label: "History pipeline" }),
    ], false),
  ],
  reference: {
    config: [
      "Masters -> 20 encoders (6 renditions) -> DRM packager -> segment storage (hashed prefixes).",
      "Latency-based DNS with health checks -> global CDN (video segments, origin shield) and the API load balancer.",
      "API: 12 XL instances (16,200 RPS, 74%) -> learned ranker, Redis home-page cache, Cassandra history; active-active second region.",
    ],
    explanation: [
      "A fixed catalog can be encoded once, offline; peak load is pure delivery, which the CDN absorbs.",
      "Personalization runs on the API path but is cached, so ranking cost scales with users, not page loads.",
    ],
    graph: {
      nodes: [
        n("masters", "object-storage", 40, 60),
        n("enc", "video-encoder", 260, 60, { instances: 20, ladder: "Adaptive (6 renditions)" }),
        n("pack", "media-packager", 480, 60, { drm: "Enabled" }),
        n("segs", "object-storage", 700, 60, { keyLayout: "Hashed prefixes" }),
        n("viewer", "web-client", 40, 300),
        n("dns", "dns", 260, 300, { routingPolicy: "Latency based", healthChecks: "Enabled" }),
        n("cdn", "cdn", 480, 200, { cachedContent: "Video segments", edgeLocations: "Global", originShield: "Enabled" }),
        n("lb", "load-balancer", 480, 380, { healthChecks: "Enabled" }),
        n("api", "application-server", 700, 380, { size: "XL", instances: 12 }),
        n("rank", "ranking-service", 940, 260, { model: "Learned ranker" }),
        n("home", "redis", 940, 380, { size: "Medium" }),
        n("events", "event-stream", 940, 500, { partitions: 24, replicationFactor: 3 }),
        n("hist", "worker", 1160, 500, { instances: 4 }),
        n("history", "cassandra", 1380, 500, { size: "Large", replicationFactor: 3 }),
        n("dr", "disaster-recovery-region", 260, 480, { mode: "Active-active", rpoMinutes: 1, rtoMinutes: 5 }),
      ],
      edges: w("masters>enc>pack>segs", "viewer>dns>cdn>segs", "dns>lb>api>rank", "api>home", "api>events>hist>history", "dns>dr"),
    },
  },
});

const rideHailing = expert({
  code: "EX0010",
  slug: "uber",
  title: "Uber",
  difficulty: "Hard",
  minutes: 55,
  sectionChallenge: true,
  description:
    "Design a ride-hailing platform in the style of Uber. One million active drivers send their location every four seconds, and riders expect to be matched with a nearby driver within seconds. A driver must never be assigned two trips at once, trips are charged exactly once when they end, and busy cities shouldn't overload the system.",
  guide: {
    title: "Core matching path",
    description: "Drivers stream locations into a sharded geo index; a matching service queries it and records trips consistently.",
    flow: ["mobile-client", "websocket-gateway", "application-server", "geo-index"],
    extra: [
      { title: "Riders", flow: ["mobile-client", "load-balancer", "application-server", "postgresql"] },
      { title: "Billing", flow: ["application-server", "event-stream", "worker", "payment-gateway"] },
    ],
    notes: ["Peak ride requests: about 4,000 per second.", "Each gateway instance holds about 50,000 connections."],
  },
  concepts: ["Geospatial indexing", "Consistent assignment", "Event-driven billing"],
  reading: [{ title: "Consumer systems learning path", description: "Review location-based systems.", href: `${SEC(2)}#ride-hailing` }],
  components: ["mobile-client", "websocket-gateway", "application-server", "geo-index", "load-balancer", "postgresql", "event-stream", "worker", "payment-gateway", "disaster-recovery-region"],
  scenarios: [
    sc("core", "Live locations", "One million drivers report their position every four seconds.", [
      rule("Ingest driver locations over persistent WebSocket connections.", (c) => c.edge("mobile-client", "websocket-gateway"), { category: "validity", label: "Driver connections" }),
      holds(1_000_000),
      rule("Index locations in a geo index refreshed every 5 seconds or faster.", (c) =>
        c.nodes("geo-index").some((g) => E.num(g.config.updateIntervalSeconds) > 0 && E.num(g.config.updateIntervalSeconds) <= 5 && E.incoming(c.g, g.id).length > 0), {
        category: "Latency",
        label: "Fresh locations",
        points: 15,
      }),
      numberAtLeast("geo-index", "shardCount", 8, "Shard the geo index at least 8 ways so busy cities don't overload one node.", "capacity", 10),
    ]),
    sc("matching", "Matching", "4,000 ride requests per second during a stadium exit.", [
      rule("Match riders by querying the geo index from a matching service behind the load balancer.", (c) => c.path("load-balancer", "application-server", "geo-index"), { category: "Latency", label: "Matching" }),
      rule("Record trips in a relational primary so a driver can never be assigned twice.", (c) => {
        const p = E.primaryDbNode(c.g);
        return !!p && E.incoming(c.g, p.id).some((x) => x.type === "application-server");
      }, { category: "Correctness", label: "Consistent assignment", points: 15 }),
      serves(4000, 75, "Serve 4,000 match requests per second at 75% CPU or less."),
    ]),
    sc("billing", "Payments and trip events", "Trips end and riders must be charged exactly once.", [
      rule("Publish trip events to a stream partitioned by trip_id.", (c) => streamKeyed(c, "trip_id"), { category: "Ordering", label: "Trip events" }),
      rule("Charge through a payment gateway with idempotency keys.", (c) => (c.edge("worker", "payment-gateway") || c.edge("application-server", "payment-gateway")) && c.is("payment-gateway", "idempotencyKeys", "Enabled"), {
        category: "Correctness",
        label: "Exactly-once charge",
        points: 15,
      }),
      rule("Make billing consumers idempotent.", idempotentWorkers, { category: "Correctness", label: "Idempotent billing" }),
    ]),
    sc("region", "Region failover", "The primary region goes dark on a Friday night.", [
      rule("Keep a warm-standby or active-active region with recovery in 30 minutes or less.", (c) => drRegion(c, 30), { category: "reliability", label: "Second region", points: 15 }),
    ], false),
  ],
  reference: {
    config: [
      "Drivers -> 30 WebSocket gateway instances (1.5M connections, 67%) -> location service -> geo index (geohash, 16 shards, 4 s refresh).",
      "Riders -> load balancer -> matching service (Large x8, 6,400 RPS, 63%) -> geo index and trip database (PostgreSQL primary, auto failover).",
      "Trip events (keyed by trip_id) -> idempotent billing workers -> payment gateway with idempotency keys.",
    ],
    explanation: [
      "Location updates are a firehose of overwrites; a sharded in-memory geo index absorbs them, and the database never sees them.",
      "Assignment is the one step that needs strong consistency, so it runs as a transaction on a single primary.",
    ],
    graph: {
      nodes: [
        n("driver", "mobile-client", 40, 120),
        n("ws", "websocket-gateway", 260, 120, { instances: 30, connectionState: "Shared registry" }),
        n("loc", "application-server", 480, 120, { size: "Large", instances: 4 }),
        n("geo", "geo-index", 720, 200, { indexType: "Geohash grid", shardCount: 16, updateIntervalSeconds: 4 }),
        n("rider", "mobile-client", 40, 360),
        n("lb", "load-balancer", 260, 360, { healthChecks: "Enabled" }),
        n("match", "application-server", 480, 360, { size: "Large", instances: 8 }),
        n("trips", "postgresql", 720, 480, { size: "Large", role: "Primary", autoFailover: "Enabled" }),
        n("stream", "event-stream", 720, 340, { partitions: 24, partitionKey: "trip_id", replicationFactor: 3 }),
        n("billing", "worker", 960, 340, { instances: 3, idempotent: "Enabled" }),
        n("psp", "payment-gateway", 1200, 340, { idempotencyKeys: "Enabled" }),
        n("dr", "disaster-recovery-region", 960, 480, { mode: "Warm standby", rpoMinutes: 5, rtoMinutes: 20 }),
      ],
      edges: w("driver>ws>loc>geo", "rider>lb>match>geo", "match>trips", "match>stream>billing>psp", "trips>dr"),
    },
  },
});

/* ================= Section 3: High-Integrity Platforms ================= */

const ticketing = expert({
  code: "EX0011",
  slug: "ticketmaster",
  title: "Ticketmaster",
  difficulty: "Hard",
  minutes: 50,
  description:
    "Design a ticketing platform in the style of Ticketmaster for a stadium tour on-sale: 2 million fans arrive in the first minute for 50,000 seats. No seat can ever be sold twice, unpaid holds must expire, bots shouldn't win, and the purchase flow has to stay up under the stampede.",
  guide: {
    title: "Core purchase path",
    description: "A waiting room meters fans into checkout; seats are held with a TTL and sold in a single transactional database.",
    flow: ["web-client", "waiting-room", "rate-limiter", "load-balancer", "application-server", "postgresql"],
    extra: [{ title: "Holds and payment", flow: ["application-server", "redis"] }],
    notes: ["Each admitted fan generates about 1 RPS while shopping (Little's law: 5 minutes x 0.2 RPS).", "Admit at least 1,000 fans per minute or the sale drags on for hours."],
  },
  concepts: ["Virtual waiting rooms", "Inventory correctness", "Bot mitigation"],
  reading: [{ title: "High-integrity platforms learning path", description: "Review contention-heavy sales.", href: `${SEC(3)}#ticketing` }],
  components: ["web-client", "waiting-room", "rate-limiter", "load-balancer", "application-server", "postgresql", "redis", "payment-gateway", "job-scheduler"],
  scenarios: [
    sc("core", "No double sales", "Thousands of fans click the same seat in the same second.", [
      rule("Sell seats from a single relational primary so each seat is sold once.", (c) => c.nodes("postgresql", "mysql").filter((d) => E.str(d.config.role) !== "Replica").length === 1 && c.edge("application-server", "postgresql"), {
        category: "Correctness",
        label: "One source of truth",
        points: 20,
      }),
      rule("Expire seat holds automatically after 10 minutes or less.", (c) => c.nodes("redis").some((r) => E.num(r.config.ttlSeconds) > 0 && E.num(r.config.ttlSeconds) <= 600) && c.edge("application-server", "redis"), {
        category: "Correctness",
        label: "Hold expiry",
      }),
      rule("Charge through a payment gateway with idempotency keys.", (c) => c.edge("application-server", "payment-gateway") && c.is("payment-gateway", "idempotencyKeys", "Enabled"), {
        category: "Correctness",
        label: "Payments",
        points: 15,
      }),
    ]),
    sc("stampede", "On-sale stampede", "Two million fans arrive in the first minute.", [
      rule("Queue fans in a virtual waiting room in front of the site.", (c) => c.edge("web-client", "waiting-room") && reaches(c, "waiting-room", "load-balancer"), { category: "capacity", label: "Waiting room", points: 20 }),
      rule("Admit at least 1,000 fans per minute, but no more than checkout can serve at 75% CPU.", (c) =>
        c.nodes("waiting-room").some((r) => E.num(r.config.admissionRatePerMinute) >= 1000 && E.num(r.config.admissionRatePerMinute) <= tierRps(c) * 0.75), {
        category: "capacity",
        label: "Admission rate",
        points: 15,
        fail: (c) => `Checkout can absorb about ${fmt(tierRps(c) * 0.75)} admitted fans per minute at 75% CPU.`,
      }),
    ]),
    sc("bots", "Bots and failures", "Scalper bots hammer the purchase API and a database node fails.", [
      rule("Limit each client to 10 requests per second or less.", (c) => c.nodes("rate-limiter").some((r) => E.str(r.config.scope) === "Per client" && E.num(r.config.requestsPerSecond) > 0 && E.num(r.config.requestsPerSecond) <= 10), {
        category: "Security",
        label: "Per-client limit",
        points: 15,
      }),
      rule("Run the inventory database with a replica and automatic failover.", replicatedStore, { category: "reliability", label: "Failover" }),
    ]),
    sc("release", "Releasing abandoned holds", "Fans abandon carts and the seats must go back on sale.", [
      rule("Release expired holds with a durable scheduled job.", (c) => c.nodes("job-scheduler").some((j) => E.str(j.config.durability) === "Durable store" && E.outgoing(c.g, j.id).length > 0), { label: "Hold release" }),
    ], false),
  ],
  reference: {
    config: [
      "Waiting room admits 3,000 fans/minute -> per-client rate limiter (5 req/s) -> load balancer -> checkout (Large x6, 4,800 RPS).",
      "Seat holds in Redis with a 10-minute TTL; sales committed in one PostgreSQL primary with a replica and auto failover.",
      "Payment gateway with idempotency keys; a durable scheduler releases abandoned holds.",
    ],
    explanation: [
      "You can't scale your way out of 2 million people wanting 50,000 seats, but you can meter them. The waiting room turns a spike into a steady flow.",
      "Correctness comes from one transactional source of truth; holds and caches never decide who gets a seat.",
    ],
    graph: {
      nodes: [
        n("fan", "web-client", 40, 240),
        n("room", "waiting-room", 240, 240, { admissionRatePerMinute: 3000 }),
        n("rl", "rate-limiter", 440, 240, { algorithm: "Sliding window", requestsPerSecond: 5, scope: "Per client", store: "Shared (Redis)" }),
        n("lb", "load-balancer", 640, 240, { healthChecks: "Enabled" }),
        n("shop", "application-server", 860, 240, { size: "Large", instances: 6 }),
        n("seats", "postgresql", 1100, 120, { size: "Large", role: "Primary", autoFailover: "Enabled" }),
        n("seats-rep", "postgresql", 1340, 120, { size: "Large", role: "Replica", replicatesFrom: "ref-seats" }),
        n("holds", "redis", 1100, 260, { size: "Medium", usage: "Session store", ttlSeconds: 600 }),
        n("psp", "payment-gateway", 1100, 400, { idempotencyKeys: "Enabled" }),
        n("sched", "job-scheduler", 860, 440, { schedule: "*/1 * * * *", durability: "Durable store" }),
      ],
      edges: w("fan>room>rl>lb>shop>seats>seats-rep", "shop>holds", "shop>psp", "sched>seats"),
    },
  },
});

const payments = expert({
  code: "EX0012",
  slug: "stripe",
  title: "Stripe",
  difficulty: "Hard",
  minutes: 50,
  description:
    "Design a payments API in the style of Stripe that handles 5,000 charges per second at peak. Merchants retry requests freely, so a charge must never happen twice. Every cent is tracked in a ledger that can't be edited, card networks are slow and sometimes fail, merchants are notified by webhook, and every API action is audited.",
  guide: {
    title: "Core charge path",
    description: "Idempotent API, immutable double-entry ledger, guarded calls to card networks, and async webhooks.",
    flow: ["web-client", "api-gateway", "load-balancer", "application-server", "ledger"],
    extra: [
      { title: "Card networks", flow: ["application-server", "circuit-breaker", "retry-policy", "payment-gateway"] },
      { title: "Webhooks", flow: ["application-server", "message-queue", "worker", "egress-proxy"] },
    ],
    notes: ["A charge has no safe 'default' response: when the network is down, fail clearly."],
  },
  concepts: ["Idempotent APIs", "Double-entry ledgers", "Guarded external calls"],
  reading: [{ title: "High-integrity platforms learning path", description: "Review money movement.", href: `${SEC(3)}#payments` }],
  components: ["web-client", "api-gateway", "load-balancer", "application-server", "ledger", "circuit-breaker", "retry-policy", "payment-gateway", "message-queue", "worker", "egress-proxy", "audit-log", "disaster-recovery-region"],
  scenarios: [
    sc("core", "Correct charges", "A merchant's server times out and retries a $500 charge.", [
      configIs("api-gateway", "idempotencyKeys", "Required on writes", "Require idempotency keys on every write request.", "Correctness", 15),
      rule("Record every money movement in an immutable double-entry ledger.", (c) => c.edge("application-server", "ledger") && c.is("ledger", "doubleEntry", "Enabled") && c.is("ledger", "immutable", "Enabled"), {
        category: "Correctness",
        label: "Ledger",
        points: 20,
      }),
      configIs("payment-gateway", "idempotencyKeys", "Enabled", "Forward idempotency keys to the card network.", "Correctness", 10),
    ]),
    sc("networks", "Slow card networks", "A card network starts timing out during the holiday peak.", [
      rule("Call card networks through a circuit breaker that times out within 2 seconds.", (c) =>
        reaches(c, "circuit-breaker", "payment-gateway") && c.nodes("circuit-breaker").some((b) => E.num(b.config.timeoutMs) > 0 && E.num(b.config.timeoutMs) <= 2000), {
        category: "Resilience",
        label: "Circuit breaker",
        points: 15,
      }),
      rule("Retry network calls with exponential backoff and jitter.", (c) => c.nodes("retry-policy").some((r) => E.str(r.config.backoff) === "Exponential" && E.str(r.config.jitter) === "Enabled"), {
        category: "Resilience",
        label: "Backoff",
      }),
      serves(5000, 70, "Serve 5,000 charges per second at 70% CPU or less.", 10),
    ]),
    sc("webhooks", "Webhooks and audit", "Merchants need reliable notifications, and auditors need a full trail.", [
      rule("Deliver webhooks from a queue with retries and a dead-letter queue.", (c) => c.path("message-queue", "worker") && queueSafety(c), { category: "reliability", label: "Webhook delivery", points: 15 }),
      rule("Send webhooks through an egress proxy that signs payloads and restricts destinations.", (c) => c.is("egress-proxy", "signing", "Enabled") && c.is("egress-proxy", "allowlist", "Enabled") && c.path("worker", "egress-proxy"), {
        category: "Security",
        label: "Egress",
      }),
      rule("Keep an immutable audit log of API actions.", immutableAudit, { category: "Compliance", label: "Audit log" }),
    ]),
    sc("region", "Regional failover", "A region outage must not stop payments for long.", [
      rule("Keep a warm-standby or active-active region with recovery in 15 minutes or less.", (c) => drRegion(c, 15), { category: "reliability", label: "Second region", points: 15 }),
    ], false),
  ],
  reference: {
    config: [
      "API gateway (API keys, idempotency keys required) -> load balancer -> payments API (Large x9, 7,200 RPS, 69%).",
      "Immutable double-entry ledger; card calls via circuit breaker (1.5 s, fail fast) and retry policy (3 attempts, exponential, jitter).",
      "Webhooks: queue (8 retries, DLQ) -> idempotent workers -> signing egress proxy; immutable audit log; active-active second region.",
    ],
    explanation: [
      "Idempotency keys make retries safe end to end; the ledger makes every movement provable and reversible only by new entries.",
      "Breakers and backoff stop a slow card network from taking the API down with it.",
    ],
    graph: {
      nodes: [
        n("merchant", "web-client", 40, 240),
        n("gw", "api-gateway", 240, 240, { auth: "API key", idempotencyKeys: "Required on writes" }),
        n("lb", "load-balancer", 440, 240, { healthChecks: "Enabled" }),
        n("api", "application-server", 660, 240, { size: "Large", instances: 9 }),
        n("ledger", "ledger", 900, 80, { doubleEntry: "Enabled", immutable: "Enabled", idempotencyKeys: "Enabled" }),
        n("cb", "circuit-breaker", 900, 220, { failureThresholdPercent: 30, openSeconds: 30, fallback: "Error", timeoutMs: 1500 }),
        n("retry", "retry-policy", 1120, 220, { maxAttempts: 3, backoff: "Exponential", jitter: "Enabled", retryBudgetPercent: 10 }),
        n("psp", "payment-gateway", 1340, 220, { idempotencyKeys: "Enabled" }),
        n("q", "message-queue", 900, 360, { retry: "Enabled", maxRetries: 8, dlqEnabled: "Enabled" }),
        n("hooks", "worker", 1120, 360, { instances: 4, idempotent: "Enabled" }),
        n("egress", "egress-proxy", 1340, 360, { allowlist: "Enabled", signing: "Enabled" }),
        n("audit", "audit-log", 900, 500, { immutable: "Enabled", retentionDays: 2555 }),
        n("dr", "disaster-recovery-region", 660, 440, { mode: "Active-active", rpoMinutes: 0, rtoMinutes: 5 }),
      ],
      edges: w("merchant>gw>lb>api>ledger", "api>cb>retry>psp", "api>q>hooks>egress", "api>audit", "api>dr"),
    },
  },
});

const teamChat = expert({
  code: "EX0013",
  slug: "slack",
  title: "Slack",
  difficulty: "Hard",
  minutes: 45,
  description:
    "Design a team chat service in the style of Slack for 10 million concurrent connections. Messages in a channel arrive in order for every member, history is searchable, members on mobile get notified when they're away, and workspaces with 100,000 members don't slow everyone else down.",
  guide: {
    title: "Core message path",
    description: "Persist each message to a channel-keyed log, then fan it out through pub/sub to the gateways holding members' connections.",
    flow: ["web-client", "websocket-gateway", "application-server", "event-stream", "worker", "pub-sub"],
    extra: [
      { title: "Search", flow: ["cassandra", "search-indexer", "elasticsearch"] },
      { title: "Away members", flow: ["worker", "push-provider"] },
    ],
    notes: ["Each gateway instance holds about 50,000 connections."],
  },
  concepts: ["Channel fan-out", "Ordered history", "Searchable archives"],
  reading: [{ title: "High-integrity platforms learning path", description: "Review workplace messaging.", href: `${SEC(3)}#team-chat` }],
  components: ["web-client", "websocket-gateway", "session-registry", "presence-service", "application-server", "event-stream", "worker", "pub-sub", "cassandra", "search-indexer", "elasticsearch", "push-provider", "upload-service", "object-storage"],
  scenarios: [
    sc("core", "Real-time channels", "Ten million people are connected and chatting in busy channels.", [
      holds(10_000_000),
      rule("Track which gateway holds each connection in a shared registry.", (c) => sharedRegistry(c) && c.edge("websocket-gateway", "session-registry"), { category: "Correctness", label: "Routing" }),
      rule("Fan channel messages out through pub/sub to the gateways.", (c) =>
        c.path("pub-sub", "websocket-gateway") && c.nodes("pub-sub").some((b) => E.incoming(c.g, b.id).some((x) => x.type === "application-server" || x.type === "worker")), {
        category: "Latency",
        label: "Fan-out",
        points: 15,
      }),
    ]),
    sc("history", "History and ordering", "Members scroll back a year and search for an old decision.", [
      rule("Log messages in an event stream partitioned by channel_id.", (c) => streamKeyed(c, "channel_id"), { category: "Ordering", label: "Channel order", points: 15 }),
      rule("Store history durably (Cassandra replicated 3 ways, or a replicated database).", replicatedStore, { category: "reliability", label: "History store" }),
      rule("Index history for search with change data capture.", cdcIndex, { label: "Search" }),
    ]),
    sc("mobile", "Mobile and away members", "Members close their laptops and expect notifications on their phones.", [
      rule("Notify away members through a push provider.", (c) => reaches(c, "event-stream", "push-provider"), { label: "Push" }),
      rule("Track presence with heartbeats of 30 seconds or less.", (c) => c.nodes("presence-service").some((p) => E.num(p.config.heartbeatSeconds) > 0 && E.num(p.config.heartbeatSeconds) <= 30), { label: "Presence" }),
    ]),
    sc("files", "File sharing", "Teams start sharing large files in channels.", [
      rule("Upload files directly to object storage with signed URLs.", directUploads, { category: "Efficiency", label: "Direct upload" }),
    ], false),
  ],
  reference: {
    config: [
      "300 gateway instances (15M connections, 67%) with a shared session registry and a presence service (20 s heartbeats).",
      "Chat service -> event stream (64 partitions keyed by channel_id) -> fan-out workers -> pub/sub -> gateways.",
      "Workers store history in Cassandra (RF 3), push to away members; CDC indexer feeds Elasticsearch.",
    ],
    explanation: [
      "Persist first, then fan out: a message is durable before anyone sees it, and the log keeps channel order.",
      "Pub/sub lets each gateway receive only messages for channels its users are in.",
    ],
    graph: {
      nodes: [
        n("client", "web-client", 40, 260),
        n("ws", "websocket-gateway", 260, 260, { instances: 300, connectionState: "Shared registry" }),
        n("registry", "session-registry", 260, 80),
        n("presence", "presence-service", 260, 440, { heartbeatSeconds: 20 }),
        n("chat", "application-server", 500, 260, { size: "Large", instances: 6 }),
        n("stream", "event-stream", 740, 260, { partitions: 64, partitionKey: "channel_id", replicationFactor: 3 }),
        n("fan", "worker", 980, 260, { instances: 10, idempotent: "Enabled" }),
        n("bus", "pub-sub", 1220, 260, { subscriberIsolation: "Queue per subscriber" }),
        n("history", "cassandra", 1220, 100, { size: "Large", replicationFactor: 3 }),
        n("indexer", "search-indexer", 1460, 100, { mode: "Change data capture", instances: 2 }),
        n("es", "elasticsearch", 1700, 100, { size: "Large", shards: 12, replicas: 1 }),
        n("push", "push-provider", 1220, 420),
        n("upload", "upload-service", 260, 600, { uploadMethod: "Direct / Signed URL" }),
        n("files", "object-storage", 500, 600),
      ],
      edges: w("client>ws>chat>stream>fan>bus>ws", "ws>registry", "ws>presence", "fan>history>indexer>es", "chat>es", "fan>push", "client>upload>files"),
    },
  },
});

const docsDrive = expert({
  code: "EX0014",
  slug: "google-drive",
  title: "Google Drive",
  difficulty: "Hard",
  minutes: 45,
  description:
    "Design a cloud drive in the style of Google Drive. Users store files with full version history, share them with people, groups and whole domains, and co-edit documents in real time. Every access must be authorized against sharing rules, share changes are audited, and simultaneous edits must never clobber each other.",
  guide: {
    title: "Core access path",
    description: "Every request is authorized against sharing relationships; bytes live in versioned storage; editors meet in a collaboration engine.",
    flow: ["web-client", "api-gateway", "application-server", "authz-service"],
    extra: [
      { title: "Storage", flow: ["web-client", "upload-service", "object-storage"] },
      { title: "Co-editing", flow: ["web-client", "websocket-gateway", "collaboration-engine"] },
    ],
    notes: ["'Anyone in the folder's parent's group' is a relationship question, not a role."],
  },
  concepts: ["Relationship-based authorization", "Versioned storage", "Concurrent editing"],
  reading: [{ title: "High-integrity platforms learning path", description: "Review sharing models.", href: `${SEC(3)}#drive` }],
  components: ["web-client", "api-gateway", "application-server", "authz-service", "postgresql", "audit-log", "upload-service", "object-storage", "websocket-gateway", "collaboration-engine", "search-indexer", "elasticsearch"],
  scenarios: [
    sc("core", "Files and versions", "A user uploads a contract, edits it, and needs last week's version back.", [
      rule("Upload directly to object storage with versioning enabled.", (c) => directUploads(c) && c.nodes("object-storage").some((o) => E.str(o.config.versioning) === "Enabled"), {
        category: "Durability",
        label: "Versions",
        points: 15,
      }),
      rule("Keep file metadata in a replicated database with automatic failover.", replicatedStore, { category: "reliability", label: "Metadata" }),
    ]),
    sc("sharing", "Sharing", "A folder is shared with a group, which contains another group.", [
      rule("Check every access through an authorization service with relationship-based permissions.", (c) => c.edge("application-server", "authz-service") && c.is("authz-service", "model", "Relationship based"), {
        category: "Security",
        label: "Authorization",
        points: 20,
      }),
      rule("Cache authorization decisions for 60 seconds or less.", (c) => c.nodes("authz-service").some((a) => E.num(a.config.decisionCacheSeconds) > 0 && E.num(a.config.decisionCacheSeconds) <= 60), {
        category: "Latency",
        label: "Decision cache",
      }),
      rule("Audit every share change in an immutable log.", immutableAudit, { category: "Compliance", label: "Audit" }),
    ]),
    sc("coedit", "Co-editing", "Twelve people edit the same document during a meeting.", [
      rule("Merge concurrent edits with operational transform or CRDTs.", (c) => c.nodes("collaboration-engine").some((e) => ["Operational transform", "CRDT"].includes(E.str(e.config.mergeStrategy))), {
        category: "Correctness",
        label: "Merging",
        points: 20,
      }),
      connects("websocket-gateway", "collaboration-engine", "Connect editors to the collaboration engine over WebSockets.", "Latency"),
      numberAtMost("collaboration-engine", "snapshotEveryOps", 1000, "Snapshot documents at least every 1,000 operations so opening a doc doesn't replay its whole history.", "quality", 10),
    ]),
    sc("search", "Search", "Users search across everything shared with them.", [rule("Index file metadata for search with change data capture.", cdcIndex, { label: "Search" })], false),
  ],
  reference: {
    config: [
      "Gateway (JWT) -> drive API -> relationship-based authz (30 s decision cache) and PostgreSQL (primary, replica, auto failover).",
      "Upload service (signed URLs) -> versioned object storage; immutable audit log for shares.",
      "WebSocket gateways -> collaboration engine (CRDT, snapshot every 500 ops); CDC indexer -> Elasticsearch.",
    ],
    explanation: [
      "Nested sharing is a graph problem; relationship-based authorization answers 'can X see Y' by walking it.",
      "Versioned storage makes every overwrite recoverable, and CRDT merging makes simultaneous edits converge.",
    ],
    graph: {
      nodes: [
        n("user", "web-client", 40, 260),
        n("gw", "api-gateway", 260, 260, { auth: "JWT" }),
        n("drive", "application-server", 480, 260, { size: "Large", instances: 4 }),
        n("authz", "authz-service", 720, 120, { model: "Relationship based", decisionCacheSeconds: 30 }),
        n("meta", "postgresql", 720, 260, { size: "Medium", role: "Primary", autoFailover: "Enabled" }),
        n("meta-rep", "postgresql", 960, 260, { size: "Medium", role: "Replica", replicatesFrom: "ref-meta" }),
        n("audit", "audit-log", 720, 400, { immutable: "Enabled" }),
        n("upload", "upload-service", 260, 460, { uploadMethod: "Direct / Signed URL" }),
        n("blobs", "object-storage", 480, 460, { versioning: "Enabled" }),
        n("ws", "websocket-gateway", 260, 60, { instances: 4, connectionState: "Shared registry" }),
        n("collab", "collaboration-engine", 480, 60, { mergeStrategy: "CRDT", snapshotEveryOps: 500 }),
        n("indexer", "search-indexer", 960, 400, { mode: "Change data capture" }),
        n("es", "elasticsearch", 1200, 400, { size: "Medium" }),
      ],
      edges: w("user>gw>drive>authz", "drive>meta>meta-rep", "drive>audit", "user>upload>blobs", "user>ws>collab>meta", "meta>indexer>es", "drive>es"),
    },
  },
});

/* ================= Section 4: Search & Platform Services ================= */

const KEYSTROKES = 10000;
const suggestOrigin = (c: Ctx) => KEYSTROKES * (cdnFronted(c, ["Static + API GETs"]) ? 0.4 : 1);
const suggestApps = ["a1", "a2", "a3"];
const autocomplete = expert({
  code: "EX0015",
  slug: "search-autocomplete",
  title: "Search Autocomplete",
  difficulty: "Medium",
  minutes: 35,
  description:
    "Design typeahead suggestions for a search box. Every keystroke is a query, which adds up to 10,000 per second at peak, and suggestions must come back in tens of milliseconds. Rankings follow what people actually search for and refresh hourly, and trending searches should show up within minutes.",
  guide: {
    title: "Core suggestion path",
    description: "Popular prefixes are cached at the edge; the rest are served from an in-memory prefix store rebuilt from query logs.",
    flow: ["web-client", "cdn", "load-balancer", "application-server", "redis"],
    extra: [
      { title: "Ranking refresh", flow: ["job-scheduler", "worker", "redis"] },
      { title: "Query logs", flow: ["application-server", "event-stream", "worker"] },
    ],
    notes: ["About 60% of keystroke queries are for prefixes cacheable at the edge."],
  },
  concepts: ["Prefix indexes", "Edge caching of queries", "Offline ranking"],
  reading: [{ title: "Search and platform services learning path", description: "Review typeahead design.", href: `${SEC(4)}#autocomplete` }],
  components: ["web-client", "cdn", "load-balancer", "application-server", "redis", "search-index", "event-stream", "worker", "job-scheduler"],
  scenarios: [
    sc("core", "Fast suggestions", "Every keystroke needs suggestions in tens of milliseconds.", [
      rule("Serve suggestions from an in-memory prefix store.", (c) => c.edge("application-server", "redis") || c.edge("application-server", "search-index"), { category: "Latency", label: "Prefix store", points: 20 }),
      rule("Cache popular prefixes at a CDN with a TTL of 5 minutes or less.", (c) => cdnFronted(c, ["Static + API GETs"]) && c.nodes("cdn").some((d) => E.num(d.config.ttlSeconds) > 0 && E.num(d.config.ttlSeconds) <= 300), {
        category: "Latency",
        label: "Edge cache",
        points: 15,
      }),
      serves(suggestOrigin, 80, "Serve the queries that reach the origin at 80% CPU or less."),
    ]),
    sc("fresh", "Fresh rankings", "Suggestions must follow what people search for, refreshed hourly.", [
      connects("application-server", "event-stream", "Log every query to an event stream.", "quality"),
      rule("Rebuild rankings on a schedule: a job scheduler triggers workers that update the prefix store.", (c) => c.path("job-scheduler", "worker", "redis") || c.path("job-scheduler", "worker", "search-index"), {
        label: "Hourly rebuild",
        points: 15,
      }),
    ]),
    sc("resilience", "Node failure", "A suggestion server group and a cache node fail at peak.", [
      rule("Run the prefix store with at least one replica.", (c) => c.nodes("redis").some((r) => E.num(r.config.replicas) >= 1), { category: "reliability", label: "Replica" }),
      survives(suggestOrigin, 90, "Keep origin queries at 90% CPU or less after losing the largest server group."),
    ]),
    sc("trending", "Trending searches", "A breaking news term should appear in suggestions within minutes.", [
      rule("Update trending prefixes continuously from the query stream.", (c) => c.path("event-stream", "worker", "redis") || c.path("event-stream", "worker", "search-index"), { label: "Streaming updates" }),
    ], false),
  ],
  reference: {
    config: [
      "CDN caches popular prefixes for 2 minutes; 4,000 queries/s reach origin.",
      "Three groups of 3 Large (7,200 RPS, 56%); losing one leaves 4,800 RPS (83%).",
      "Prefix store in Redis Large with a replica; hourly rebuild via scheduler and workers; trending updates from the query stream.",
    ],
    explanation: [
      "Typeahead is extremely read-heavy and repetitive: most people type the same first few letters.",
      "Rankings are computed offline from logs, so the request path is a single in-memory lookup.",
    ],
    graph: {
      nodes: [
        n("user", "web-client", 40, 220),
        n("cdn", "cdn", 240, 220, { cachedContent: "Static + API GETs", ttlSeconds: 120 }),
        n("lb", "load-balancer", 440, 220, { healthChecks: "Enabled" }),
        ...suggestApps.map((id, i) => n(id, "application-server", 660, 90 + i * 130, { size: "Large", instances: 3 })),
        n("prefixes", "redis", 920, 90, { size: "Large", replicas: 1 }),
        n("qlog", "event-stream", 920, 260, { partitions: 12, replicationFactor: 3 }),
        n("trend", "worker", 1160, 260, { instances: 2 }),
        n("sched", "job-scheduler", 920, 420, { schedule: "0 * * * *", durability: "Durable store" }),
        n("rebuild", "worker", 1160, 420, { instances: 4 }),
      ],
      edges: [...w("user>cdn>lb", "qlog>trend>prefixes", "sched>rebuild>prefixes"), ...suggestApps.flatMap((a) => w(`lb>${a}`, `${a}>prefixes`, `${a}>qlog`))],
    },
  },
});

const fullText = expert({
  code: "EX0016",
  slug: "full-text-search",
  title: "Full-Text Search",
  difficulty: "Hard",
  minutes: 45,
  description:
    "Design full-text search over two billion marketplace listings. Shoppers run 5,000 queries per second and expect relevant results in under 200 ms, sellers expect new listings to be searchable within a minute, and the index has to survive losing a node without dropping results.",
  guide: {
    title: "Core search path",
    description: "Listings flow from the database into a sharded, replicated index via change data capture; queries hit the index and a re-ranker.",
    flow: ["web-client", "load-balancer", "application-server", "elasticsearch"],
    extra: [{ title: "Indexing", flow: ["application-server", "postgresql", "search-indexer", "elasticsearch"] }],
    notes: ["Smaller shards mean faster queries and faster recovery."],
  },
  concepts: ["Inverted index sharding", "Near-real-time indexing", "Relevance ranking"],
  reading: [{ title: "Search and platform services learning path", description: "Review search architecture.", href: `${SEC(4)}#full-text` }],
  components: ["web-client", "load-balancer", "application-server", "postgresql", "search-indexer", "elasticsearch", "ranking-service", "redis", "event-stream"],
  scenarios: [
    sc("core", "Indexing pipeline", "A seller lists an item and expects it in search within a minute.", [
      rule("Stream listing changes from the database into the index with change data capture.", cdcIndex, { category: "Freshness", label: "CDC indexing", points: 20 }),
      numberAtLeast("search-indexer", "instances", 2, "Run at least two indexer instances.", "reliability", 10),
    ]),
    sc("scale", "Query scale", "5,000 queries per second over two billion documents.", [
      numberAtLeast("elasticsearch", "shards", 12, "Shard the index at least 12 ways so each shard stays small.", "capacity", 15),
      numberAtLeast("elasticsearch", "replicas", 1, "Keep at least one replica of every shard.", "reliability", 15),
      serves(5000, 75, "Serve 5,000 queries per second at 75% CPU or less.", 10),
    ]),
    sc("relevance", "Relevance", "Shoppers expect the best match first, and popular queries to be instant.", [
      connects("application-server", "ranking-service", "Re-rank top results with a ranking service.", "quality"),
      rule("Cache popular queries for 60 seconds or less.", (c) => c.nodes("redis").some((r) => E.num(r.config.ttlSeconds) > 0 && E.num(r.config.ttlSeconds) <= 60) && c.edge("application-server", "redis"), {
        category: "Latency",
        label: "Query cache",
      }),
    ]),
    sc("analytics", "Search analytics", "The team wants to learn from what people search for and click.", [
      rule("Log queries and clicks to an event stream.", (c) => c.edge("application-server", "event-stream"), { label: "Query log" }),
    ], false),
  ],
  reference: {
    config: [
      "Search API (Large x9, 7,200 RPS, 69%) -> Elasticsearch (24 shards, 1 replica) and a learned re-ranker; Redis caches popular queries for 30 s.",
      "Listings in PostgreSQL -> CDC indexer (2 instances) -> Elasticsearch.",
    ],
    explanation: [
      "CDC keeps the index seconds behind the database without batch rebuilds.",
      "Shards spread the corpus for parallel queries; replicas keep every shard available during node loss.",
    ],
    graph: {
      nodes: [
        n("user", "web-client", 40, 220),
        n("lb", "load-balancer", 240, 220, { healthChecks: "Enabled" }),
        n("api", "application-server", 460, 220, { size: "Large", instances: 9 }),
        n("es", "elasticsearch", 940, 220, { size: "Large", shards: 24, replicas: 1 }),
        n("rank", "ranking-service", 700, 60, { model: "Learned ranker" }),
        n("qcache", "redis", 700, 380, { size: "Small", ttlSeconds: 30 }),
        n("db", "postgresql", 460, 460, { size: "Large" }),
        n("indexer", "search-indexer", 700, 500, { mode: "Change data capture", instances: 2 }),
        n("qlog", "event-stream", 240, 420, { partitions: 6 }),
      ],
      edges: w("user>lb>api>es", "api>rank", "api>qcache", "api>db>indexer>es", "api>qlog"),
    },
  },
});

const editor = expert({
  code: "EX0017",
  slug: "collaborative-editor",
  title: "Collaborative Editor",
  difficulty: "Hard",
  minutes: 45,
  description:
    "Design a real-time collaborative document editor for 2 million concurrent editors, with up to 100 people in one document. Others should see each keystroke within 200 ms, edits made offline must merge cleanly when a laptop reconnects, full version history is kept, and no document is ever lost.",
  guide: {
    title: "Core editing path",
    description: "Editors connect to a collaboration engine that merges operations, logs them durably and snapshots regularly.",
    flow: ["web-client", "load-balancer", "websocket-gateway", "collaboration-engine", "event-stream"],
    extra: [{ title: "Snapshots", flow: ["event-stream", "worker", "object-storage"] }],
    notes: ["Each gateway instance holds about 50,000 connections."],
  },
  concepts: ["Operational transform and CRDTs", "Operation logs", "Snapshotting"],
  reading: [{ title: "Search and platform services learning path", description: "Review real-time collaboration.", href: `${SEC(4)}#collaboration` }],
  components: ["web-client", "load-balancer", "websocket-gateway", "collaboration-engine", "event-stream", "worker", "object-storage", "postgresql", "backup", "presence-service"],
  scenarios: [
    sc("core", "Real-time collaboration", "Two million people are typing in shared documents.", [
      holds(2_000_000),
      rule("Merge concurrent edits with operational transform or CRDTs.", (c) => c.nodes("collaboration-engine").some((e) => ["Operational transform", "CRDT"].includes(E.str(e.config.mergeStrategy))), {
        category: "Correctness",
        label: "Merging",
        points: 20,
      }),
      rule("Route each document's editors to one place via a shared connection registry.", (c) => sharedRegistry(c) && c.edge("websocket-gateway", "collaboration-engine"), { category: "Correctness", label: "Routing" }),
    ]),
    sc("offline", "Offline edits and history", "A writer edits on a plane for three hours, then reconnects.", [
      configIs("collaboration-engine", "mergeStrategy", "CRDT", "Use CRDTs so long offline sessions merge without a central server ordering every operation.", "Correctness", 15),
      numberAtMost("collaboration-engine", "snapshotEveryOps", 1000, "Snapshot at least every 1,000 operations.", "quality", 10),
      rule("Log operations durably in an event stream with replication factor 3.", (c) => c.edge("collaboration-engine", "event-stream") && c.nodes("event-stream").some((s) => E.num(s.config.replicationFactor) >= 3), {
        category: "reliability",
        label: "Operation log",
      }),
    ]),
    sc("durability", "Durability", "A bad deploy corrupts some documents and they must be restored.", [
      rule("Store snapshots in versioned object storage.", (c) => c.nodes("object-storage").some((o) => E.str(o.config.versioning) === "Enabled" && E.incoming(c.g, o.id).length > 0), {
        category: "reliability",
        label: "Snapshots",
      }),
      rule("Back up document metadata with point-in-time recovery.", (c) => c.nodes("backup").some((b) => E.str(b.config.pointInTimeRecovery) === "Enabled" && c.nodes("postgresql").some((p) => E.linkedEitherWay(c.g, b.id, p.id))), {
        category: "reliability",
        label: "PITR",
      }),
    ]),
    sc("cursors", "Live cursors", "Editors want to see each other's cursors and who's in the doc.", [
      rule("Show who's in each document with a presence service.", (c) => c.edge("websocket-gateway", "presence-service"), { label: "Presence" }),
    ], false),
  ],
  reference: {
    config: [
      "Layer 4 LB -> 60 gateway instances (3M connections, 67%) with a shared registry -> collaboration engine (CRDT, snapshot every 500 ops).",
      "Operation log: event stream (RF 3, keyed by doc_id) -> snapshot workers -> versioned object storage.",
      "Document metadata in PostgreSQL with point-in-time recovery backups; presence service for cursors.",
    ],
    explanation: [
      "CRDTs converge regardless of delivery order, which is exactly what a three-hour offline session needs.",
      "The durable operation log plus periodic snapshots make documents fast to open and impossible to lose.",
    ],
    graph: {
      nodes: [
        n("editor", "web-client", 40, 240),
        n("lb", "load-balancer", 240, 240, { layer: "Layer 4", healthChecks: "Enabled" }),
        n("ws", "websocket-gateway", 440, 240, { instances: 60, connectionState: "Shared registry" }),
        n("collab", "collaboration-engine", 660, 240, { mergeStrategy: "CRDT", snapshotEveryOps: 500 }),
        n("oplog", "event-stream", 880, 140, { partitions: 32, partitionKey: "doc_id", replicationFactor: 3 }),
        n("snap", "worker", 1100, 140, { instances: 4 }),
        n("blobs", "object-storage", 1320, 140, { versioning: "Enabled" }),
        n("meta", "postgresql", 880, 340, { size: "Medium" }),
        n("backup", "backup", 1100, 340, { frequencyHours: 24, retentionDays: 30, pointInTimeRecovery: "Enabled" }),
        n("presence", "presence-service", 440, 420, { heartbeatSeconds: 10 }),
      ],
      edges: w("editor>lb>ws>collab>oplog>snap>blobs", "collab>meta>backup", "ws>presence"),
    },
  },
});

const DELIVERY_RATE = 200;
const webhooks = expert({
  code: "EX0018",
  slug: "webhook-platform",
  title: "Webhook Platform",
  difficulty: "Hard",
  minutes: 40,
  description:
    "Design a platform that delivers 20,000 events per second to 200,000 customer endpoints. Endpoints are slow, flaky and occasionally malicious. Every event must be delivered at least once with retries spread over three days, one slow endpoint must never delay the others, and payloads must be signed and kept away from internal networks.",
  guide: {
    title: "Core delivery path",
    description: "Queue events, deliver with isolated pools, guard each endpoint, and leave through a signing egress proxy.",
    flow: ["application-server", "message-queue", "worker", "bulkhead", "circuit-breaker", "retry-policy", "egress-proxy"],
    notes: ["Each delivery worker instance completes about 200 deliveries per second."],
  },
  concepts: ["At-least-once delivery", "Tenant isolation", "SSRF protection"],
  reading: [{ title: "Search and platform services learning path", description: "Review outbound integrations.", href: `${SEC(4)}#webhooks` }],
  components: ["application-server", "message-queue", "worker", "bulkhead", "circuit-breaker", "retry-policy", "egress-proxy", "cassandra", "postgresql"],
  scenarios: [
    sc("core", "Reliable delivery", "An endpoint is down for six hours; its events must still arrive.", [
      rule("Queue events between producers and delivery workers.", (c) => c.path("application-server", "message-queue", "worker"), { category: "validity", label: "Delivery queue" }),
      rule("Retry at least 5 times with a dead-letter queue for events that never succeed.", (c) => queueSafety(c) && c.nodes("message-queue").some((q) => E.num(q.config.maxRetries) >= 5), {
        category: "reliability",
        label: "Retries",
        points: 15,
      }),
      rule("Back off exponentially with jitter between attempts.", (c) => c.nodes("retry-policy").some((r) => E.str(r.config.backoff) === "Exponential" && E.str(r.config.jitter) === "Enabled"), {
        category: "Resilience",
        label: "Backoff",
        points: 15,
      }),
    ]),
    sc("bad", "Bad endpoints", "A large customer's endpoint starts taking 30 seconds per request.", [
      rule("Isolate endpoints with bulkhead pools so a slow one can't hold every worker.", (c) => c.path("worker", "bulkhead") && c.nodes("bulkhead").some((b) => E.num(b.config.pools) >= 2), {
        category: "Isolation",
        label: "Bulkheads",
        points: 15,
      }),
      rule("Stop calling failing endpoints with a circuit breaker.", (c) => reaches(c, "worker", "circuit-breaker"), { category: "Resilience", label: "Circuit breaker" }),
      rule("Size delivery for 20,000 events per second at 80% or less.", (c) => workerRate(c, DELIVERY_RATE, "message-queue") * 0.8 >= 20000, {
        category: "capacity",
        label: "Throughput",
        fail: (c) => `Workers deliver ${fmt(workerRate(c, DELIVERY_RATE, "message-queue"))} events/s; 20,000 at 80% needs 125 instances.`,
      }),
    ]),
    sc("security", "Security", "A customer registers http://169.254.169.254 as their webhook URL.", [
      rule("Send every delivery through an egress proxy that signs payloads and blocks internal addresses.", (c) => c.is("egress-proxy", "signing", "Enabled") && c.is("egress-proxy", "allowlist", "Enabled") && reaches(c, "worker", "egress-proxy"), {
        category: "Security",
        label: "Egress proxy",
        points: 20,
      }),
    ]),
    sc("log", "Delivery log", "Customers want to see every attempt and replay failures.", [
      rule("Record every delivery attempt in a durable store.", (c) => c.nodes("worker").some((x) => E.outgoing(c.g, x.id).some((o) => o.category === "database")), { label: "Attempt log" }),
    ], false),
  ],
  reference: {
    config: [
      "Event producers -> queue (12 retries over ~72 h, DLQ) -> 125 delivery workers (25,000/s, 80%).",
      "Workers -> bulkhead (16 pools) -> circuit breaker -> retry policy (exponential, jitter) -> signing egress proxy with destination allowlist.",
      "Every attempt recorded in Cassandra.",
    ],
    explanation: [
      "Bulkheads and breakers keep one customer's broken endpoint from becoming everyone's delay.",
      "The egress proxy is the single choke point for signing and SSRF protection.",
    ],
    graph: {
      nodes: [
        n("events", "application-server", 40, 240, { size: "Medium", instances: 2 }),
        n("q", "message-queue", 280, 240, { retry: "Enabled", maxRetries: 12, dlqEnabled: "Enabled" }),
        n("senders", "worker", 520, 240, { instances: 125 }),
        n("bh", "bulkhead", 760, 240, { pools: 16, maxConcurrentPerPool: 50 }),
        n("cb", "circuit-breaker", 1000, 240, { failureThresholdPercent: 50, openSeconds: 60, fallback: "Error", timeoutMs: 5000 }),
        n("retry", "retry-policy", 1240, 240, { maxAttempts: 3, backoff: "Exponential", jitter: "Enabled", retryBudgetPercent: 20 }),
        n("egress", "egress-proxy", 1480, 240, { allowlist: "Enabled", signing: "Enabled" }),
        n("attempts", "cassandra", 760, 420, { replicationFactor: 3 }),
      ],
      edges: w("events>q>senders>bh>cb>retry>egress", "senders>attempts"),
    },
  },
});

const JOB_RATE = 20;
const scheduler = expert({
  code: "EX0019",
  slug: "distributed-scheduler",
  title: "Distributed Scheduler",
  difficulty: "Hard",
  minutes: 45,
  sectionChallenge: true,
  description:
    "Design a job scheduler shared by many teams that runs 10 million scheduled jobs a day, peaking at 500 jobs per second at the top of the hour. Each job fires on time and exactly once, even when a scheduler node dies mid-tick. Failed jobs are retried, one noisy tenant can't starve the rest, and on-call can see when jobs run late.",
  guide: {
    title: "Core scheduling path",
    description: "A leader-elected scheduler with durable state hands due jobs to a queue; idempotent workers run them.",
    flow: ["application-server", "job-scheduler", "message-queue", "worker"],
    extra: [
      { title: "Durable state", flow: ["job-scheduler", "postgresql"] },
      { title: "Lateness metrics", flow: ["worker", "telemetry-collector", "metrics-store"] },
    ],
    notes: ["Each worker instance runs about 20 jobs per second."],
  },
  concepts: ["Leader election", "Exactly-once triggering", "Multi-tenant fairness"],
  reading: [{ title: "Search and platform services learning path", description: "Review distributed scheduling.", href: `${SEC(4)}#scheduler` }],
  components: ["application-server", "job-scheduler", "postgresql", "message-queue", "worker", "telemetry-collector", "metrics-store", "disaster-recovery-region"],
  scenarios: [
    sc("core", "On time, exactly once", "A scheduler node crashes one second before the top of the hour.", [
      rule("Keep schedules in a durable store, not scheduler memory.", (c) => c.is("job-scheduler", "durability", "Durable store") && c.nodes("job-scheduler").some((j) => E.outgoing(c.g, j.id).some((x) => x.category === "database")), {
        category: "reliability",
        label: "Durable schedules",
        points: 15,
      }),
      configIs("job-scheduler", "leaderElection", "Enabled", "Elect a single active leader so each schedule fires once even when nodes fail.", "Correctness", 20),
      rule("Hand due jobs to a queue that workers consume.", (c) => c.path("job-scheduler", "message-queue", "worker"), { category: "validity", label: "Dispatch" }),
    ]),
    sc("failures", "Failures and retries", "Jobs crash, workers restart, and the top of the hour brings 500 jobs per second.", [
      rule("Make workers idempotent so a re-delivered job has no extra effect.", idempotentWorkers, { category: "Correctness", label: "Idempotent jobs", points: 15 }),
      rule("Retry with a dead-letter queue and a visibility timeout of 60 seconds or more.", (c) => queueSafety(c) && c.nodes("message-queue").some((q) => E.num(q.config.visibilityTimeoutSec) >= 60), {
        category: "reliability",
        label: "Retries",
      }),
      rule("Size workers for 500 jobs per second at 80% or less.", (c) => workerRate(c, JOB_RATE, "message-queue") * 0.8 >= 500, { category: "capacity", label: "Worker capacity" }),
    ]),
    sc("fairness", "Multi-tenant fairness", "One team schedules 2 million jobs for the same minute.", [
      rule("Cap concurrency per tenant in the scheduler.", (c) => c.nodes("job-scheduler").some((j) => E.num(j.config.concurrencyLimit) > 0 && E.num(j.config.concurrencyLimit) <= 1000), {
        category: "Isolation",
        label: "Tenant cap",
      }),
      configIs("message-queue", "priority", "Priority lanes", "Give urgent jobs a priority lane.", "Latency", 10),
      rule("Track job lateness as percentiles.", (c) => c.path("worker", "telemetry-collector", "metrics-store") && percentiles(c), { category: "Visibility", label: "Lateness" }),
    ]),
    sc("region", "Region failure", "The scheduler's region fails and jobs must keep running.", [
      rule("Keep a warm-standby or active-active region with recovery in 15 minutes or less.", (c) => drRegion(c, 15), { category: "reliability", label: "Second region" }),
    ], false),
  ],
  reference: {
    config: [
      "Jobs API -> job scheduler (durable store, leader election, 200 concurrent per tenant) with schedules in PostgreSQL.",
      "Scheduler -> queue (priority lanes, 5 retries, DLQ, 300 s visibility) -> 32 idempotent workers (640 jobs/s, 78%).",
      "Workers report lateness percentiles via a telemetry collector; warm-standby region.",
    ],
    explanation: [
      "Leader election plus durable state means a crash hands over the schedule without double-firing or skipping.",
      "Exactly-once execution is at-least-once delivery plus idempotent jobs.",
    ],
    graph: {
      nodes: [
        n("api", "application-server", 40, 240, { size: "Medium", instances: 2 }),
        n("sched", "job-scheduler", 280, 240, { durability: "Durable store", leaderElection: "Enabled", concurrencyLimit: 200 }),
        n("db", "postgresql", 280, 60, { size: "Medium", role: "Primary", autoFailover: "Enabled" }),
        n("q", "message-queue", 520, 240, { priority: "Priority lanes", retry: "Enabled", maxRetries: 5, dlqEnabled: "Enabled", visibilityTimeoutSec: 300 }),
        n("workers", "worker", 760, 240, { instances: 32, idempotent: "Enabled" }),
        n("collector", "telemetry-collector", 1000, 240, { bufferMinutes: 10 }),
        n("metrics", "metrics-store", 1240, 240, { aggregation: "Percentiles (p50/p95/p99)", retentionDays: 30 }),
        n("dr", "disaster-recovery-region", 520, 420, { mode: "Warm standby", rpoMinutes: 1, rtoMinutes: 10 }),
      ],
      edges: w("api>sched>q>workers>collector>metrics", "sched>db", "api>db", "db>dr"),
    },
  },
});

/* ================= Section 5: Infrastructure Systems ================= */

const metricsPlatform = expert({
  code: "EX0020",
  slug: "metrics-platform",
  title: "Metrics Platform",
  difficulty: "Hard",
  minutes: 45,
  description:
    "Design a metrics platform that ingests 10 million data points per second from 50,000 hosts. Dashboards on recent data load in under a second, alerts fire within a minute, and 13 months of history are kept without the hot store growing forever. Hosts keep buffering when the platform has a blip.",
  guide: {
    title: "Core ingestion path",
    description: "Collectors buffer and forward to a partitioned stream; ingesters write to a percentile-capable time-series store.",
    flow: ["web-client", "telemetry-collector", "event-stream", "worker", "metrics-store"],
    extra: [
      { title: "Queries", flow: ["web-client", "application-server", "metrics-store"] },
      { title: "Archive", flow: ["metrics-store", "object-storage"] },
    ],
    notes: ["A partitioned stream absorbs bursts and lets ingesters scale independently."],
  },
  concepts: ["High-volume ingestion", "Downsampling and retention", "Query caching"],
  reading: [{ title: "Infrastructure systems learning path", description: "Review telemetry pipelines.", href: `${SEC(5)}#metrics` }],
  components: ["web-client", "telemetry-collector", "event-stream", "worker", "metrics-store", "object-storage", "application-server", "redis"],
  scenarios: [
    sc("core", "Ingestion", "Ten million data points per second arrive, with bursts during deploys.", [
      rule("Buffer data points in an event stream between collectors and storage.", (c) => c.path("telemetry-collector", "event-stream", "worker", "metrics-store"), { category: "capacity", label: "Ingest pipeline", points: 15 }),
      numberAtLeast("event-stream", "partitions", 64, "Partition the stream at least 64 ways.", "capacity", 10),
      numberAtLeast("telemetry-collector", "bufferMinutes", 5, "Buffer at least 5 minutes of data in collectors.", "reliability", 10),
    ]),
    sc("queries", "Dashboards and alerts", "On-call opens a dashboard during an incident.", [
      configIs("metrics-store", "aggregation", "Percentiles (p50/p95/p99)", "Store percentiles, not just averages.", "Visibility", 15),
      rule("Cache recent dashboard queries.", (c) => c.path("application-server", "redis") && c.edge("application-server", "metrics-store"), { category: "Latency", label: "Query cache" }),
    ]),
    sc("retention", "Retention", "Capacity planning needs 13 months of history.", [
      numberAtLeast("metrics-store", "retentionDays", 395, "Retain at least 13 months (395 days).", "Compliance", 10),
      rule("Move data older than 30 days to cheaper object storage.", (c) => c.nodes("object-storage").some((o) => E.incoming(c.g, o.id).some((x) => x.type === "metrics-store") && E.num(o.config.lifecycleDays) > 0 && E.num(o.config.lifecycleDays) <= 30), {
        category: "cost",
        label: "Tiering",
      }),
    ]),
    sc("ha", "High availability", "An ingester node and a broker fail at the same time.", [
      rule("Replicate the stream 3 ways and run at least two ingesters.", (c) => c.nodes("event-stream").some((s) => E.num(s.config.replicationFactor) >= 3) && c.nodes("worker").some((x) => E.instancesOf(x) >= 2), {
        category: "reliability",
        label: "Redundancy",
      }),
    ], false),
  ],
  reference: {
    config: [
      "Host agents -> collectors (15-minute buffer) -> event stream (128 partitions, RF 3) -> 20 ingesters -> metrics store (percentiles, 400 days).",
      "Dashboards -> query API -> metrics store, with a Redis query cache.",
      "Metrics older than 30 days move to object storage.",
    ],
    explanation: [
      "The stream decouples hosts from storage: bursts queue up instead of being dropped.",
      "Tiering keeps the hot store small and fast while still meeting long retention.",
    ],
    graph: {
      nodes: [
        n("hosts", "web-client", 40, 260),
        n("collector", "telemetry-collector", 260, 260, { bufferMinutes: 15, samplingPercent: 100 }),
        n("stream", "event-stream", 500, 260, { partitions: 128, replicationFactor: 3, retentionHours: 24 }),
        n("ingest", "worker", 740, 260, { instances: 20 }),
        n("tsdb", "metrics-store", 980, 260, { aggregation: "Percentiles (p50/p95/p99)", retentionDays: 400 }),
        n("archive", "object-storage", 1220, 260, { storageClass: "Infrequent access", lifecycleDays: 30, expireDays: 400 }),
        n("dash", "web-client", 740, 60),
        n("qapi", "application-server", 980, 60, { size: "Large", instances: 2 }),
        n("qcache", "redis", 1220, 60, { size: "Small" }),
      ],
      edges: w("hosts>collector>stream>ingest>tsdb>archive", "dash>qapi>tsdb", "qapi>qcache"),
    },
  },
});

const loggingPlatform = expert({
  code: "EX0021",
  slug: "logging-platform",
  title: "Logging Platform",
  difficulty: "Hard",
  minutes: 40,
  description:
    "Design a central logging platform that takes in 2 TB of logs a day from 3,000 services. Engineers search the last two weeks interactively, compliance requires one year of retention, volume jumps tenfold during incidents, logging must never slow an application down, and personal data must be redacted before storage.",
  guide: {
    title: "Core log path",
    description: "Collectors buffer, a stream absorbs spikes, autoscaled indexers redact and store, and old logs are archived.",
    flow: ["web-client", "telemetry-collector", "event-stream", "worker", "data-validator", "log-store", "object-storage"],
    notes: ["Incident spikes are when logs matter most and arrive fastest."],
  },
  concepts: ["Spike-tolerant ingestion", "Hot and cold log tiers", "PII redaction"],
  reading: [{ title: "Infrastructure systems learning path", description: "Review log pipelines.", href: `${SEC(5)}#logging` }],
  components: ["web-client", "telemetry-collector", "event-stream", "worker", "auto-scaling", "data-validator", "log-store", "object-storage", "metrics-store"],
  scenarios: [
    sc("core", "Ingestion that never blocks", "A service starts logging 10x more during an outage.", [
      rule("Buffer logs in collectors (5+ minutes) and a stream before storage.", (c) =>
        c.path("telemetry-collector", "event-stream") && c.nodes("telemetry-collector").some((t) => E.num(t.config.bufferMinutes) >= 5), {
        category: "reliability",
        label: "Buffering",
        points: 15,
      }),
      numberAtLeast("event-stream", "partitions", 32, "Partition the log stream at least 32 ways.", "capacity", 10),
    ]),
    sc("search", "Search", "An engineer searches last Tuesday's logs for one request id.", [
      rule("Keep 14 to 30 days of structured logs searchable.", (c) =>
        c.nodes("log-store").some((l) => E.str(l.config.structured) === "Enabled" && E.num(l.config.retentionDays) >= 14 && E.num(l.config.retentionDays) <= 30), {
        category: "Visibility",
        label: "Hot logs",
        points: 15,
      }),
      rule("Autoscale indexers on backlog to absorb a tenfold spike.", (c) =>
        c.nodes("auto-scaling").some((s) => E.str(s.config.metric) === "Queue depth / backlog" && c.nodes("worker").some((x) => E.linkedEitherWay(c.g, s.id, x.id)) && E.num(s.config.max) >= 10 * Math.max(1, E.num(s.config.min, 1))), {
        category: "capacity",
        label: "Spike scaling",
        points: 15,
      }),
    ]),
    sc("compliance", "Compliance", "Auditors check retention and look for personal data in logs.", [
      rule("Archive logs to object storage in the Archive class and delete them after 365 to 400 days.", (c) =>
        c.path("log-store", "object-storage") && c.nodes("object-storage").some((o) => E.str(o.config.storageClass) === "Archive" && E.num(o.config.expireDays) >= 365 && E.num(o.config.expireDays) <= 400), {
        category: "Compliance",
        label: "Retention",
        points: 15,
      }),
      rule("Redact personal data before logs are stored.", (c) => c.nodes("data-validator").some((v) => E.str(v.config.piiFilter) === "Enabled" && E.outgoing(c.g, v.id).some((x) => x.type === "log-store")), {
        category: "Security",
        label: "PII redaction",
        points: 15,
      }),
    ]),
    sc("alerts", "Error-rate alerts", "On-call wants an alert when a service's error logs spike.", [
      rule("Derive error-rate metrics from the log stream.", (c) => c.path("event-stream", "worker", "metrics-store"), { label: "Log metrics" }),
    ], false),
  ],
  reference: {
    config: [
      "Services -> collectors (30-minute buffer) -> event stream (64 partitions, RF 3) -> indexers autoscaled on backlog (12 to 120).",
      "Indexers -> PII redaction -> log store (structured, 14 days) -> Archive-class object storage, deleted after 365 days.",
      "A second consumer turns error logs into metrics.",
    ],
    explanation: [
      "Logging must degrade by delaying, never by blocking applications or dropping incident data.",
      "Redacting at ingestion means personal data never lands anywhere that needs cleaning later.",
    ],
    graph: {
      nodes: [
        n("svcs", "web-client", 40, 240),
        n("collector", "telemetry-collector", 260, 240, { bufferMinutes: 30, samplingPercent: 100 }),
        n("stream", "event-stream", 500, 240, { partitions: 64, replicationFactor: 3, retentionHours: 48 }),
        n("indexers", "worker", 740, 240, { instances: 12 }),
        n("as", "auto-scaling", 740, 60, { metric: "Queue depth / backlog", min: 12, max: 120 }),
        n("redact", "data-validator", 980, 240, { piiFilter: "Enabled", schemaChecks: "Enabled" }),
        n("logs", "log-store", 1220, 240, { structured: "Enabled", retentionDays: 14 }),
        n("archive", "object-storage", 1460, 240, { storageClass: "Archive", expireDays: 365 }),
        n("alerts", "worker", 740, 420, { instances: 2 }),
        n("metrics", "metrics-store", 980, 420, { aggregation: "Percentiles (p50/p95/p99)" }),
      ],
      edges: w("svcs>collector>stream>indexers>redact>logs>archive", "as>indexers", "stream>alerts>metrics"),
    },
  },
});

const flagPlatform = expert({
  code: "EX0022",
  slug: "feature-flag-platform",
  title: "Feature Flag Platform",
  difficulty: "Medium",
  minutes: 35,
  description:
    "Design the feature flag platform for 500 services that evaluate 2 million flags per second in total. Checking a flag must add under a millisecond and keep working if the platform is down. Flag changes reach every service within ten seconds, rollouts can target segments, and every change is versioned and audited.",
  guide: {
    title: "Core flag path",
    description: "Flags are managed centrally, pushed to services as versioned config, and evaluated in-process.",
    flow: ["web-client", "load-balancer", "application-server", "feature-flag-service", "configuration-service", "application-server"],
    notes: ["2 million evaluations per second is only possible if they never leave the process."],
  },
  concepts: ["Local flag evaluation", "Config push", "Safe rollouts"],
  reading: [{ title: "Infrastructure systems learning path", description: "Review configuration delivery.", href: `${SEC(5)}#feature-flags` }],
  components: ["web-client", "load-balancer", "application-server", "feature-flag-service", "configuration-service", "dynamodb", "audit-log", "telemetry-collector", "metrics-store"],
  scenarios: [
    sc("core", "Fast evaluation", "Services check flags on every request.", [
      configIs("feature-flag-service", "localEvaluation", "Enabled", "Evaluate flags in-process from a cached rule set.", "Latency", 20),
      rule("Push flag changes to services as they happen.", (c) =>
        c.is("configuration-service", "delivery", "Push on change") && c.nodes("configuration-service").some((s) => c.nodes("feature-flag-service").some((f) => E.linkedEitherWay(c.g, s.id, f.id))), {
        category: "Freshness",
        label: "Push delivery",
        points: 15,
      }),
    ]),
    sc("safety", "Safe changes", "A flag flip breaks checkout and must be undone immediately.", [
      configIs("configuration-service", "versioned", "Enabled", "Version every flag change so it can be rolled back.", "Release safety", 15),
      configIs("feature-flag-service", "killSwitch", "Enabled", "Provide kill switches that turn a feature off instantly.", "Release safety", 15),
      rule("Audit every flag change in an immutable log.", immutableAudit, { category: "Compliance", label: "Audit" }),
    ]),
    sc("targeting", "Targeting", "Product wants beta customers first, then 10% of everyone.", [
      rule("Support targeted segments or percentage rollouts.", (c) => c.nodes("feature-flag-service").some((f) => ["Targeted segments", "Percentage"].includes(E.str(f.config.rollout))), {
        label: "Targeting",
        points: 15,
      }),
      rule("Store flag definitions in a replicated database.", replicatedStore, { category: "reliability", label: "Flag store" }),
    ]),
    sc("experiments", "Experiment metrics", "Teams want to compare metrics between flag variants.", [
      rule("Report evaluation metrics through a telemetry collector.", (c) => c.path("application-server", "telemetry-collector", "metrics-store"), { label: "Experiment data" }),
    ], false),
  ],
  reference: {
    config: [
      "Admin UI -> flags API -> flag service (targeted segments, kill switches, local evaluation) -> configuration service (versioned, push on change) -> consumer services.",
      "Flag definitions in DynamoDB (RF 3); immutable audit log of changes.",
    ],
    explanation: [
      "In-process evaluation makes flag checks a memory lookup and removes the platform from the request path.",
      "Push delivery plus versioning gives fast propagation and one-step rollback.",
    ],
    graph: {
      nodes: [
        n("admin", "web-client", 40, 240),
        n("lb", "load-balancer", 240, 240, { healthChecks: "Enabled" }),
        n("flagsapi", "application-server", 440, 240, { size: "Medium", instances: 2 }),
        n("flags", "feature-flag-service", 680, 240, { rollout: "Targeted segments", killSwitch: "Enabled", localEvaluation: "Enabled" }),
        n("config", "configuration-service", 920, 240, { versioned: "Enabled", delivery: "Push on change" }),
        n("svc", "application-server", 1160, 240, { size: "Large", instances: 10 }),
        n("defs", "dynamodb", 680, 80, { replicationFactor: 3 }),
        n("audit", "audit-log", 680, 400, { immutable: "Enabled" }),
        n("collector", "telemetry-collector", 1160, 420),
        n("metrics", "metrics-store", 1400, 420, { aggregation: "Percentiles (p50/p95/p99)" }),
      ],
      edges: w("admin>lb>flagsapi>flags>config>svc", "flagsapi>defs", "flagsapi>audit", "svc>collector>metrics"),
    },
  },
});

const cacheNodes = ["c1", "c2", "c3", "c4"];
const cacheMemory = (c: Ctx) => c.nodes("redis").reduce((s, r) => s + E.cacheMemoryGb(r), 0);
const distributedCache = expert({
  code: "EX0023",
  slug: "distributed-cache",
  title: "Distributed Cache",
  difficulty: "Hard",
  minutes: 40,
  description:
    "Design a shared cache cluster that sits in front of the databases for 300 services. It serves 2 million operations per second over 400 GB of hot data with sub-millisecond latency. A single product key can see 200,000 reads per second, and losing a cache node must not stampede the databases behind it.",
  guide: {
    title: "Core cache path",
    description: "Services shard keys across several replicated cache nodes in front of the database.",
    flow: ["load-balancer", "application-server", "redis", "postgresql"],
    notes: ["Memory belongs to each node; replicas add throughput and availability, not capacity."],
  },
  concepts: ["Cache sharding", "Hot-key handling", "Stampede protection"],
  reading: [{ title: "Infrastructure systems learning path", description: "Review caching infrastructure.", href: `${SEC(5)}#caching` }],
  components: ["load-balancer", "application-server", "redis", "postgresql"],
  scenarios: [
    sc("core", "Capacity", "Peak traffic: 2 million operations per second over 400 GB of hot data.", [
      rule("Provide 2,000,000 cache operations per second at 70% or less.", (c) => cacheOps(c) * 0.7 >= 2_000_000, {
        category: "capacity",
        label: "Throughput",
        points: 20,
        fail: (c) => `The cluster provides ${fmt(cacheOps(c))} ops/s; 2,000,000 at 70% needs ${fmt(2857143)}.`,
      }),
      rule("Hold 400 GB of hot data in memory across the shards.", (c) => cacheMemory(c) >= 400, {
        category: "capacity",
        label: "Memory",
        points: 15,
        fail: (c) => `The shards hold ${fmt(cacheMemory(c))} GB; the hot set is 400 GB.`,
      }),
    ]),
    sc("hot", "Hot keys", "A flash-sale product key gets 200,000 reads per second.", [
      configIs("redis", "hotKeyReplication", "Enabled", "Replicate hot keys across nodes so one key isn't limited to one shard.", "capacity", 15, { all: true }),
      rule("Evict with LRU or LFU, never refusing writes when memory fills.", (c) => c.has("redis") && c.nodes("redis").every((r) => E.str(r.config.evictionPolicy, "allkeys-lru") !== "noeviction"), {
        category: "Correctness",
        label: "Eviction",
      }),
    ]),
    sc("failure", "Node failure", "A cache node dies at peak.", [
      rule("Give every cache node at least one replica.", (c) => c.has("redis") && c.nodes("redis").every((r) => E.num(r.config.replicas) >= 1), { category: "reliability", label: "Replicas", points: 15 }),
      rule("Coalesce misses (with jittered TTLs) so a lost node doesn't stampede the database.", (c) => c.has("redis") && c.nodes("redis").every((r) => E.str(r.config.stampedeProtection, "None") !== "None"), {
        category: "reliability",
        label: "Stampede protection",
        points: 15,
      }),
    ]),
    sc("restart", "Warm restarts", "A rolling upgrade restarts every node.", [
      rule("Persist cache contents with an append-only file for warm restarts.", (c) => c.has("redis") && c.nodes("redis").every((r) => E.str(r.config.persistence) === "Append-only file"), { label: "Persistence" }),
    ], false),
  ],
  reference: {
    config: [
      "Four XL Redis shards, each with one replica: 3.2M ops/s (63% at peak) and 512 GB of memory.",
      "Hot-key replication, allkeys-lfu eviction, jittered TTLs with request coalescing, append-only persistence.",
    ],
    explanation: [
      "Sharding scales memory; replicas scale reads and survive failures. You need both.",
      "Without coalescing, a lost node turns every miss into a database query at the same moment.",
    ],
    graph: {
      nodes: [
        n("lb", "load-balancer", 40, 240, { healthChecks: "Enabled" }),
        n("svc", "application-server", 260, 240, { size: "Large", instances: 10 }),
        ...cacheNodes.map((id, i) =>
          n(id, "redis", 520, 60 + i * 120, {
            size: "XL",
            replicas: 1,
            hotKeyReplication: "Enabled",
            evictionPolicy: "allkeys-lfu",
            stampedeProtection: "Jittered TTL + coalescing",
            persistence: "Append-only file",
          }),
        ),
        n("db", "postgresql", 780, 240, { size: "Large" }),
      ],
      edges: [...w("lb>svc>db"), ...cacheNodes.map((id) => ({ source: "svc", target: id }))],
    },
  },
});

const secrets = expert({
  code: "EX0024",
  slug: "secrets-manager",
  title: "Secrets Manager",
  difficulty: "Hard",
  minutes: 40,
  description:
    "Design a secrets manager for 5,000 services that read secrets 50,000 times per second. Each service can read only its own secrets, every access is audited, secrets rotate on a schedule without downtime, and the service is highly available, because when it's down nothing else can start.",
  guide: {
    title: "Core read path",
    description: "Services authenticate with identity tokens; every read is authorized, audited and served from a replicated store.",
    flow: ["web-client", "api-gateway", "application-server", "authz-service"],
    extra: [
      { title: "Storage", flow: ["application-server", "dynamodb"] },
      { title: "Rotation", flow: ["job-scheduler", "worker", "dynamodb"] },
    ],
    notes: ["Fine-grained rules like 'service X, env prod, path db/*' are attributes."],
  },
  concepts: ["Service identity and authorization", "Audited access", "Zero-downtime rotation"],
  reading: [{ title: "Infrastructure systems learning path", description: "Review secrets management.", href: `${SEC(5)}#secrets` }],
  components: ["web-client", "api-gateway", "application-server", "authz-service", "dynamodb", "audit-log", "redis", "job-scheduler", "worker", "configuration-service", "multi-az", "disaster-recovery-region"],
  scenarios: [
    sc("core", "Access control", "A compromised service tries to read another team's database password.", [
      rule("Authorize every read through an attribute- or relationship-based authorization service.", (c) =>
        c.edge("application-server", "authz-service") && c.nodes("authz-service").some((a) => ["Attribute based", "Relationship based"].includes(E.str(a.config.model))), {
        category: "Security",
        label: "Authorization",
        points: 20,
      }),
      configIs("api-gateway", "auth", "JWT", "Authenticate services with signed identity tokens (JWT).", "Security", 10),
    ]),
    sc("rotation", "Audit and rotation", "Security rotates every database password quarterly and audits access.", [
      rule("Audit every access in an immutable log kept at least a year.", (c) => c.nodes("audit-log").some((a) => E.str(a.config.immutable) === "Enabled" && E.num(a.config.retentionDays) >= 365), {
        category: "Compliance",
        label: "Audit",
        points: 15,
      }),
      rule("Rotate secrets on a schedule with a durable job scheduler.", (c) => c.nodes("job-scheduler").some((j) => E.str(j.config.durability) === "Durable store" && E.outgoing(c.g, j.id).length > 0), {
        category: "Security",
        label: "Rotation",
      }),
      rule("Deliver new secret versions to services as versioned config pushed on change.", (c) => c.is("configuration-service", "versioned", "Enabled") && c.is("configuration-service", "delivery", "Push on change"), {
        category: "Release safety",
        label: "Versioned delivery",
      }),
    ]),
    sc("availability", "Availability", "A zone fails while services are deploying.", [
      rule("Cache encrypted secrets in Redis for 5 minutes or less to absorb read load.", (c) => c.edge("application-server", "redis") && c.nodes("redis").some((r) => E.num(r.config.ttlSeconds) > 0 && E.num(r.config.ttlSeconds) <= 300), {
        category: "Latency",
        label: "Read cache",
      }),
      rule("Store secrets in a replicated store with automatic recovery.", replicatedStore, { category: "reliability", label: "Replicated store", points: 15 }),
      rule("Spread the service across at least three availability zones.", (c) => c.nodes("multi-az").some((m) => E.num(m.config.zones) >= 3), { category: "reliability", label: "Multi-AZ" }),
    ]),
    sc("dr", "Regional disaster", "The primary region is lost entirely.", [
      rule("Keep a recovery region with recovery in 30 minutes or less.", (c) => drRegion(c, 30), { category: "reliability", label: "Second region" }),
    ], false),
  ],
  reference: {
    config: [
      "Services (JWT) -> gateway -> secrets API (Large x6, 3 zones) -> attribute-based authz, DynamoDB (RF 3), immutable audit log (2 years).",
      "Encrypted secrets cached in Redis for 2 minutes; scheduled rotation workers; versioned config pushes new secret versions.",
    ],
    explanation: [
      "Every read is an authorization decision and an audit event, so neither can be skipped on a fast path.",
      "Rotation writes a new version first; services pick it up by push, and the old version retires after.",
    ],
    graph: {
      nodes: [
        n("svc", "web-client", 40, 240),
        n("gw", "api-gateway", 240, 240, { auth: "JWT", rateLimitPerClientRps: 1000 }),
        n("api", "application-server", 460, 240, { size: "Large", instances: 6 }),
        n("authz", "authz-service", 700, 80, { model: "Attribute based", decisionCacheSeconds: 30 }),
        n("store", "dynamodb", 700, 240, { size: "Medium", consistency: "Strong", replicationFactor: 3 }),
        n("audit", "audit-log", 700, 400, { immutable: "Enabled", retentionDays: 730 }),
        n("cache", "redis", 940, 240, { size: "Medium", ttlSeconds: 120 }),
        n("config", "configuration-service", 940, 400, { versioned: "Enabled", delivery: "Push on change" }),
        n("sched", "job-scheduler", 460, 440, { schedule: "0 3 * * *", durability: "Durable store" }),
        n("rotator", "worker", 700, 560, { instances: 2 }),
        n("maz", "multi-az", 460, 60, { zones: 3 }),
        n("dr", "disaster-recovery-region", 940, 80, { mode: "Warm standby", rpoMinutes: 5, rtoMinutes: 20 }),
      ],
      edges: w("svc>gw>api>authz", "api>store", "api>audit", "api>cache", "api>config", "sched>rotator>store", "maz>api", "store>dr"),
    },
  },
});

const dataNodes = ["node-a", "node-b", "node-c"];
const objectStore = expert({
  code: "EX0025",
  slug: "object-storage-service",
  title: "Object Storage Service",
  difficulty: "Hard",
  minutes: 55,
  sectionChallenge: true,
  description:
    "Design an object storage service like the ones cloud providers offer. It stores objects from a few bytes to 5 TB and serves 30,000 requests per second. A write, once acknowledged, survives the loss of an entire availability zone, and a read right after a write always returns the new object. Old versions are kept on request, and cold data moves to cheaper tiers automatically.",
  guide: {
    title: "Core object path",
    description: "Stateless front ends write data to storage nodes in three zones and metadata to a strongly consistent store.",
    flow: ["web-client", "load-balancer", "application-server", "object-storage"],
    extra: [
      { title: "Metadata", flow: ["application-server", "dynamodb"] },
      { title: "Multipart uploads", flow: ["application-server", "chunking-service"] },
    ],
    notes: ["Treat each storage node as one availability zone's storage cluster."],
  },
  concepts: ["Durability across zones", "Strongly consistent metadata", "Multipart uploads and tiering"],
  reading: [{ title: "Infrastructure systems learning path", description: "Review storage systems.", href: `${SEC(5)}#object-storage` }],
  components: ["web-client", "cdn", "load-balancer", "application-server", "dynamodb", "postgresql", "chunking-service", "object-storage"],
  scenarios: [
    sc("core", "Durable writes", "A zone fails seconds after a customer's upload is acknowledged.", [
      rule("Write object data to at least three storage nodes, one per zone.", (c) => apps(c).some((a) => E.outgoing(c.g, a.id).filter((x) => x.type === "object-storage").length >= 3), {
        category: "reliability",
        label: "Three zones",
        points: 20,
      }),
      rule("Keep object metadata in a strongly consistent store replicated 3 ways.", (c) =>
        c.nodes("dynamodb").some((d) => E.str(d.config.consistency) === "Strong" && E.num(d.config.replicationFactor) >= 3) ||
        c.nodes("postgresql").some((p) => E.str(p.config.replicationMode) === "Sync" && E.replicasOf(c.g, p).length > 0), {
        category: "Correctness",
        label: "Read-after-write",
        points: 15,
      }),
      rule("Accept large objects as resumable multipart uploads.", (c) => c.nodes("chunking-service").some((s) => E.str(s.config.resumable) === "Enabled" && apps(c).some((a) => E.linkedEitherWay(c.g, a.id, s.id))), {
        category: "reliability",
        label: "Multipart",
      }),
    ]),
    sc("scale", "Request scale", "A data-lake job hits the service with 30,000 requests per second.", [
      serves(30000, 75, "Serve 30,000 requests per second at 75% CPU or less."),
      rule("Lay out keys under hashed prefixes on every storage node.", (c) => c.has("object-storage", 3) && c.nodes("object-storage").every((o) => E.str(o.config.keyLayout) === "Hashed prefixes"), {
        category: "capacity",
        label: "Key layout",
      }),
    ]),
    sc("lifecycle", "Versions and lifecycle", "Customers want to undo overwrites and pay less for cold data.", [
      rule("Keep object versions on every storage node.", (c) => c.has("object-storage") && c.nodes("object-storage").every((o) => E.str(o.config.versioning) === "Enabled"), {
        category: "Durability",
        label: "Versioning",
      }),
      rule("Move cold objects to a cheaper tier within 90 days.", (c) => c.nodes("object-storage").some((o) => E.num(o.config.lifecycleDays) > 0 && E.num(o.config.lifecycleDays) <= 90), { category: "cost", label: "Tiering" }),
    ]),
    sc("global", "Global reads", "Public assets in a bucket are read from every continent.", [
      rule("Serve public reads through a CDN in front of the service.", (c) => c.nodes("cdn").some((d) => E.outgoing(c.g, d.id).some((x) => x.type === "load-balancer")), { category: "Latency", label: "CDN" }),
    ], false),
  ],
  reference: {
    config: [
      "Load balancer -> front ends (XL x30, 40,500 RPS, 74%).",
      "Data written to storage nodes in three zones (hashed prefixes, versioning, 60-day tiering); metadata in DynamoDB (strong consistency, RF 3).",
      "Multipart uploads via a resumable chunking service; CDN for public reads.",
    ],
    explanation: [
      "Durability comes from placing every object in independent failure domains before acknowledging the write.",
      "Strongly consistent metadata is what makes 'read your own write' true for every client.",
    ],
    graph: {
      nodes: [
        n("client", "web-client", 40, 260),
        n("cdn", "cdn", 240, 120, { cachedContent: "Static + API GETs" }),
        n("lb", "load-balancer", 240, 260, { healthChecks: "Enabled" }),
        n("fe", "application-server", 460, 260, { size: "XL", instances: 30 }),
        n("meta", "dynamodb", 700, 60, { size: "Large", consistency: "Strong", replicationFactor: 3 }),
        n("mp", "chunking-service", 700, 180, { chunkSizeMb: 64, resumable: "Enabled" }),
        ...dataNodes.map((id, i) => n(id, "object-storage", 940, 160 + i * 130, { keyLayout: "Hashed prefixes", versioning: "Enabled", lifecycleDays: 60 })),
      ],
      edges: [...w("client>lb>fe>meta", "fe>mp", "client>cdn>lb"), ...dataNodes.map((id) => ({ source: "fe", target: id }))],
    },
  },
});

export const EXPERT: ProblemDef[] = [
  urlShortener,
  notificationPlatform,
  rateLimiter,
  fileSync,
  messaging,
  timelineFeed,
  photoSharing,
  videoPlatform,
  streaming,
  rideHailing,
  ticketing,
  payments,
  teamChat,
  docsDrive,
  autocomplete,
  fullText,
  editor,
  webhooks,
  scheduler,
  metricsPlatform,
  loggingPlatform,
  flagPlatform,
  distributedCache,
  secrets,
  objectStore,
];
