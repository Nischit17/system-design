import type { ProblemDef } from "../types";
import { column, configIs, fanOut, fmt, ids, lbEntry, numberAtLeast, numberAtMost, rule } from "../builders";
import type { Ctx } from "@/lib/sim/evaluate";
import type { GraphSpec } from "@/lib/sim/graph";
import * as E from "@/lib/sim/engine";

type NodeSpec = GraphSpec["nodes"][number];

const SB = "/tracks/service-resilience-advanced/sections/advanced-software-system-architecture-section-4";
const CD = "/tracks/service-resilience-advanced/sections/advanced-software-system-architecture-section-5";
const RP = "/tracks/service-resilience-advanced/sections/advanced-software-system-architecture-section-6";

const DB_TYPES = ["postgresql", "mysql", "dynamodb", "mongodb", "cassandra"];
const KV_TYPES = ["dynamodb", "mongodb", "cassandra"];
const apps = (c: Ctx) => c.nodes("application-server");
const appCallers = (c: Ctx, id: string) => E.incoming(c.g, id).filter((n) => n.type === "application-server");
/** Services that call another service directly (app -> app edges). */
const directServiceCalls = (c: Ctx) => apps(c).filter((a) => E.outgoing(c.g, a.id).some((n) => n.type === "application-server"));
const capacityOf = (nodes: ReturnType<Ctx["nodes"]>) => nodes.reduce((sum, n) => sum + E.serverCapacityRps(n), 0);

/* ---------------- Service Boundaries & Microservices ---------------- */

const searchFleet = (c: Ctx) => apps(c).filter((s) => E.str(s.config.servesPath) === "/search/*" && E.incoming(c.g, s.id).some((n) => n.type === "load-balancer"));
const coreFleet = (c: Ctx) =>
  apps(c).filter((s) => ["All paths", "/checkout/*"].includes(E.str(s.config.servesPath, "All paths")) && E.incoming(c.g, s.id).some((n) => n.type === "load-balancer"));
const searchStarving: ProblemDef = {
  code: "SSA0053",
  slug: "search-is-starving-checkout",
  title: "Search Is Starving Checkout",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Larkspur's monolith serves every page from one fleet. Search queries are CPU-heavy, and during sales they push the fleet to 97% CPU, so checkout times out right when customers are buying. Peak traffic is 1,400 RPS of search and 1,000 RPS for everything else. Extract search into its own fleet, routed by path, and keep each fleet at or below 80% CPU.",
  guide: {
    title: "Required request path",
    description: "One load balancer routes /search/* to a dedicated search fleet and everything else to the core fleet.",
    flow: ["load-balancer", "application-server", "elasticsearch"],
    secondary: { title: "Core path", flow: ["load-balancer", "application-server", "postgresql"] },
    notes: ["Enable path routing on the load balancer.", "Set the search fleet's Serves path to /search/*."],
  },
  concepts: ["Service extraction", "Isolating hot paths"],
  reading: [{ title: "Service boundaries learning path", description: "Review when to extract a service.", href: `${SB}#extraction` }],
  components: ["load-balancer", "application-server", "postgresql", "elasticsearch"],
  checks: [
    lbEntry(),
    configIs("load-balancer", "pathRouting", "Enabled", "Enable path-based routing on the load balancer.", "Isolation", 15),
    rule("Give search its own fleet that serves only /search/* requests.", (c) => searchFleet(c).length > 0, {
      category: "Isolation",
      label: "Search fleet",
      points: 20,
      fail: "No fleet is dedicated to /search/*, so search spikes still share CPU with checkout.",
    }),
    rule("Keep a separate fleet for checkout and the rest of the site.", (c) => coreFleet(c).length > 0, { category: "Isolation", label: "Core fleet", points: 15 }),
    rule("Size the search fleet so 1,400 RPS stays at or below 80% CPU.", (c) => capacityOf(searchFleet(c)) * 0.8 >= 1400, {
      category: "capacity",
      label: "Search capacity",
      points: 10,
      fail: (c) => `The search fleet provides ${fmt(capacityOf(searchFleet(c)))} RPS; 1,400 RPS at 80% needs 1,750.`,
    }),
    rule("Size the core fleet so 1,000 RPS stays at or below 80% CPU.", (c) => capacityOf(coreFleet(c)) * 0.8 >= 1000, {
      category: "capacity",
      label: "Core capacity",
      points: 10,
      fail: (c) => `The core fleet provides ${fmt(capacityOf(coreFleet(c)))} RPS; 1,000 RPS at 80% needs 1,250.`,
    }),
  ],
  reference: {
    config: ["Load balancer with path routing.", "Search fleet: Large x3 serving /search/* (2,400 RPS, 58% at peak).", "Core fleet: Large x2 serving all other paths (1,600 RPS, 63% at peak)."],
    explanation: [
      "Extracting a service is worth it when one workload has a different load profile from the rest. Search spikes now burn only search capacity.",
      "Each fleet is sized and scaled for its own traffic, and a search incident can no longer stop people from paying.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 40, y: 200, config: { pathRouting: "Enabled", healthChecks: "Enabled" } },
        { id: "search", type: "application-server", x: 340, y: 90, config: { size: "Large", instances: 3, servesPath: "/search/*" } },
        { id: "core", type: "application-server", x: 340, y: 310, config: { size: "Large", instances: 2, servesPath: "All paths" } },
        { id: "es", type: "elasticsearch", x: 640, y: 90, config: { size: "Medium", replicas: 1 } },
        { id: "db", type: "postgresql", x: 640, y: 310, config: { size: "Medium" } },
      ],
      edges: [
        { source: "lb", target: "search" },
        { source: "lb", target: "core" },
        { source: "search", target: "es" },
        { source: "core", target: "db" },
      ],
    },
  },
  fix: {
    description: "Larkspur runs one monolith fleet (Large x4) for every path. During sales, search drives CPU to 97% and checkout requests time out. Repair the architecture so search load can't starve checkout.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 40, y: 200 },
        { id: "fx-mono", type: "application-server", x: 340, y: 200, config: { size: "Large", instances: 4 } },
        { id: "fx-es", type: "elasticsearch", x: 640, y: 90, config: { size: "Medium", replicas: 1 } },
        { id: "fx-db", type: "postgresql", x: 640, y: 310, config: { size: "Medium" } },
      ],
      edges: [
        { source: "fx-lb", target: "fx-mono" },
        { source: "fx-mono", target: "fx-es" },
        { source: "fx-mono", target: "fx-db" },
      ],
    },
    metrics: { rps: 2400, appCpuPercent: 97, monthlyCostUsd: 3420, p95Ms: 2900, errorRatePercent: 7 },
  },
};

const sharedDb = (c: Ctx) => c.nodes(...DB_TYPES).some((d) => appCallers(c, d.id).length > 1);
const ownsDb = (c: Ctx) => apps(c).length >= 2 && apps(c).every((a) => E.outgoing(c.g, a.id).some((n) => DB_TYPES.includes(n.type))) && !sharedDb(c);
const eventLink = (c: Ctx) =>
  c.nodes("pub-sub", "event-stream").some((b) => E.incoming(c.g, b.id).length > 0 && E.outgoing(c.g, b.id).some((n) => n.type === "application-server" || n.type === "worker"));
const oneDatabase: ProblemDef = {
  code: "SSA0054",
  slug: "two-services-one-database",
  title: "Two Services, One Database",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Maplewood split orders and inventory into two services, but both still read and write the same PostgreSQL tables. Last month an inventory schema change broke order creation, and neither team can deploy without the other. Give each service its own database and have them share changes through events instead of tables.",
  guide: {
    title: "Required ownership model",
    description: "Each service owns its data; the orders service announces changes and inventory reacts to them.",
    flow: ["api-gateway", "application-server", "postgresql"],
    secondary: { title: "Change events", flow: ["postgresql", "worker", "pub-sub", "application-server"] },
    notes: ["No database should have two services writing to it.", "A transactional outbox keeps the event and the row in step."],
  },
  concepts: ["Database per service", "Integration through events"],
  reading: [{ title: "Service boundaries learning path", description: "Review data ownership.", href: `${SB}#ownership` }],
  components: ["api-gateway", "application-server", "postgresql", "worker", "pub-sub", "event-stream"],
  checks: [
    rule("Route requests through an API gateway to the orders and inventory services.", (c) => c.path("api-gateway", "application-server") && apps(c).length >= 2, {
      category: "validity",
      label: "Two services",
    }),
    rule("Give each service its own database that no other service touches.", ownsDb, {
      category: "Ownership",
      label: "Database per service",
      points: 25,
      fail: (c) => (sharedDb(c) ? "Two services still read and write the same database." : "Every service needs a database of its own."),
    }),
    rule("Share changes between services through events, not tables.", eventLink, { category: "Decoupling", label: "Event integration", points: 15 }),
    rule("Publish order events with a transactional outbox so a committed order is never missed.", (c) => c.is("postgresql", "outboxPattern", "Enabled") || c.is("mysql", "outboxPattern", "Enabled"), {
      category: "Correctness",
      label: "Outbox",
      soft: true,
    }),
  ],
  reference: {
    config: [
      "Orders service -> orders database (outbox enabled) -> relay worker -> pub/sub topic -> inventory service.",
      "Inventory service -> its own inventory database.",
    ],
    explanation: [
      "A shared table is a hidden API that nobody versions. Giving each service its own database makes the contract explicit: events.",
      "Each team can now change its schema and deploy on its own schedule, as long as the event contract holds.",
    ],
    graph: {
      nodes: [
        { id: "gw", type: "api-gateway", x: 40, y: 210, config: { auth: "JWT" } },
        { id: "orders", type: "application-server", x: 300, y: 100, config: { size: "Medium" } },
        { id: "inventory", type: "application-server", x: 580, y: 330, config: { size: "Medium" } },
        { id: "orders-db", type: "postgresql", x: 580, y: 100, config: { size: "Medium", outboxPattern: "Enabled" } },
        { id: "relay", type: "worker", x: 860, y: 100, config: { idempotent: "Enabled" } },
        { id: "bus", type: "pub-sub", x: 860, y: 330, config: { subscriberIsolation: "Queue per subscriber", schema: "Versioned schema registry" } },
        { id: "inv-db", type: "postgresql", x: 580, y: 520, config: { size: "Medium" } },
      ],
      edges: [
        { source: "gw", target: "orders" },
        { source: "gw", target: "inventory" },
        { source: "orders", target: "orders-db" },
        { source: "orders-db", target: "relay" },
        { source: "relay", target: "bus" },
        { source: "bus", target: "inventory" },
        { source: "inventory", target: "inv-db" },
      ],
    },
  },
  fix: {
    description: "Maplewood's orders and inventory services share one PostgreSQL database. Schema changes by one team keep breaking the other, and deploys need both teams in the room. Repair the data ownership.",
    starting: {
      nodes: [
        { id: "fx-gw", type: "api-gateway", x: 40, y: 210 },
        { id: "fx-orders", type: "application-server", x: 300, y: 100, config: { size: "Medium" } },
        { id: "fx-inventory", type: "application-server", x: 300, y: 320, config: { size: "Medium" } },
        { id: "fx-db", type: "postgresql", x: 600, y: 210, config: { size: "Medium" } },
      ],
      edges: [
        { source: "fx-gw", target: "fx-orders" },
        { source: "fx-gw", target: "fx-inventory" },
        { source: "fx-orders", target: "fx-db" },
        { source: "fx-inventory", target: "fx-db" },
      ],
    },
    metrics: { rps: 900, appCpuPercent: 45, monthlyCostUsd: 970, dbCpuPercent: 62, errorRatePercent: 4 },
  },
};

/** Most services one request passes through one after another. */
function longestServiceChain(c: Ctx): number {
  const depth = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return 0;
    const next = E.outgoing(c.g, id).filter((n) => n.type === "application-server");
    const inner = new Set(seen).add(id);
    return 1 + (next.length ? Math.max(...next.map((n) => depth(n.id, inner))) : 0);
  };
  return apps(c).reduce((m, a) => Math.max(m, depth(a.id, new Set())), 0);
}
const pageLatency = (c: Ctx) => E.chainLatencyMs(c.g, "api-gateway", { "api-gateway": 10, "application-server": 45, postgresql: 15, mongodb: 12, redis: 2 });
const pageServices = [
  { id: "catalog", type: "application-server", x: 620, y: 60, config: { size: "Medium" } },
  { id: "stock", type: "application-server", x: 620, y: 200, config: { size: "Medium" } },
  { id: "reviews", type: "application-server", x: 620, y: 340, config: { size: "Small" } },
];
const sevenHops: ProblemDef = {
  code: "SSA0055",
  slug: "seven-hops-to-render-a-page",
  title: "Seven Hops to Render a Page",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Driftwood split its product page into tiny services that call each other in a chain: product, price, discount, tax, stock, shipping estimate, reviews. Every hop adds about 45 ms and another way to fail. Redesign the boundaries: group data that changes together into one service and call independent services in parallel, so a page view goes through at most two services in sequence and renders in 200 ms or less.",
  guide: {
    title: "Required request path",
    description: "One page service fans out in parallel to a few right-sized services.",
    flow: ["api-gateway", "application-server", "application-server"],
    notes: ["Price, discount and tax change together; so do stock and shipping estimates.", "Reviews belongs to a different team and deploys daily."],
  },
  concepts: ["Service granularity", "Sequential vs. parallel calls"],
  reading: [{ title: "Service boundaries learning path", description: "Review how to size services.", href: `${SB}#granularity` }],
  components: ["api-gateway", "application-server", "postgresql", "mongodb", "redis"],
  checks: [
    rule("Serve the product page through an API gateway.", (c) => c.path("api-gateway", "application-server"), { category: "validity", label: "Entry point" }),
    rule("Call at most two services in sequence for one page view.", (c) => longestServiceChain(c) > 0 && longestServiceChain(c) <= 2, {
      category: "Latency",
      label: "Sequential hops",
      points: 20,
      fail: (c) => `A page view passes through ${longestServiceChain(c)} services one after another.`,
    }),
    rule("Fan out from the page service to independent services in parallel.", (c) => apps(c).some((a) => E.outgoing(c.g, a.id).filter((n) => n.type === "application-server").length >= 2), {
      category: "Latency",
      label: "Parallel calls",
    }),
    rule("Keep reviews, stock and product data in separate services owned by their teams.", (c) => apps(c).length >= 3, {
      category: "Ownership",
      label: "Team boundaries",
      fail: "Collapsing everything into one service would tie three teams to one deploy.",
    }),
    rule("Render the page in 200 ms or less (estimated).", (c) => pageLatency(c) > 0 && pageLatency(c) <= 200, {
      category: "Latency",
      label: "Page latency",
      points: 15,
      pass: (c) => `Estimated page latency is ${pageLatency(c)} ms.`,
      fail: (c) => `Estimated page latency is ${pageLatency(c)} ms; the target is 200 ms.`,
    }),
  ],
  reference: {
    config: ["API gateway -> product page service -> (catalog, stock, reviews) in parallel.", "Catalog owns price, discount and tax; stock owns availability and shipping estimates."],
    explanation: [
      "Service boundaries should follow what changes together, not every noun in the domain. Seven services in a chain paid seven network hops for one page.",
      "Parallel calls cost the slowest dependency, not the sum: about 115 ms instead of 340 ms here.",
    ],
    graph: {
      nodes: [
        { id: "gw", type: "api-gateway", x: 40, y: 200 },
        { id: "page", type: "application-server", x: 320, y: 200, config: { size: "Medium" } },
        ...pageServices,
        { id: "catalog-db", type: "postgresql", x: 900, y: 60 },
        { id: "stock-db", type: "postgresql", x: 900, y: 200 },
        { id: "reviews-db", type: "mongodb", x: 900, y: 340 },
      ],
      edges: [
        { source: "gw", target: "page" },
        ...fanOut("page", ids(pageServices)),
        { source: "catalog", target: "catalog-db" },
        { source: "stock", target: "stock-db" },
        { source: "reviews", target: "reviews-db" },
      ],
    },
  },
  fix: {
    description: "Driftwood's product page goes through seven services in a chain and p95 is 900 ms. Each extra hop is also another way for the page to fail. Repair the service boundaries.",
    starting: {
      nodes: [
        { id: "fx-gw", type: "api-gateway", x: 40, y: 260 },
        ...Array.from({ length: 7 }, (_, i) => ({ id: `fx-s${i + 1}`, type: "application-server", x: 260 + (i % 4) * 230, y: i < 4 ? 140 : 380, config: { size: "Small" } })),
        { id: "fx-db", type: "postgresql", x: 950, y: 380 },
      ],
      edges: [
        { source: "fx-gw", target: "fx-s1" },
        ...Array.from({ length: 6 }, (_, i) => ({ source: `fx-s${i + 1}`, target: `fx-s${i + 2}` })),
        { source: "fx-s7", target: "fx-db" },
      ],
    },
    metrics: { rps: 600, appCpuPercent: 35, monthlyCostUsd: 1440, p95Ms: 900, errorRatePercent: 1.8 },
  },
};

const loyaltyOutage: ProblemDef = {
  code: "SSA0056",
  slug: "the-loyalty-outage-that-broke-checkout",
  title: "The Loyalty Outage That Broke Checkout",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Thornbury's checkout calls the loyalty service synchronously to award points. Loyalty is not critical to a purchase, but when it went down for 20 minutes every checkout failed with it. Keep payment synchronous so the customer knows whether it worked, and make loyalty asynchronous so checkout succeeds even when loyalty is down. Points must still be awarded, exactly once, when loyalty recovers.",
  guide: {
    title: "Required checkout path",
    description: "Payment stays in the request; loyalty updates go through a queue.",
    flow: ["load-balancer", "application-server", "payment-gateway"],
    secondary: { title: "Deferred work", flow: ["application-server", "message-queue", "worker"] },
    notes: ["Ask of every dependency: must the user wait for this?"],
  },
  concepts: ["Asynchronous dependencies", "Critical vs. non-critical paths"],
  reading: [{ title: "Service boundaries learning path", description: "Review sync vs. async calls.", href: `${SB}#async` }],
  components: ["load-balancer", "application-server", "payment-gateway", "message-queue", "worker", "postgresql"],
  checks: [
    lbEntry(),
    rule("Keep payment synchronous so the customer gets a definite answer.", (c) => c.edge("application-server", "payment-gateway"), { category: "validity", label: "Payment path" }),
    rule("Stop calling the loyalty service synchronously from checkout.", (c) => directServiceCalls(c).length === 0, {
      category: "Resilience",
      label: "No sync dependency",
      points: 20,
      fail: "Checkout still waits on another service, so that service's outage is checkout's outage.",
    }),
    rule("Hand loyalty updates to a queue drained by a loyalty consumer.", (c) => c.path("application-server", "message-queue", "worker"), { category: "Resilience", label: "Async hand-off", points: 15 }),
    rule("Retry failed loyalty updates and dead-letter the ones that never succeed.", (c) => c.is("message-queue", "retry", "Enabled") && c.is("message-queue", "dlqEnabled", "Enabled"), {
      category: "reliability",
      label: "Retries",
    }),
    rule("Make the loyalty consumer idempotent so retries never double-award points.", (c) => c.all("worker", "idempotent", "Enabled"), { category: "Correctness", label: "Idempotency" }),
  ],
  reference: {
    config: ["Checkout -> payment gateway (synchronous).", "Checkout -> queue (retries, DLQ) -> idempotent loyalty worker -> loyalty database."],
    explanation: [
      "A synchronous call makes the caller's availability the product of both services'. Loyalty at 99% would cap checkout at 99%.",
      "With a queue in between, a loyalty outage just builds a backlog that drains when it recovers.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
        { id: "checkout", type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 2 } },
        { id: "psp", type: "payment-gateway", x: 600, y: 40, config: { idempotencyKeys: "Enabled" } },
        { id: "orders-db", type: "postgresql", x: 600, y: 180 },
        { id: "q", type: "message-queue", x: 600, y: 340, config: { retry: "Enabled", maxRetries: 10, dlqEnabled: "Enabled" } },
        { id: "loyalty", type: "worker", x: 880, y: 340, config: { idempotent: "Enabled", instances: 2 } },
        { id: "loyalty-db", type: "postgresql", x: 1140, y: 340 },
      ],
      edges: [
        { source: "lb", target: "checkout" },
        { source: "checkout", target: "psp" },
        { source: "checkout", target: "orders-db" },
        { source: "checkout", target: "q" },
        { source: "q", target: "loyalty" },
        { source: "loyalty", target: "loyalty-db" },
      ],
    },
  },
  fix: {
    description: "Thornbury's checkout waits on the loyalty service for every order. Whenever loyalty is slow or down, checkout fails with it: 18% of checkouts failed last month. Repair the dependency.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 40, y: 200 },
        { id: "fx-checkout", type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 2 } },
        { id: "fx-psp", type: "payment-gateway", x: 600, y: 40 },
        { id: "fx-orders-db", type: "postgresql", x: 600, y: 180 },
        { id: "fx-loyalty", type: "application-server", x: 600, y: 340, config: { size: "Small" } },
        { id: "fx-loyalty-db", type: "postgresql", x: 880, y: 340 },
      ],
      edges: [
        { source: "fx-lb", target: "fx-checkout" },
        { source: "fx-checkout", target: "fx-psp" },
        { source: "fx-checkout", target: "fx-orders-db" },
        { source: "fx-checkout", target: "fx-loyalty" },
        { source: "fx-loyalty", target: "fx-loyalty-db" },
      ],
    },
    metrics: { rps: 400, appCpuPercent: 39, monthlyCostUsd: 1780, p95Ms: 2600, errorRatePercent: 18 },
  },
};

/* ---------------- Consistency & Distributed Data ---------------- */

const replicaReads = (c: Ctx) => {
  const primary = E.primaryDbNode(c.g);
  const reps = E.replicasOf(c.g, primary);
  return !!primary && appCallers(c, primary.id).length > 0 && reps.some((r) => appCallers(c, r.id).length > 0);
};
const rawNodes: NodeSpec[] = [
  { id: "lb", type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled", readAfterWriteConsistency: "Enabled" } },
  { id: "app", type: "application-server", x: 320, y: 200, config: { size: "Large", instances: 2 } },
  { id: "primary", type: "postgresql", x: 640, y: 100, config: { size: "Medium", role: "Primary" } },
  { id: "rep", type: "postgresql", x: 640, y: 320, config: { size: "Medium", role: "Replica", replicatesFrom: "ref-primary" } },
];
const rawEdges = (p = "") => [
  { source: `${p}lb`, target: `${p}app` },
  { source: `${p}app`, target: `${p}primary` },
  { source: `${p}app`, target: `${p}rep` },
  { source: `${p}primary`, target: `${p}rep` },
];
const whereDidMyEditGo: ProblemDef = {
  code: "SSA0057",
  slug: "where-did-my-edit-go",
  title: "Where Did My Edit Go?",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Pinecrest sends reads to async replicas to keep load off the primary. Users who save their profile and reload right away often see the old version, assume the save failed, and save again or open a ticket. Keep replicas serving most reads, but make sure every user sees their own writes immediately.",
  guide: {
    title: "Required data path",
    description: "Writes go to the primary, most reads go to replicas, and a user's own recent writes are read from the primary.",
    flow: ["load-balancer", "application-server", "postgresql"],
    notes: ["Replication lag is normal; showing a user stale data about their own action is the bug."],
  },
  concepts: ["Read-after-write consistency", "Replication lag"],
  reading: [{ title: "Consistency learning path", description: "Review session consistency guarantees.", href: `${CD}#read-after-write` }],
  components: ["load-balancer", "application-server", "postgresql"],
  checks: [
    lbEntry(),
    rule("Write to a primary PostgreSQL database and serve reads from at least one replica.", replicaReads, { category: "capacity", label: "Read replicas", points: 15 }),
    configIs(
      "load-balancer",
      "readAfterWriteConsistency",
      "Enabled",
      "Route a user's reads to the primary for a short window after they write (read-after-write consistency).",
      "Consistency",
      25,
      { label: "Read your writes" },
    ),
    rule("Keep replication asynchronous so writes stay fast.", (c) => c.nodes("postgresql").every((d) => E.str(d.config.replicationMode, "Async") === "Async"), {
      category: "Latency",
      label: "Async replication",
      soft: true,
    }),
  ],
  reference: {
    config: ["Load balancer with read-after-write consistency enabled.", "Primary PostgreSQL plus one async replica; the app reads from both."],
    explanation: [
      "Making every read go to the primary would throw away the replicas; making replication synchronous would slow every write.",
      "Read-after-write consistency only pins the reads that need it: the ones from a user who just wrote.",
    ],
    graph: { nodes: rawNodes, edges: rawEdges() },
  },
  fix: {
    description: "Pinecrest reads from an async replica that lags by up to two seconds. One in eight profile saves is followed by a duplicate save or a support ticket. Repair the read path so users see their own changes.",
    starting: {
      nodes: rawNodes.map((n) => ({
        ...n,
        id: `fx-${n.id}`,
        config: n.type === "load-balancer" ? { healthChecks: "Enabled" } : n.id === "rep" ? { ...n.config, replicatesFrom: "fx-primary" } : n.config,
      })),
      edges: rawEdges("fx-"),
    },
    metrics: { rps: 1500, appCpuPercent: 52, monthlyCostUsd: 1860, dbCpuPercent: 41, p95Ms: 140 },
  },
};

const regionalPrimaries = (c: Ctx) => c.nodes("postgresql", "mysql").filter((d) => E.str(d.config.role) === "Primary");
const forgetfulCart: ProblemDef = {
  code: "SSA0058",
  slug: "the-cart-that-forgot-items",
  title: "The Cart That Forgot Items",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Wavecrest runs its shopping cart active-active in us-east and eu-west so every customer writes to the nearest region. When someone adds items from a phone and a laptop at the same moment and the requests land in different regions, last-write-wins keeps one cart and silently drops the other item. Keep both regions writable and make concurrent cart edits merge instead of overwrite.",
  guide: {
    title: "Required multi-region path",
    description: "Latency-based DNS sends users to the nearest region; regional databases replicate and merge.",
    flow: ["dns", "application-server", "postgresql"],
    notes: ["Set the Region field on each regional node.", "Adding to a cart is a set union; it should commute."],
  },
  concepts: ["Conflict resolution", "Active-active replication"],
  reading: [{ title: "Consistency learning path", description: "Review conflict handling across regions.", href: `${CD}#conflicts` }],
  components: ["dns", "application-server", "postgresql"],
  checks: [
    configIs("dns", "routingPolicy", "Latency based", "Send each customer to the nearest region with latency-based DNS.", "Latency", 10),
    rule("Run the cart service in two regions.", (c) => new Set(apps(c).map((a) => E.str(a.config.region))).size >= 2, { category: "reliability", label: "Two regions" }),
    rule("Make the cart database writable in both regions.", (c) => regionalPrimaries(c).length >= 2 && new Set(regionalPrimaries(c).map((d) => E.str(d.config.region))).size >= 2, {
      category: "reliability",
      label: "Active-active",
      points: 15,
    }),
    rule("Merge concurrent cart edits with a CRDT instead of last-write-wins.", (c) => regionalPrimaries(c).length >= 2 && regionalPrimaries(c).every((d) => E.str(d.config.conflictResolution) === "Custom Merge / CRDT"), {
      category: "Correctness",
      label: "Merge, don't overwrite",
      points: 25,
    }),
    rule("Replicate between the regional databases.", (c) => {
      const p = regionalPrimaries(c);
      return p.length >= 2 && p.slice(1).every((d) => E.linkedEitherWay(c.g, p[0].id, d.id));
    }, { category: "validity", label: "Replication link" }),
  ],
  reference: {
    config: ["DNS with latency-based routing and health checks.", "Cart service and a primary PostgreSQL in each of us-east and eu-west, replicating to each other with CRDT merge."],
    explanation: [
      "Last-write-wins is fine when one write really replaces another. Two items added at once are two facts, and keeping only one loses data.",
      "A CRDT merge (for a cart, the union of added items minus removals) gives the same result whichever order the regions see the writes.",
    ],
    graph: {
      nodes: [
        { id: "dns", type: "dns", x: 40, y: 200, config: { routingPolicy: "Latency based", healthChecks: "Enabled" } },
        { id: "app-us", type: "application-server", x: 320, y: 90, config: { size: "Medium", instances: 2, region: "us-east" } },
        { id: "app-eu", type: "application-server", x: 320, y: 310, config: { size: "Medium", instances: 2, region: "eu-west" } },
        { id: "db-us", type: "postgresql", x: 640, y: 90, config: { size: "Medium", role: "Primary", conflictResolution: "Custom Merge / CRDT", region: "us-east" } },
        { id: "db-eu", type: "postgresql", x: 640, y: 310, config: { size: "Medium", role: "Primary", conflictResolution: "Custom Merge / CRDT", region: "eu-west" } },
      ],
      edges: [
        { source: "dns", target: "app-us" },
        { source: "dns", target: "app-eu" },
        { source: "app-us", target: "db-us" },
        { source: "app-eu", target: "db-eu" },
        { source: "db-us", target: "db-eu" },
      ],
    },
  },
  fix: {
    description: "Wavecrest's two regional cart databases resolve conflicts with last-write-wins. About 0.6% of multi-device sessions lose an item without any error. Repair conflict handling while keeping both regions writable.",
    starting: {
      nodes: [
        { id: "fx-dns", type: "dns", x: 40, y: 200, config: { routingPolicy: "Latency based", healthChecks: "Enabled" } },
        { id: "fx-app-us", type: "application-server", x: 320, y: 90, config: { size: "Medium", instances: 2, region: "us-east" } },
        { id: "fx-app-eu", type: "application-server", x: 320, y: 310, config: { size: "Medium", instances: 2, region: "eu-west" } },
        { id: "fx-db-us", type: "postgresql", x: 640, y: 90, config: { size: "Medium", role: "Primary", region: "us-east" } },
        { id: "fx-db-eu", type: "postgresql", x: 640, y: 310, config: { size: "Medium", role: "Primary", region: "eu-west" } },
      ],
      edges: [
        { source: "fx-dns", target: "fx-app-us" },
        { source: "fx-dns", target: "fx-app-eu" },
        { source: "fx-app-us", target: "fx-db-us" },
        { source: "fx-app-eu", target: "fx-db-eu" },
        { source: "fx-db-us", target: "fx-db-eu" },
      ],
    },
    metrics: { rps: 700, appCpuPercent: 31, monthlyCostUsd: 1780, errorRatePercent: 0.6 },
  },
};

const syncBalances = (c: Ctx) => c.nodes("postgresql").some((d) => E.str(d.config.role) !== "Replica" && E.str(d.config.replicationMode) === "Sync" && E.replicasOf(c.g, d).length > 0);
const availableLikes = (c: Ctx) => c.nodes(...KV_TYPES).some((d) => E.str(d.config.consistency, "Eventual") === "Eventual" && E.num(d.config.replicationFactor) >= 3);
const balancesAndLikes: ProblemDef = {
  code: "SSA0059",
  slug: "balances-and-likes",
  title: "Balances and Likes",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Fernway's app stores two very different kinds of data. Wallet balances must never show a stale or conflicting value, because that loses real money. Post like-counts can lag a few seconds, but the feed must keep working. During a network partition you can't have both consistency and availability, so choose per dataset: balances refuse writes rather than diverge, and likes stay available.",
  guide: {
    title: "Required data paths",
    description: "Wallet and social features use different stores with different guarantees.",
    flow: ["api-gateway", "application-server", "postgresql"],
    secondary: { title: "Social path", flow: ["api-gateway", "application-server", "cassandra"] },
    notes: ["Synchronous replication favors consistency.", "Eventual consistency with several replicas favors availability."],
  },
  concepts: ["CAP trade-offs", "Choosing consistency per dataset"],
  reading: [{ title: "Consistency learning path", description: "Review consistency vs. availability.", href: `${CD}#cap` }],
  components: ["api-gateway", "application-server", "postgresql", "cassandra", "dynamodb"],
  checks: [
    rule("Serve wallet and social features from separate services behind an API gateway.", (c) => c.path("api-gateway", "application-server") && apps(c).length >= 2, { category: "validity", label: "Two services" }),
    rule("Keep balances in PostgreSQL with synchronous replication to a replica.", syncBalances, {
      category: "Consistency",
      label: "Balances",
      points: 20,
      fail: "Balances use asynchronous replication, so a failover can lose or fork recent balance changes.",
    }),
    rule("Keep like counts in an eventually consistent store replicated at least 3 ways.", availableLikes, { category: "Availability", label: "Likes", points: 20 }),
    rule("Keep like traffic off the strongly consistent wallet database.", (c) => {
      const kvWriters = apps(c).filter((a) => E.outgoing(c.g, a.id).some((n) => KV_TYPES.includes(n.type)));
      return kvWriters.length > 0 && kvWriters.every((a) => !E.outgoing(c.g, a.id).some((n) => n.type === "postgresql"));
    }, { category: "quality", label: "Separate stores" }),
  ],
  reference: {
    config: ["Wallet service -> PostgreSQL primary with synchronous replication and auto failover.", "Social service -> Cassandra, eventual consistency, replication factor 3."],
    explanation: [
      "During a partition, a system can either refuse some requests or risk disagreeing with itself. The right choice depends on the data.",
      "A refused balance update can be retried; a double-spent balance can't be undone. A like count that is briefly off harms nobody, but a feed that won't load does.",
    ],
    graph: {
      nodes: [
        { id: "gw", type: "api-gateway", x: 40, y: 200, config: { auth: "JWT" } },
        { id: "wallet", type: "application-server", x: 320, y: 90, config: { size: "Medium", instances: 2 } },
        { id: "social", type: "application-server", x: 320, y: 320, config: { size: "Medium", instances: 2 } },
        { id: "wallet-db", type: "postgresql", x: 620, y: 40, config: { size: "Medium", role: "Primary", replicationMode: "Sync", autoFailover: "Enabled" } },
        { id: "wallet-rep", type: "postgresql", x: 900, y: 40, config: { size: "Medium", role: "Replica", replicatesFrom: "ref-wallet-db", replicationMode: "Sync" } },
        { id: "likes", type: "cassandra", x: 620, y: 320, config: { size: "Medium", consistency: "Eventual", replicationFactor: 3 } },
      ],
      edges: [
        { source: "gw", target: "wallet" },
        { source: "gw", target: "social" },
        { source: "wallet", target: "wallet-db" },
        { source: "wallet-db", target: "wallet-rep" },
        { source: "social", target: "likes" },
      ],
    },
  },
  fix: {
    description: "Fernway keeps balances and like-counts in one PostgreSQL database with async replication. A failover last month lost 14 seconds of balance updates, while like traffic keeps the database at 88% CPU. Repair the data layer with the right guarantee for each dataset.",
    starting: {
      nodes: [
        { id: "fx-gw", type: "api-gateway", x: 40, y: 200 },
        { id: "fx-wallet", type: "application-server", x: 320, y: 90, config: { size: "Medium", instances: 2 } },
        { id: "fx-social", type: "application-server", x: 320, y: 320, config: { size: "Medium", instances: 2 } },
        { id: "fx-db", type: "postgresql", x: 620, y: 200, config: { size: "Medium", role: "Primary" } },
        { id: "fx-rep", type: "postgresql", x: 900, y: 200, config: { size: "Medium", role: "Replica", replicatesFrom: "fx-db" } },
      ],
      edges: [
        { source: "fx-gw", target: "fx-wallet" },
        { source: "fx-gw", target: "fx-social" },
        { source: "fx-wallet", target: "fx-db" },
        { source: "fx-social", target: "fx-db" },
        { source: "fx-db", target: "fx-rep" },
      ],
    },
    metrics: { rps: 2200, appCpuPercent: 48, monthlyCostUsd: 1850, dbCpuPercent: 88, errorRatePercent: 0.3 },
  },
};

const cdcNodes = (p: string, mode: string, instances: number): NodeSpec[] => [
  { id: `${p}lb`, type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
  { id: `${p}app`, type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 2 } },
  { id: `${p}db`, type: "postgresql", x: 580, y: 80, config: { size: "Medium" } },
  { id: `${p}indexer`, type: "search-indexer", x: 860, y: 80, config: { mode, instances } },
  { id: `${p}es`, type: "elasticsearch", x: 860, y: 320, config: { size: "Medium", replicas: 1 } },
];
const cdcEdges = (p: string) => [
  { source: `${p}lb`, target: `${p}app` },
  { source: `${p}app`, target: `${p}db` },
  { source: `${p}app`, target: `${p}es` },
  { source: `${p}db`, target: `${p}indexer` },
  { source: `${p}indexer`, target: `${p}es` },
];
const dayBehind: ProblemDef = {
  code: "SSA0060",
  slug: "the-status-page-is-a-day-behind",
  title: "The Status Page Is a Day Behind",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Harbor's order-status page reads from a search index that a nightly job rebuilds from PostgreSQL. Customers see 'processing' for orders that shipped hours ago and call support. Keep the read model separate from the write database, but keep it within seconds of the source of truth.",
  guide: {
    title: "Required data path",
    description: "Writes land in PostgreSQL; committed changes stream into the index that serves reads.",
    flow: ["application-server", "postgresql", "search-indexer", "elasticsearch"],
    notes: ["A read model is only as fresh as the pipeline that feeds it."],
  },
  concepts: ["Materialized view lag", "Change data capture"],
  reading: [{ title: "Consistency learning path", description: "Review read models and their freshness.", href: `${CD}#read-models` }],
  components: ["load-balancer", "application-server", "postgresql", "search-indexer", "elasticsearch", "job-scheduler"],
  checks: [
    lbEntry(),
    rule("Write orders to PostgreSQL and serve status reads from the search index.", (c) => c.edge("application-server", "postgresql") && c.edge("application-server", "elasticsearch"), {
      category: "validity",
      label: "Read model",
    }),
    rule("Feed the index from the database with a search indexer.", (c) => c.path("postgresql", "search-indexer", "elasticsearch"), { category: "validity", label: "Index pipeline" }),
    configIs("search-indexer", "mode", "Change data capture", "Stream every committed change into the index with change data capture.", "Freshness", 25, { label: "CDC" }),
    numberAtLeast("search-indexer", "instances", 2, "Run at least two indexer instances so one failure doesn't stall updates.", "reliability", 10, { label: "Indexer redundancy" }),
  ],
  reference: {
    config: ["PostgreSQL -> search indexer (change data capture, 2 instances) -> Elasticsearch.", "The app writes to PostgreSQL and reads order status from Elasticsearch."],
    explanation: [
      "A nightly rebuild means the read model is, on average, twelve hours stale. Change data capture streams each commit within seconds.",
      "The read model stays separate, so heavy status traffic never touches the write database.",
    ],
    graph: { nodes: cdcNodes("", "Change data capture", 2), edges: cdcEdges("") },
  },
  fix: {
    description: "Harbor's search indexer rebuilds the order-status index once a night. Status lags by up to 24 hours and 'where is my order' tickets are 30% of support volume. Repair the read model's freshness.",
    starting: { nodes: cdcNodes("fx-", "Nightly batch", 1), edges: cdcEdges("fx-") },
    metrics: { rps: 1200, appCpuPercent: 38, monthlyCostUsd: 2010, p95Ms: 120 },
  },
};

/* ---------------- Reliability Patterns ---------------- */

const breakerOk = (c: Ctx) => c.path("application-server", "circuit-breaker", "application-server") && directServiceCalls(c).length === 0;
const hangingRecs: ProblemDef = {
  code: "SSA0061",
  slug: "the-recommendations-service-hangs",
  title: "The Recommendations Service Hangs",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Elmstead's product page calls a recommendations service. When recommendations hangs, each page request waits 30 seconds, the worker pool fills up, and the whole product page goes down, even though recommendations are optional. Fail fast when the dependency is unhealthy and degrade gracefully.",
  guide: {
    title: "Required request path",
    description: "Wrap the optional dependency in a circuit breaker with a short timeout and a fallback.",
    flow: ["load-balancer", "application-server", "circuit-breaker", "application-server"],
    notes: ["An open breaker returns the fallback instantly instead of waiting."],
  },
  concepts: ["Circuit breakers", "Graceful degradation"],
  reading: [{ title: "Reliability patterns learning path", description: "Review circuit breakers.", href: `${RP}#circuit-breakers` }],
  components: ["load-balancer", "application-server", "circuit-breaker", "postgresql", "redis"],
  checks: [
    lbEntry(),
    rule("Call recommendations through a circuit breaker.", breakerOk, {
      category: "Resilience",
      label: "Breaker in path",
      points: 15,
      fail: "The page still calls recommendations directly, so a hang still holds page workers.",
    }),
    numberAtMost("circuit-breaker", "timeoutMs", 500, "Time out recommendation calls after 500 ms or less.", "Latency", 15, { label: "Timeout" }),
    configIs("circuit-breaker", "fallback", "Cached / default response", "Return cached or default recommendations while the breaker is open.", "Resilience", 20, { label: "Fallback" }),
    rule("Open the breaker once 50% or fewer of recent calls fail.", (c) => c.nodes("circuit-breaker").some((b) => E.num(b.config.failureThresholdPercent) > 0 && E.num(b.config.failureThresholdPercent) <= 50), {
      category: "Resilience",
      label: "Trip threshold",
    }),
  ],
  reference: {
    config: ["Product page -> circuit breaker (25% failure threshold, 30 s open, 300 ms timeout, cached fallback) -> recommendations."],
    explanation: [
      "Without a timeout, a slow dependency converts into a full worker pool. Without a breaker, every request keeps paying that timeout.",
      "With a fallback, users see generic recommendations for a while instead of an error page.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
        { id: "page", type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 2 } },
        { id: "cb", type: "circuit-breaker", x: 580, y: 80, config: { failureThresholdPercent: 25, openSeconds: 30, fallback: "Cached / default response", timeoutMs: 300 } },
        { id: "recs", type: "application-server", x: 860, y: 80, config: { size: "Medium" } },
        { id: "db", type: "postgresql", x: 580, y: 320 },
      ],
      edges: [
        { source: "lb", target: "page" },
        { source: "page", target: "cb" },
        { source: "cb", target: "recs" },
        { source: "page", target: "db" },
      ],
    },
  },
  fix: {
    description: "Elmstead's product page waits up to 30 seconds on recommendations. During last week's recommendations incident, 62% of product page requests failed. Repair the dependency handling.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 40, y: 200 },
        { id: "fx-page", type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 2 } },
        { id: "fx-recs", type: "application-server", x: 600, y: 80, config: { size: "Medium" } },
        { id: "fx-db", type: "postgresql", x: 600, y: 320 },
      ],
      edges: [
        { source: "fx-lb", target: "fx-page" },
        { source: "fx-page", target: "fx-recs" },
        { source: "fx-page", target: "fx-db" },
      ],
    },
    metrics: { rps: 1800, appCpuPercent: 23, monthlyCostUsd: 1840, p95Ms: 30000, errorRatePercent: 62 },
  },
};

const retryNodes = (p: string, retry: Record<string, string | number>) => [
  { id: `${p}lb`, type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
  { id: `${p}orders`, type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 2 } },
  { id: `${p}retry`, type: "retry-policy", x: 560, y: 200, config: retry },
  { id: `${p}inventory`, type: "application-server", x: 820, y: 200, config: { size: "Large", instances: 2 } },
  { id: `${p}db`, type: "postgresql", x: 1080, y: 200, config: { size: "Medium" } },
];
const retryEdges = (p: string) => [
  { source: `${p}lb`, target: `${p}orders` },
  { source: `${p}orders`, target: `${p}retry` },
  { source: `${p}retry`, target: `${p}inventory` },
  { source: `${p}inventory`, target: `${p}db` },
];
const retryStorm: ProblemDef = {
  code: "SSA0062",
  slug: "the-retry-storm",
  title: "The Retry Storm",
  difficulty: "Medium",
  minutes: 15,
  description:
    "When Juniper's inventory service had a 30-second blip, every caller retried immediately, up to 10 times. Traffic to inventory jumped tenfold and turned the blip into a 40-minute outage. Keep retries for transient failures, but make them back off, spread out, and stop amplifying an outage.",
  guide: {
    title: "Required request path",
    description: "Calls to inventory go through a retry policy that backs off, randomizes and stops.",
    flow: ["application-server", "retry-policy", "application-server"],
    notes: ["Total attempts include the first try.", "A retry budget caps retries as a share of normal traffic."],
  },
  concepts: ["Retry storms", "Exponential backoff with jitter"],
  reading: [{ title: "Reliability patterns learning path", description: "Review safe retries.", href: `${RP}#retries` }],
  components: ["load-balancer", "application-server", "retry-policy", "postgresql"],
  checks: [
    rule("Call inventory through a retry policy.", (c) => c.path("application-server", "retry-policy", "application-server") && directServiceCalls(c).length === 0, { category: "validity", label: "Retry policy" }),
    configIs("retry-policy", "backoff", "Exponential", "Back off exponentially between attempts.", "Resilience", 20, { label: "Backoff" }),
    configIs("retry-policy", "jitter", "Enabled", "Add jitter so clients don't retry in lockstep.", "Resilience", 15, { label: "Jitter" }),
    rule("Cap each call at 2 to 4 total attempts.", (c) => c.nodes("retry-policy").some((r) => E.num(r.config.maxAttempts) >= 2 && E.num(r.config.maxAttempts) <= 4), {
      category: "Load",
      label: "Attempt cap",
      points: 15,
    }),
    rule("Limit retries to 20% or less of normal traffic with a retry budget.", (c) => c.nodes("retry-policy").some((r) => E.num(r.config.retryBudgetPercent) > 0 && E.num(r.config.retryBudgetPercent) <= 20), {
      category: "Load",
      label: "Retry budget",
    }),
  ],
  reference: {
    config: ["Retry policy: 3 attempts, exponential backoff, jitter on, 10% retry budget."],
    explanation: [
      "Immediate retries from every client multiply load exactly when the service is weakest. Ten attempts can mean ten times the traffic.",
      "Backoff gives the service time to recover, jitter spreads retries out, and a retry budget caps the worst case at 1.1x normal load.",
    ],
    graph: { nodes: retryNodes("", { maxAttempts: 3, backoff: "Exponential", jitter: "Enabled", retryBudgetPercent: 10 }), edges: retryEdges("") },
  },
  fix: {
    description: "Juniper's orders service retries inventory calls immediately, up to 10 times, with no budget. A 30-second inventory blip became a 40-minute outage at 10x normal load. Repair the retry behavior.",
    starting: { nodes: retryNodes("fx-", { maxAttempts: 10, backoff: "Immediate", jitter: "Disabled", retryBudgetPercent: 100 }), edges: retryEdges("fx-") },
    metrics: { rps: 2000, appCpuPercent: 100, monthlyCostUsd: 2880, p95Ms: 12000, errorRatePercent: 71 },
  },
};

const partners = column("partner", "application-server", 3, 860, 200, { size: "Small" }, 130);
const onePartner: ProblemDef = {
  code: "SSA0063",
  slug: "one-partner-took-everything-down",
  title: "One Partner Took Everything Down",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Northgate's travel search calls three partner APIs (flights, hotels and cars) from one shared pool of 240 concurrent connections. When the car partner slowed to 20 seconds per call, its requests filled the whole pool and flight and hotel searches failed too. Isolate each partner so a slow one can only exhaust its own share.",
  guide: {
    title: "Required request path",
    description: "Partner calls go through a bulkhead with a separate pool per partner.",
    flow: ["load-balancer", "application-server", "bulkhead", "application-server"],
    notes: ["A bulkhead caps how much of a shared resource one dependency can hold."],
  },
  concepts: ["Bulkheads", "Resource isolation"],
  reading: [{ title: "Reliability patterns learning path", description: "Review bulkheads.", href: `${RP}#bulkheads` }],
  components: ["load-balancer", "application-server", "bulkhead", "circuit-breaker"],
  checks: [
    lbEntry(),
    rule("Call partner adapters through a bulkhead.", (c) => c.path("application-server", "bulkhead", "application-server") && directServiceCalls(c).length === 0, { category: "validity", label: "Bulkhead in path" }),
    rule("Give each of the three partners its own pool.", (c) => c.nodes("bulkhead").some((b) => E.num(b.config.pools) >= 3 && E.outgoing(c.g, b.id).length >= 3), {
      category: "Isolation",
      label: "Pool per partner",
      points: 25,
    }),
    rule("Cap each pool so all pools together fit in the 240 connections search can hold.", (c) => c.nodes("bulkhead").some((b) => E.num(b.config.maxConcurrentPerPool) > 0 && E.num(b.config.maxConcurrentPerPool) * Math.max(1, E.num(b.config.pools)) <= 240), {
      category: "capacity",
      label: "Pool sizes",
      points: 15,
    }),
  ],
  reference: {
    config: ["Search -> bulkhead (3 pools x 60 concurrent calls) -> flights, hotels and cars adapters."],
    explanation: [
      "With one shared pool, the slowest partner ends up holding every connection. With a pool per partner, it can hold at most its own 60.",
      "Flights and hotels keep working while cars is slow; only car results degrade.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 40, y: 200, config: { healthChecks: "Enabled" } },
        { id: "search", type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 2 } },
        { id: "bh", type: "bulkhead", x: 580, y: 200, config: { pools: 3, maxConcurrentPerPool: 60 } },
        ...partners,
      ],
      edges: [{ source: "lb", target: "search" }, { source: "search", target: "bh" }, ...fanOut("bh", ids(partners))],
    },
  },
  fix: {
    description: "Northgate's search shares one connection pool across three partner APIs. A slow car partner exhausted it and 57% of all searches failed. Repair the isolation between partners.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 40, y: 200 },
        { id: "fx-search", type: "application-server", x: 300, y: 200, config: { size: "Large", instances: 2 } },
        ...column("fx-partner", "application-server", 3, 640, 200, { size: "Small" }, 130),
      ],
      edges: [{ source: "fx-lb", target: "fx-search" }, ...fanOut("fx-search", ["fx-partner-1", "fx-partner-2", "fx-partner-3"])],
    },
    metrics: { rps: 1100, appCpuPercent: 27, monthlyCostUsd: 1960, p95Ms: 20000, errorRatePercent: 57 },
  },
};

const challengeChecks = [
  rule("Admit traffic through a rate limiter that ramps up gradually after an outage.", (c) => c.is("rate-limiter", "rampUpStrategy", "Gradual") && c.edge("rate-limiter", "load-balancer"), {
    category: "Recovery",
    label: "Gradual ramp-up",
    points: 15,
  }),
  rule("Isolate the three dependencies with a bulkhead pool for each.", (c) => c.nodes("bulkhead").some((b) => E.num(b.config.pools) >= 3), { category: "Isolation", label: "Bulkhead", points: 15 }),
  rule("Protect fraud scoring with a circuit breaker: 1 s timeout or less and a default decision as fallback.", (c) =>
    c.nodes("circuit-breaker").some((b) => E.str(b.config.fallback) === "Cached / default response" && E.num(b.config.timeoutMs) > 0 && E.num(b.config.timeoutMs) <= 1000), {
    category: "Resilience",
    label: "Circuit breaker",
    points: 15,
  }),
  rule("Retry the tax API with exponential backoff, jitter and 2 to 4 attempts.", (c) =>
    c.nodes("retry-policy").some((r) => E.str(r.config.backoff) === "Exponential" && E.str(r.config.jitter) === "Enabled" && E.num(r.config.maxAttempts) >= 2 && E.num(r.config.maxAttempts) <= 4), {
    category: "Resilience",
    label: "Safe retries",
    points: 15,
  }),
  rule("Never call a dependency directly from checkout.", (c) => directServiceCalls(c).length === 0 && apps(c).length >= 4, { category: "quality", label: "Guarded calls" }),
];
const reliabilityChallenge: ProblemDef = {
  code: "SSA0064",
  slug: "reliability-patterns-challenge",
  title: "Reliability Patterns Challenge",
  difficulty: "Hard",
  minutes: 25,
  sectionChallenge: true,
  description:
    "Kingsbridge's checkout depends on fraud scoring, a tax API and an address validator. Last quarter fraud scoring hung and took checkout down, a tax API blip triggered a retry storm, and when service came back a flood of waiting clients knocked it over again. Design the dependency layer so each of these failure modes is contained.",
  guide: {
    title: "Required request path",
    description: "Gate admission at the edge, isolate each dependency, and give each the protection its failure mode needs.",
    flow: ["web-client", "rate-limiter", "load-balancer", "application-server", "bulkhead"],
    extra: [
      { title: "Fraud scoring", flow: ["bulkhead", "circuit-breaker", "application-server"] },
      { title: "Tax API", flow: ["bulkhead", "retry-policy", "application-server"] },
    ],
    notes: ["A gradual ramp lets a recovering service warm up before full traffic returns."],
  },
  concepts: ["Composing reliability patterns", "Recovery ramp-up"],
  reading: [{ title: "Reliability patterns learning path", description: "Review how the patterns combine.", href: `${RP}#composition` }],
  components: ["web-client", "rate-limiter", "load-balancer", "application-server", "bulkhead", "circuit-breaker", "retry-policy"],
  checks: challengeChecks,
  reference: {
    config: [
      "Rate limiter (token bucket, 3,000 req/s, gradual ramp-up) in front of the load balancer.",
      "Checkout -> bulkhead (3 pools x 50): fraud via circuit breaker (400 ms, default decision), tax via retry policy (3 attempts, exponential, jitter), address validator direct from its pool.",
    ],
    explanation: [
      "Each pattern answers one failure mode: breakers for hangs, backoff for blips, bulkheads for slow neighbors, gradual admission for recovery stampedes.",
      "Composed together, one bad dependency degrades one feature instead of the whole checkout.",
    ],
    graph: {
      nodes: [
        { id: "web", type: "web-client", x: 40, y: 220 },
        { id: "rl", type: "rate-limiter", x: 260, y: 220, config: { algorithm: "Token bucket", requestsPerSecond: 3000, scope: "Global", rampUpStrategy: "Gradual" } },
        { id: "lb", type: "load-balancer", x: 480, y: 220, config: { healthChecks: "Enabled" } },
        { id: "checkout", type: "application-server", x: 700, y: 220, config: { size: "Large", instances: 2 } },
        { id: "bh", type: "bulkhead", x: 920, y: 220, config: { pools: 3, maxConcurrentPerPool: 50 } },
        { id: "cb", type: "circuit-breaker", x: 1140, y: 80, config: { failureThresholdPercent: 30, openSeconds: 30, fallback: "Cached / default response", timeoutMs: 400 } },
        { id: "retry", type: "retry-policy", x: 1140, y: 220, config: { maxAttempts: 3, backoff: "Exponential", jitter: "Enabled", retryBudgetPercent: 10 } },
        { id: "fraud", type: "application-server", x: 1360, y: 80, config: { size: "Medium" } },
        { id: "tax", type: "application-server", x: 1360, y: 220, config: { size: "Small" } },
        { id: "address", type: "application-server", x: 1360, y: 360, config: { size: "Small" } },
      ],
      edges: [
        { source: "web", target: "rl" },
        { source: "rl", target: "lb" },
        { source: "lb", target: "checkout" },
        { source: "checkout", target: "bh" },
        { source: "bh", target: "cb" },
        { source: "cb", target: "fraud" },
        { source: "bh", target: "retry" },
        { source: "retry", target: "tax" },
        { source: "bh", target: "address" },
      ],
    },
  },
  fix: {
    description: "Kingsbridge's checkout calls fraud scoring, tax and address validation directly, with no timeouts, retry limits, isolation or admission control. Three incidents last quarter cost 22% of checkouts on the worst days. Repair the dependency layer.",
    starting: {
      nodes: [
        { id: "fx-web", type: "web-client", x: 40, y: 220 },
        { id: "fx-lb", type: "load-balancer", x: 260, y: 220 },
        { id: "fx-checkout", type: "application-server", x: 500, y: 220, config: { size: "Large", instances: 2 } },
        ...column("fx-dep", "application-server", 3, 800, 220, { size: "Small" }, 140),
      ],
      edges: [{ source: "fx-web", target: "fx-lb" }, { source: "fx-lb", target: "fx-checkout" }, ...fanOut("fx-checkout", ["fx-dep-1", "fx-dep-2", "fx-dep-3"])],
    },
    metrics: { rps: 1500, appCpuPercent: 44, monthlyCostUsd: 1960, p95Ms: 8000, errorRatePercent: 22 },
  },
};

export const SERVICE_RESILIENCE: ProblemDef[] = [
  searchStarving,
  oneDatabase,
  sevenHops,
  loyaltyOutage,
  whereDidMyEditGo,
  forgetfulCart,
  balancesAndLikes,
  dayBehind,
  hangingRecs,
  retryStorm,
  onePartner,
  reliabilityChallenge,
];
