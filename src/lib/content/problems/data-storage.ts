import type { Check, ProblemDef } from "../types";
import { appTier, budget, column, connects, fanIn, fanOut, fmt, hasComponent, ids, pct, rule, textHas } from "../builders";
import type { Ctx } from "@/lib/sim/evaluate";
import * as E from "@/lib/sim/engine";

const RD = "/tracks/data-storage-foundations/sections/software-system-architecture-section-4";
const RP = "/tracks/data-storage-foundations/sections/software-system-architecture-section-5";
const SH = "/tracks/data-storage-foundations/sections/software-system-architecture-section-6";
const OS = "/tracks/data-storage-foundations/sections/software-system-architecture-section-7";

const primary = (c: Ctx) => E.primaryDbNode(c.g);
const appsLinkedTo = (c: Ctx, id: string | undefined) => !!id && c.topology().servers.length > 0 && c.topology().servers.every((s) => E.linked(c.g, s.id, id));
const lbApps = (prefix: string, n: number, size: string, x = 360, cy = 170) => column(prefix, "application-server", n, x, cy, { size }, 100);

/* ------------------------------------------------------------------ */
/* Section 4: Relational Databases                                      */
/* ------------------------------------------------------------------ */

const ohApps = lbApps("app", 2, "Large");
const orderHistory: ProblemDef = {
  code: "SSA0013",
  slug: "order-history-crawls",
  title: "Order History Crawls",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Kiln & Co.'s order history page now takes eight seconds. Every view runs `SELECT ... FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20` against a table with 90 million rows, and the database scans most of it each time. Traffic is 1,200 RPS. Build the tier so this query is served from an index, without paying for a bigger database.",
  guide: {
    title: "Required request path",
    description: "Build the application tier in front of PostgreSQL and give the database the index this query needs.",
    flow: ["load-balancer", "application-server", "postgresql"],
    notes: ["List indexed columns in the database's Indexed fields setting, comma separated.", "A composite index serves both the filter and the sort."],
  },
  concepts: ["Index-backed queries", "Full scans vs. lookups", "Composite indexes"],
  reading: [{ title: "Relational databases learning path", description: "Review how indexes turn scans into lookups.", href: `${RD}#indexes` }],
  components: ["load-balancer", "application-server", "postgresql"],
  sim: { sustainedRps: 1200, peakRps: 1200, cpuMaxPercent: 80, budgetMaxUsd: 1700 },
  checks: [
    ...appTier(1200, 80),
    connects("application-server", "postgresql", "Connect the application servers to PostgreSQL.", "validity"),
    rule("Index the filter column (customer_id) on PostgreSQL.", (c) => textHas(c.cfg("postgresql", "indexedFields"), "customer_id"), {
      category: "Query Performance",
      label: "Filter index",
      points: 20,
      pass: "Lookups by customer_id use an index instead of scanning 90M rows.",
      fail: "Without an index on customer_id every page view scans the table.",
      fix: "Add customer_id to the database's Indexed fields.",
    }),
    rule("Include the sort column (created_at) in the index so results come back already ordered.", (c) => textHas(c.cfg("postgresql", "indexedFields"), "created_at"), {
      category: "Query Performance",
      label: "Sort order",
      points: 10,
      pass: "The index also covers created_at, so the newest 20 rows are read directly.",
      fail: "Without created_at in the index the database still sorts every matching row.",
    }),
    rule("Keep PostgreSQL at the Small size; the fix is an index, not hardware.", (c) => c.is("postgresql", "size", "Small"), {
      category: "cost",
      label: "No vertical scaling",
      pass: "The database stays Small.",
      fail: "A bigger database hides the missing index and costs more every month.",
    }),
    budget(1700, "the design"),
  ],
  reference: {
    config: ["Two Large application servers (1,600 RPS, 75% CPU) behind a load balancer.", "PostgreSQL Small with Indexed fields: customer_id, created_at."],
    explanation: [
      "A lookup by customer_id touches a few hundred index entries instead of 90 million rows.",
      "Putting created_at second in the index means the 20 newest orders are read in order, with no sort step.",
      "Scaling the database up would make the scan faster, not unnecessary.",
    ],
    graph: {
      nodes: [{ id: "lb", type: "load-balancer", x: 60, y: 170, config: { healthChecks: "Enabled" } }, ...ohApps, { id: "db", type: "postgresql", x: 660, y: 170, config: { indexedFields: "customer_id, created_at" } }],
      edges: [...fanOut("lb", ids(ohApps)), ...fanIn(ids(ohApps), "db")],
    },
  },
  fix: {
    description:
      "Kiln & Co.'s order history page takes eight seconds and database CPU sits at 96%. The orders table has 90 million rows and no index on the columns the page filters and sorts by. Repair the design without resizing the database.",
    starting: {
      nodes: [{ id: "fx-lb", type: "load-balancer", x: 60, y: 170 }, ...lbApps("fx-app", 2, "Large"), { id: "fx-db", type: "postgresql", x: 660, y: 170, config: { indexedFields: "id" } }],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2"]), ...fanIn(["fx-app-1", "fx-app-2"], "fx-db")],
    },
    metrics: { rps: 1200, appCpuPercent: 38, dbCpuPercent: 96, monthlyCostUsd: 1510, p95Ms: 8100 },
  },
};

const connApps = lbApps("app", 4, "Medium", 360, 200);
const connectionAvalanche: ProblemDef = {
  code: "SSA0014",
  slug: "connection-avalanche",
  title: "Connection Avalanche",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Driftwood's API serves 3,600 RPS on 12 application instances, each opening 50 direct connections to PostgreSQL. The database allows 200 connections, so every deploy or scale-out ends with 'too many connections' errors even though queries are tiny. Keep the 12 instances and fix how they reach the database.",
  guide: {
    title: "Required request path",
    description: "Put a connection pool between the application tier and the database so connection count no longer grows with instance count.",
    flow: ["load-balancer", "application-server", "connection-pool", "postgresql"],
    notes: ["Transaction pooling lets many app connections share a few database connections.", "Keep at least 12 application instances in total."],
  },
  concepts: ["Connection limits", "Connection pooling", "Transaction vs. session pooling"],
  reading: [{ title: "Relational databases learning path", description: "Review connection limits and pooling.", href: `${RD}#connections` }],
  components: ["load-balancer", "application-server", "connection-pool", "postgresql"],
  sim: { sustainedRps: 3600, peakRps: 3600, cpuMaxPercent: 85 },
  checks: [
    ...appTier(3600, 85),
    rule("Run at least 12 application instances in total.", (c) => c.nodes("application-server").reduce((s, n) => s + E.instancesOf(n), 0) >= 12, {
      category: "capacity",
      label: "Instance count",
      pass: "The fleet keeps its 12 instances.",
      fail: "The fix must keep at least 12 instances; removing servers only hides the problem.",
    }),
    rule("Route every application server through a connection pool to PostgreSQL.", (c) => {
      const pool = c.first("connection-pool");
      const db = primary(c);
      return !!pool && !!db && E.linked(c.g, pool.id, db.id) && appsLinkedTo(c, pool.id);
    }, { category: "Connections", label: "Pooled path", points: 15, fail: "Some servers still connect straight to the database." }),
    rule("Keep total database connections at or below the 200-connection limit.", (c) => !c.connections().exhausted, {
      category: "Connections",
      label: "Connection budget",
      points: 20,
      pass: (c) => `The database sees ${fmt(c.connections().totalConnections)} of ${fmt(c.connections().maxConnections)} allowed connections.`,
      fail: (c) => `The database would see ${fmt(c.connections().totalConnections)} connections against a limit of ${fmt(c.connections().maxConnections)}.`,
      fix: "Size the pool's connections to the database below the limit (leave room for admin tools).",
    }),
    rule("Use transaction pooling so idle app connections don't hold database connections.", (c) => c.is("connection-pool", "mode", "Transaction"), { category: "Connections", label: "Pool mode" }),
  ],
  reference: {
    config: [
      "Four Medium application server nodes with 3 instances each: 12 instances, 5,160 RPS of capacity, 70% CPU at 3,600 RPS.",
      "A connection pool in Transaction mode holding 150 connections to PostgreSQL (limit 200).",
    ],
    explanation: [
      "Without a pool, connections = instances x per-instance connections = 600, three times the limit.",
      "A transaction pool hands a database connection to an app request only for the duration of a transaction, so 150 real connections can serve thousands of app-side ones.",
      "Raising max_connections instead would cost memory on the database for every idle connection.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 200, config: { healthChecks: "Enabled" } },
        ...connApps.map((n) => ({ ...n, config: { ...n.config, instances: 3, dbConnectionsPerInstance: 50 } })),
        { id: "pool", type: "connection-pool", x: 660, y: 200, config: { maxServerConnections: 150, mode: "Transaction" } },
        { id: "db", type: "postgresql", x: 960, y: 200, config: { maxConnections: 200 } },
      ],
      edges: [...fanOut("lb", ids(connApps)), ...fanIn(ids(connApps), "pool"), { source: "pool", target: "db" }],
    },
  },
  fix: {
    description:
      "Driftwood's 12 application instances each open 50 direct connections to a PostgreSQL database capped at 200. Every deploy triggers 'too many connections' errors. Repair the data path while keeping all 12 instances.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 200 },
        ...lbApps("fx-app", 4, "Medium", 360, 200).map((n) => ({ ...n, config: { ...n.config, instances: 3, dbConnectionsPerInstance: 50 } })),
        { id: "fx-db", type: "postgresql", x: 760, y: 200, locked: true, config: { maxConnections: 200 } },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3", "fx-app-4"]), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3", "fx-app-4"], "fx-db")],
    },
    metrics: { rps: 3600, appCpuPercent: 70, dbConnections: 600, monthlyCostUsd: 4050, errorRatePercent: 14 },
  },
};

const reportingReplica = (c: Ctx) => {
  const p = primary(c);
  return E.replicasOf(c.g, p)[0];
};
const caApps = lbApps("app", 2, "Large", 360, 120);
const checkoutVsAnalytics: ProblemDef = {
  code: "SSA0015",
  slug: "checkout-vs-analytics",
  title: "Checkout vs. Analytics",
  difficulty: "Hard",
  minutes: 22,
  description:
    "At Larkspur, finance runs long revenue reports against the same PostgreSQL primary that handles checkout. When a report runs, checkout latency triples. Reports may be a few seconds behind, but checkout must always read and write the primary. Separate the two workloads.",
  guide: {
    title: "Checkout path",
    description: "Keep checkout on the primary and give reporting its own read replica and its own compute.",
    flow: ["load-balancer", "application-server", "postgresql"],
    secondary: { title: "Reporting path", flow: ["job-scheduler", "worker", "postgresql"] },
    notes: ["Set the second PostgreSQL node's role to Replica and point it at the primary.", "Reporting workers should only read from the replica."],
  },
  concepts: ["Read replicas for analytics", "Workload isolation at the data layer"],
  reading: [{ title: "Relational databases learning path", description: "Review transactional vs. analytical workloads.", href: `${RD}#isolation` }],
  components: ["load-balancer", "application-server", "postgresql", "job-scheduler", "worker"],
  checks: [
    rule("Serve checkout traffic through a load balancer and application servers.", (c) => c.topology().entry?.type === "load-balancer" && c.topology().servers.length > 0, { label: "Checkout path" }),
    rule("Connect every checkout server to the PostgreSQL primary.", (c) => appsLinkedTo(c, primary(c)?.id), { category: "validity", label: "Primary for checkout" }),
    rule("Add a read replica that replicates from the primary.", (c) => !!reportingReplica(c), {
      category: "reliability",
      label: "Read replica",
      points: 15,
      fail: "There is no PostgreSQL node with role Replica attached to the primary.",
      fix: "Add a second PostgreSQL node, set Role to Replica and Replicates from to the primary.",
    }),
    rule("Run reports on dedicated workers triggered by a scheduler, reading only from the replica.", (c) => {
      const rep = reportingReplica(c);
      const p = primary(c);
      const workers = c.nodes("worker");
      return !!rep && workers.length > 0 && workers.every((w) => E.linked(c.g, w.id, rep.id) && !(p && E.linked(c.g, w.id, p.id))) && c.edge("job-scheduler", "worker");
    }, {
      category: "Workload Isolation",
      label: "Reporting isolation",
      points: 20,
      fail: "Reporting still reaches the primary (or has no scheduled workers).",
      fix: "Connect Job Scheduler -> Worker -> replica, and make sure workers never connect to the primary.",
    }),
    rule("Keep checkout servers off the replica so purchases never read stale data.", (c) => {
      const rep = reportingReplica(c);
      return !!rep && !c.topology().servers.some((s) => E.linked(c.g, s.id, rep.id));
    }, { category: "quality", label: "Consistent checkout" }),
  ],
  reference: {
    config: [
      "Load balancer -> two Large checkout servers -> PostgreSQL primary.",
      "PostgreSQL replica (role Replica, async) fed from the primary.",
      "Job Scheduler -> reporting Worker -> replica.",
    ],
    explanation: [
      "Long analytical scans compete with checkout for CPU, memory and buffer cache. Moving them to a replica removes the contention entirely.",
      "Asynchronous replication means reports can lag by seconds, which finance accepted; checkout never touches the replica.",
      "A dedicated worker pool also keeps report rendering off the checkout servers.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 120, config: { healthChecks: "Enabled" } },
        ...caApps,
        { id: "db", type: "postgresql", x: 660, y: 120, config: { role: "Primary", size: "Medium" } },
        { id: "rep", type: "postgresql", x: 660, y: 380, config: { role: "Replica", replicatesFrom: "ref-db", size: "Medium" } },
        { id: "sched", type: "job-scheduler", x: 60, y: 380 },
        { id: "wk", type: "worker", x: 360, y: 380 },
      ],
      edges: [...fanOut("lb", ids(caApps)), ...fanIn(ids(caApps), "db"), { source: "db", target: "rep" }, { source: "sched", target: "wk" }, { source: "wk", target: "rep" }],
    },
  },
  fix: {
    description:
      "Larkspur's revenue reports run on a worker that queries the same PostgreSQL primary as checkout. While reports run, checkout p95 jumps from 180 ms to 640 ms. Repair the data layer so reports never compete with purchases.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 120 },
        ...lbApps("fx-app", 2, "Large", 360, 120),
        { id: "fx-db", type: "postgresql", x: 660, y: 120, config: { role: "Primary", size: "Medium" } },
        { id: "fx-sched", type: "job-scheduler", x: 60, y: 380 },
        { id: "fx-wk", type: "worker", x: 360, y: 380 },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2"]), ...fanIn(["fx-app-1", "fx-app-2"], "fx-db"), { source: "fx-sched", target: "fx-wk" }, { source: "fx-wk", target: "fx-db" }],
    },
    metrics: { rps: 900, appCpuPercent: 44, dbCpuPercent: 93, monthlyCostUsd: 1720, p95Ms: 640 },
  },
};

const schemaHas = (c: Ctx, ...needles: string[]) => textHas(c.cfg("postgresql", "schemaTables"), ...needles);
const SCHEMA_REF =
  "customers(id); products(id, sku UNIQUE); orders(id, customer_id FK -> customers); order_items(id, order_id FK -> orders, product_id FK -> products, quantity); payments(id, order_id FK -> orders, amount NOT NULL)";
const relationalModel: ProblemDef = {
  code: "SSA0016",
  slug: "model-the-marketplace",
  title: "Model the Marketplace",
  difficulty: "Medium",
  minutes: 20,
  description:
    "Fennel Market is replacing a spreadsheet with PostgreSQL. A customer places orders; each order has several line items, each pointing at a product; each order has one or more payments. Describe the schema in the database's Schema field so relationships are enforced by foreign keys rather than by application code.",
  guide: {
    title: "Required request path",
    description: "Wire the application to PostgreSQL and describe the tables and their foreign keys in the Schema field.",
    flow: ["application-server", "postgresql"],
    notes: ["Format: table(column, column FK -> other_table).", "Line items need both the order and the product."],
  },
  concepts: ["Relational modeling", "Foreign keys and integrity", "One-to-many relationships"],
  reading: [{ title: "Relational databases learning path", description: "Review entities, relationships and constraints.", href: `${RD}#modeling` }],
  components: ["application-server", "postgresql"],
  checks: [
    connects("application-server", "postgresql", "Connect the application server to PostgreSQL.", "validity"),
    rule("Define customers, products, orders, an order-items table and payments.", (c) => schemaHas(c, "customers") && schemaHas(c, "products") && schemaHas(c, "orders") && (schemaHas(c, "order_items") || schemaHas(c, "line_items")) && schemaHas(c, "payments"), {
      category: "Data Model",
      label: "Entities",
      points: 15,
      fail: "One or more required tables is missing from the schema description.",
    }),
    rule("Link orders to customers with a customer_id foreign key.", (c) => schemaHas(c, "customer_id") && schemaHas(c, "fk"), { category: "Data Model", label: "Order ownership", points: 15 }),
    rule("Give each line item an order_id and a product_id foreign key.", (c) => schemaHas(c, "order_id") && schemaHas(c, "product_id"), { category: "Data Model", label: "Line items", points: 15 }),
    rule("Attach payments to orders with an order_id foreign key.", (c) => /payments\([^)]*order_id/i.test(c.cfg("postgresql", "schemaTables").replace(/\s+/g, "")), { category: "Data Model", label: "Payments", points: 10 }),
    rule("Mark a natural uniqueness rule, such as a unique product SKU.", (c) => schemaHas(c, "unique"), { category: "quality", label: "Constraints", soft: true }),
  ],
  reference: {
    config: [`Schema: ${SCHEMA_REF}`],
    explanation: [
      "Each one-to-many relationship becomes a foreign key on the 'many' side: orders carry customer_id, line items carry order_id.",
      "Line items resolve the many-to-many relationship between orders and products.",
      "Foreign keys let the database reject orphaned rows that application bugs would otherwise create.",
    ],
    graph: {
      nodes: [
        { id: "app", type: "application-server", x: 80, y: 160 },
        { id: "db", type: "postgresql", x: 420, y: 160, config: { schemaTables: SCHEMA_REF } },
      ],
      edges: [{ source: "app", target: "db" }],
    },
  },
  fix: {
    description:
      "Fennel Market stores every order as one wide row with product names copied into text columns and no foreign keys. Orders reference customers that no longer exist and totals drift from line items. Repair the schema in the database's Schema field.",
    starting: {
      nodes: [
        { id: "fx-app", type: "application-server", x: 80, y: 160 },
        { id: "fx-db", type: "postgresql", x: 420, y: 160, config: { schemaTables: "orders(id, customer_name, product_names, total)" } },
      ],
      edges: [{ source: "fx-app", target: "fx-db" }],
    },
    metrics: { rps: 300, appCpuPercent: 31, monthlyCostUsd: 420, errorRatePercent: 3 },
  },
};

/* ------------------------------------------------------------------ */
/* Section 5: Database Scaling & Replication                            */
/* ------------------------------------------------------------------ */

const catalogDb = { readsPerSec: 60000, writesPerSec: 4000, maxUtilizationPercent: 75 };
const rhApps = lbApps("app", 3, "Large", 360, 170);
const readHeavy: ProblemDef = {
  code: "SSA0017",
  slug: "read-heavy-catalog",
  title: "Read-Heavy Catalog",
  difficulty: "Medium",
  minutes: 20,
  description:
    "Brambleton's product catalog serves 60,000 database reads per second and 4,000 writes per second. Even the XL database would run at 80%, over the 75% ceiling. Scale reads horizontally with replicas while keeping every write on one primary, within $1,500 a month for the database tier.",
  guide: {
    title: "Required request path",
    description: "Send writes to a primary and spread reads across replicas the application servers connect to.",
    flow: ["load-balancer", "application-server", "postgresql"],
    notes: ["Replicas must be connected from the application servers to take reads.", "Writes always go to the primary."],
  },
  concepts: ["Read replicas", "Read/write splitting", "Vertical limits"],
  reading: [{ title: "Replication learning path", description: "Review read scaling with replicas.", href: `${RP}#replicas` }],
  components: ["load-balancer", "application-server", "postgresql"],
  sim: { budgetMaxUsd: 1500, budgetTypes: ["postgresql", "mysql"], db: catalogDb },
  checks: [
    rule("Put the catalog behind a load balancer and application servers.", (c) => c.topology().entry?.type === "load-balancer" && c.topology().servers.length > 0, { label: "Request path" }),
    rule("Connect every application server to the primary for writes.", (c) => appsLinkedTo(c, primary(c)?.id), { category: "validity", label: "Write path" }),
    rule("Keep the primary at or below 75% under reads plus all writes.", (c) => c.db().primaryUtilizationPercent <= 75, {
      category: "capacity",
      label: "Primary load",
      points: 20,
      pass: (c) => `The primary runs at ${pct(c.db().primaryUtilizationPercent)}.`,
      fail: (c) => `The primary would run at ${pct(c.db().primaryUtilizationPercent)}.`,
      fix: "Add replicas connected from the application tier until the primary's read share drops.",
    }),
    rule("Keep every read replica at or below 75%.", (c) => c.db().readReplicas.length > 0 && (c.db().replicaUtilizationPercent ?? 0) <= 75, {
      category: "capacity",
      label: "Replica load",
      points: 15,
      pass: (c) => `${c.db().readReplicas.length} replicas each run at ${pct(c.db().replicaUtilizationPercent ?? 0)}.`,
      fail: "No replica takes reads yet (or replicas are overloaded).",
    }),
    budget(1500, "the database tier", 15, ["postgresql", "mysql"]),
  ],
  reference: {
    config: ["PostgreSQL Large primary plus two Large replicas, each connected from all three application servers.", "Reads split three ways: 20,000/s each. Primary: 44% reads + 25% writes = 69%."],
    explanation: [
      "Replicas add read capacity linearly but do nothing for writes, which is fine here: writes are only 4,000/s.",
      "One replica is not enough: the primary would still carry 30,000 reads/s plus writes (92%).",
      "Total database cost: 3 x $480 = $1,440/month.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 170, config: { healthChecks: "Enabled" } },
        ...rhApps,
        { id: "db", type: "postgresql", x: 680, y: 50, config: { size: "Large", role: "Primary" } },
        { id: "rep-1", type: "postgresql", x: 680, y: 190, config: { size: "Large", role: "Replica", replicatesFrom: "ref-db" } },
        { id: "rep-2", type: "postgresql", x: 680, y: 330, config: { size: "Large", role: "Replica", replicatesFrom: "ref-db" } },
      ],
      edges: [...fanOut("lb", ids(rhApps)), ...fanIn(ids(rhApps), "db"), ...fanIn(ids(rhApps), "rep-1"), ...fanIn(ids(rhApps), "rep-2"), { source: "db", target: "rep-1" }, { source: "db", target: "rep-2" }],
    },
  },
  fix: {
    description:
      "Brambleton runs its catalog on one XL PostgreSQL database at 80% load, and latency spikes whenever traffic rises. Reads outnumber writes 15 to 1. Repair the data tier so no database node exceeds 75%, for $1,500 a month or less.",
    starting: {
      nodes: [{ id: "fx-lb", type: "load-balancer", x: 60, y: 170 }, ...lbApps("fx-app", 3, "Large", 360, 170), { id: "fx-db", type: "postgresql", x: 680, y: 170, config: { size: "XL" } }],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3"]), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3"], "fx-db")],
    },
    metrics: { rps: 64000, trafficUnit: "queries/s", dbCpuPercent: 80, monthlyCostUsd: 960, p95Ms: 420 },
  },
};

const sraApps = lbApps("app", 2, "Large", 360, 170);
const staleRead: ProblemDef = {
  code: "SSA0018",
  slug: "my-edit-disappeared",
  title: "My Edit Disappeared",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Wren Notes reads from replicas to keep its primary calm. Replication lag is usually under a second, but users who save a note and reload immediately sometimes see the old version and file bug reports. Fix the experience for the person who just wrote, without sending everyone's reads back to the primary.",
  guide: {
    title: "Required request path",
    description: "Keep replicas for reads, and route a user's own reads to the primary for a short window after they write.",
    flow: ["load-balancer", "application-server", "postgresql"],
    notes: ["Replication should stay asynchronous; synchronous replication would slow every write."],
  },
  concepts: ["Replication lag", "Read-after-write consistency"],
  reading: [{ title: "Replication learning path", description: "Review consistency guarantees with replicas.", href: `${RP}#lag` }],
  components: ["load-balancer", "application-server", "postgresql"],
  checks: [
    rule("Keep a primary and at least one replica serving reads.", (c) => !!primary(c) && c.db({ readsPerSec: 1, writesPerSec: 1, maxUtilizationPercent: 100 }).readReplicas.length > 0, {
      category: "capacity",
      label: "Read scaling",
      fail: "Reads no longer go to a replica, so the primary carries everything.",
    }),
    rule("Connect application servers to the primary for writes.", (c) => appsLinkedTo(c, primary(c)?.id), { category: "validity", label: "Write path" }),
    rule("Enable read-after-write consistency on the load balancer.", (c) => c.is("load-balancer", "readAfterWriteConsistency", "Enabled"), {
      category: "Consistency",
      label: "Read your writes",
      points: 20,
      pass: "A user's reads go to the primary for a short window after they write.",
      fail: "Users can read a lagging replica right after saving.",
    }),
    rule("Keep replication asynchronous so writes stay fast.", (c) => E.replicasOf(c.g, primary(c)).length > 0 && E.replicasOf(c.g, primary(c)).every((r) => E.str(r.config.replicationMode, "Async") === "Async"), {
      category: "quality",
      label: "Write latency",
    }),
  ],
  reference: {
    config: ["Load balancer with read-after-write consistency enabled.", "PostgreSQL primary plus one async replica, both reachable from the application servers."],
    explanation: [
      "The bug only affects the writer, so the fix should only affect the writer: pin that user's reads to the primary for a few seconds.",
      "Everyone else keeps reading replicas, so the primary's load barely changes.",
      "Making replication synchronous would also hide the lag, but every save would wait for the replica.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 170, config: { readAfterWriteConsistency: "Enabled", healthChecks: "Enabled" } },
        ...sraApps,
        { id: "db", type: "postgresql", x: 680, y: 90, config: { role: "Primary" } },
        { id: "rep", type: "postgresql", x: 680, y: 260, config: { role: "Replica", replicatesFrom: "ref-db" } },
      ],
      edges: [...fanOut("lb", ids(sraApps)), ...fanIn(ids(sraApps), "db"), ...fanIn(ids(sraApps), "rep"), { source: "db", target: "rep" }],
    },
  },
  fix: {
    description: "Wren Notes users keep reporting that a saved note 'reverts' when they refresh. Reads go to an async replica that lags by up to a second. Repair the design without moving every read to the primary.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 170 },
        ...lbApps("fx-app", 2, "Large", 360, 170),
        { id: "fx-db", type: "postgresql", x: 680, y: 90, config: { role: "Primary" } },
        { id: "fx-rep", type: "postgresql", x: 680, y: 260, config: { role: "Replica", replicatesFrom: "fx-db" } },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2"]), ...fanIn(["fx-app-1", "fx-app-2"], "fx-db"), ...fanIn(["fx-app-1", "fx-app-2"], "fx-rep"), { source: "fx-db", target: "fx-rep" }],
    },
    metrics: { rps: 1100, appCpuPercent: 69, monthlyCostUsd: 1600, errorRatePercent: 2 },
  },
};

const IMPORT_ROWS = 20_000_000;
const IMPORT_WINDOW_MIN = 90;
const NORMAL_WRITES = 1500;
const ROWS_PER_WORKER = 1000;
const importRate = (c: Ctx) => {
  const q = c.first("message-queue");
  if (!q) return Infinity;
  return E.outgoing(c.g, q.id).filter((n) => n.type === "worker").reduce((s, w) => s + E.instancesOf(w) * ROWS_PER_WORKER, 0);
};
const importLag: ProblemDef = {
  code: "SSA0019",
  slug: "lag-during-the-nightly-import",
  title: "Lag During the Nightly Import",
  difficulty: "Hard",
  minutes: 22,
  description:
    "Every night Sable Logistics imports 20 million shipment rows. The import blasts writes as fast as it can, replicas fall minutes behind, and customer tracking pages show stale data. Throttle the import through a queue and workers (each worker writes 1,000 rows/s) so replicas, which apply at most 80% of their 7,000 writes/s, never fall behind. The import must still finish within 90 minutes.",
  guide: {
    title: "Import path",
    description: "Feed rows through a queue to a fixed-size worker pool that writes to the primary at a controlled rate.",
    flow: ["message-queue", "worker", "postgresql"],
    notes: ["Normal traffic already writes 1,500 rows/s.", "Medium replicas apply up to 5,600 writes/s at 80%."],
  },
  concepts: ["Write throttling", "Replica apply rate", "Backpressure"],
  reading: [{ title: "Replication learning path", description: "Review replication lag under write bursts.", href: `${RP}#lag` }],
  components: ["message-queue", "worker", "postgresql", "application-server"],
  checks: [
    rule("Load the import into a message queue consumed by workers that write to the primary.", (c) => c.path("message-queue", "worker", "postgresql"), { label: "Import path", points: 10 }),
    rule("Keep a PostgreSQL replica for customer reads.", (c) => E.replicasOf(c.g, primary(c)).length > 0, { category: "reliability", label: "Read replica" }),
    rule("Keep import plus normal writes at or below 5,600 writes/s so replicas never lag.", (c) => importRate(c) + NORMAL_WRITES <= 5600, {
      category: "Replication",
      label: "Apply headroom",
      points: 20,
      pass: (c) => `Replicas apply ${fmt(importRate(c) + NORMAL_WRITES)} writes/s, within their 5,600/s budget.`,
      fail: (c) => (Number.isFinite(importRate(c)) ? `Writes reach ${fmt(importRate(c) + NORMAL_WRITES)}/s and replicas fall behind.` : "The import is not throttled by a queue and workers."),
    }),
    rule("Finish 20 million rows within 90 minutes.", (c) => Number.isFinite(importRate(c)) && importRate(c) > 0 && IMPORT_ROWS / importRate(c) / 60 <= IMPORT_WINDOW_MIN, {
      category: "capacity",
      label: "Import window",
      points: 20,
      pass: (c) => `The import finishes in ${fmt(IMPORT_ROWS / importRate(c) / 60)} minutes.`,
      fail: (c) => (importRate(c) > 0 && Number.isFinite(importRate(c)) ? `The import would take ${fmt(IMPORT_ROWS / importRate(c) / 60)} minutes.` : "No workers drain the import queue."),
      fix: "20M rows in 90 minutes needs at least 3,704 rows/s: four workers.",
    }),
  ],
  reference: {
    config: ["Message Queue -> one Worker node with 4 instances (4,000 rows/s) -> PostgreSQL primary.", "Primary -> Medium replica. Total writes 5,500/s, under the 5,600/s replica budget."],
    explanation: [
      "Replicas replay writes at a finite rate. Any burst above that rate becomes lag that customers see.",
      "Four workers finish in 83 minutes; five would finish faster but push replicas past their apply budget.",
      "The queue absorbs the whole file instantly and lets workers drain it at a safe, constant pace.",
    ],
    graph: {
      nodes: [
        { id: "q", type: "message-queue", x: 60, y: 120 },
        { id: "wk", type: "worker", x: 360, y: 120, config: { instances: 4 } },
        { id: "db", type: "postgresql", x: 660, y: 120, config: { role: "Primary", size: "Medium" } },
        { id: "rep", type: "postgresql", x: 660, y: 300, config: { role: "Replica", replicatesFrom: "ref-db", size: "Medium" } },
      ],
      edges: [
        { source: "q", target: "wk" },
        { source: "wk", target: "db" },
        { source: "db", target: "rep" },
      ],
    },
  },
  fix: {
    description:
      "Sable Logistics' nightly import runs eight unthrottled loader instances straight into PostgreSQL. Replicas lag by up to 14 minutes and tracking pages show yesterday's status. Repair the import so replicas keep up and the 20 million rows still land within 90 minutes.",
    starting: {
      nodes: [
        { id: "fx-q", type: "message-queue", x: 60, y: 120 },
        { id: "fx-wk", type: "worker", x: 360, y: 120, config: { instances: 8 } },
        { id: "fx-db", type: "postgresql", x: 660, y: 120, locked: true, config: { role: "Primary", size: "Medium" } },
        { id: "fx-rep", type: "postgresql", x: 660, y: 300, locked: true, config: { role: "Replica", replicatesFrom: "fx-db", size: "Medium" } },
      ],
      edges: [
        { source: "fx-q", target: "fx-wk" },
        { source: "fx-wk", target: "fx-db" },
        { source: "fx-db", target: "fx-rep" },
      ],
    },
    metrics: { rps: 9500, trafficUnit: "writes/s", dbCpuPercent: 91, monthlyCostUsd: 970, p95Ms: 2300 },
  },
};

const fpApps = lbApps("app", 2, "Large", 360, 160);
const failPrimary: ProblemDef = {
  code: "SSA0020",
  slug: "fail-the-primary",
  title: "Fail the Primary",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Quarry Pay's ledger database is a single PostgreSQL primary. A disk failure would mean hours of downtime and possibly lost payments. Design the data tier so the primary can fail with no committed transaction lost and service back within a minute, plus backups for recovering from bad deploys.",
  guide: {
    title: "Required request path",
    description: "Pair the primary with a synchronous standby that can take over automatically, and keep point-in-time backups.",
    flow: ["load-balancer", "application-server", "postgresql"],
    notes: ["Synchronous replication confirms a commit only after the standby has it.", "Backups protect against mistakes that replication would faithfully copy."],
  },
  concepts: ["Synchronous replication", "Automatic failover", "RPO and RTO"],
  reading: [{ title: "Replication learning path", description: "Review failover and recovery objectives.", href: `${RP}#failover` }],
  components: ["load-balancer", "application-server", "postgresql", "backup", "multi-az"],
  checks: [
    rule("Serve traffic through a load balancer and application servers connected to the primary.", (c) => c.topology().entry?.type === "load-balancer" && appsLinkedTo(c, primary(c)?.id), { label: "Request path" }),
    rule("Add a standby replica that replicates synchronously (zero data loss).", (c) => E.replicasOf(c.g, primary(c)).some((r) => E.str(r.config.replicationMode) === "Sync"), {
      category: "reliability",
      label: "RPO = 0",
      points: 20,
      fail: "Without a synchronous standby, committed payments can be lost when the primary dies.",
    }),
    rule("Enable automatic failover so the standby is promoted within seconds.", (c) => c.nodes("postgresql", "mysql").some((n) => E.str(n.config.autoFailover) === "Enabled"), {
      category: "reliability",
      label: "Fast recovery",
      points: 20,
      fail: "Promotion would wait for a human, so recovery takes far longer than a minute.",
    }),
    rule("Attach backups with point-in-time recovery to the primary.", (c) => c.nodes("backup").some((b) => E.str(b.config.pointInTimeRecovery) === "Enabled" && E.linkedEitherWay(c.g, b.id, primary(c)?.id ?? "")), {
      category: "reliability",
      label: "Point-in-time recovery",
      points: 10,
    }),
  ],
  reference: {
    config: [
      "PostgreSQL primary with auto failover enabled, plus a synchronous standby replica.",
      "Backup with point-in-time recovery attached to the primary.",
    ],
    explanation: [
      "Synchronous replication gives an RPO of zero: a commit returns only once two machines have it.",
      "Automatic failover gives an RTO of seconds instead of a pager-and-runbook recovery.",
      "Replication copies mistakes instantly; backups with point-in-time recovery are the only way back from a bad migration.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 160, config: { healthChecks: "Enabled" } },
        ...fpApps,
        { id: "db", type: "postgresql", x: 660, y: 80, config: { role: "Primary", autoFailover: "Enabled", size: "Medium" } },
        { id: "rep", type: "postgresql", x: 660, y: 260, config: { role: "Replica", replicatesFrom: "ref-db", replicationMode: "Sync", size: "Medium" } },
        { id: "bk", type: "backup", x: 960, y: 80, config: { pointInTimeRecovery: "Enabled", retentionDays: 14 } },
      ],
      edges: [...fanOut("lb", ids(fpApps)), ...fanIn(ids(fpApps), "db"), { source: "db", target: "rep" }, { source: "db", target: "bk" }],
    },
  },
  fix: {
    description:
      "Quarry Pay runs payments on a PostgreSQL primary with one asynchronous replica and nightly snapshots. A failover drill lost 40 seconds of transactions and took 25 minutes of manual work. Repair the data tier for zero data loss and automatic recovery.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 160 },
        ...lbApps("fx-app", 2, "Large", 360, 160),
        { id: "fx-db", type: "postgresql", x: 660, y: 80, config: { role: "Primary", size: "Medium" } },
        { id: "fx-rep", type: "postgresql", x: 660, y: 260, config: { role: "Replica", replicatesFrom: "fx-db", size: "Medium" } },
        { id: "fx-bk", type: "backup", x: 960, y: 80 },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2"]), ...fanIn(["fx-app-1", "fx-app-2"], "fx-db"), { source: "fx-db", target: "fx-rep" }, { source: "fx-db", target: "fx-bk" }],
    },
    metrics: { rps: 800, appCpuPercent: 50, monthlyCostUsd: 1725, errorRatePercent: 0 },
  },
};

/* ------------------------------------------------------------------ */
/* Section 6: Partitioning & Sharding                                   */
/* ------------------------------------------------------------------ */

const shardBase = { goodKeys: ["account_id", "user_id", "device_id", "order_id", "event_id", "customer_id", "tenant_id,order_id", "(tenant_id,order_id)"] };
const shardChecks = (writes: number, maxUtil: number, extra: Check[] = []): Check[] => [
  rule("Enable partitioning on the database.", (c) => c.is("postgresql", "partitioning", "Enabled") || c.has("cassandra") || c.has("dynamodb"), { label: "Partitioning", category: "quality" }),
  rule(`Keep the hottest shard at or below ${maxUtil}% of its write capacity at ${fmt(writes)} writes/s.`, (c) => c.shards().hottestShardUtilizationPercent <= maxUtil, {
    category: "capacity",
    label: "Hottest shard",
    points: 25,
    pass: (c) => `The hottest of ${c.shards().shards} shards runs at ${pct(c.shards().hottestShardUtilizationPercent)}.`,
    fail: (c) => `The hottest shard would run at ${pct(c.shards().hottestShardUtilizationPercent)} (it receives ${Math.round(c.shards().hotShareFraction * 100)}% of writes).`,
    fix: "Use enough shards and a partition key that spreads writes evenly.",
  }),
  ...extra,
];
const swApps = lbApps("app", 3, "XL", 360, 170);
const writeWall: ProblemDef = {
  code: "SSA0021",
  slug: "the-write-wall",
  title: "The Write Wall",
  difficulty: "Medium",
  minutes: 20,
  description:
    "Tallyho's fitness tracker ingests 40,000 activity writes per second, more than even an XL database's 30,000/s. Replicas won't help because they don't add write capacity. Partition the activity table across shards so no shard runs above 75%, choosing a key that keeps each user's data together.",
  guide: {
    title: "Required request path",
    description: "Keep one logical database, enable partitioning, and pick a shard count and partition key.",
    flow: ["load-balancer", "application-server", "postgresql"],
    notes: ["Each shard has the write capacity of its size.", "Hash partitioning on a high-cardinality key spreads load evenly."],
  },
  concepts: ["Write scaling with shards", "Choosing a partition key"],
  reading: [{ title: "Sharding learning path", description: "Review horizontal partitioning and key choice.", href: `${SH}#partitioning` }],
  components: ["load-balancer", "application-server", "postgresql"],
  sim: { budgetMaxUsd: 2200, budgetTypes: ["postgresql"], shards: { ...shardBase, writesPerSec: 40000, maxShardUtilizationPercent: 75, monotonicKeys: ["created_at", "timestamp"] } },
  checks: shardChecks(40000, 75, [budget(2200, "the database", 15, ["postgresql"])]),
  reference: {
    config: ["PostgreSQL Large with partitioning enabled, Hash strategy, partition key user_id, 4 shards.", "Each shard takes about 11,000 writes/s against 16,000 of capacity (69%). Cost: 4 x $480 = $1,920."],
    explanation: [
      "Replication copies every write to every replica, so it can never raise write throughput. Partitioning splits writes so each shard sees a fraction.",
      "user_id has millions of distinct values and keeps each user's activity on one shard, so a user's history is a single-shard query.",
      "Three Large shards would run at 92%; two XL shards at 73% would also pass but cost the same with less headroom per shard.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 170, config: { healthChecks: "Enabled" } },
        ...swApps,
        { id: "db", type: "postgresql", x: 660, y: 170, config: { size: "Large", partitioning: "Enabled", partitionStrategy: "Hash", partitionKey: "user_id", shardCount: 4 } },
      ],
      edges: [...fanOut("lb", ids(swApps)), ...fanIn(ids(swApps), "db")],
    },
  },
  fix: {
    description: "Tallyho writes 40,000 activities per second into a single XL PostgreSQL database rated for 30,000. Writes queue up and the ingest API times out. Repair the data tier so no shard exceeds 75%.",
    starting: {
      nodes: [{ id: "fx-lb", type: "load-balancer", x: 60, y: 170 }, ...lbApps("fx-app", 3, "XL", 360, 170), { id: "fx-db", type: "postgresql", x: 660, y: 170, config: { size: "XL" } }],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3"]), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3"], "fx-db")],
    },
    metrics: { rps: 40000, trafficUnit: "writes/s", dbCpuPercent: 100, monthlyCostUsd: 4500, errorRatePercent: 18 },
  },
};

const hotTenantApps = lbApps("app", 3, "Large", 360, 170);
const meltingShard: ProblemDef = {
  code: "SSA0022",
  slug: "one-shard-is-melting",
  title: "One Shard Is Melting",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Ledgerline's invoicing database is sharded 8 ways by tenant_id. One enterprise tenant produces 45% of all writes, so its shard runs at 140% while the other seven idle. Total traffic is 30,000 writes/s on Large shards. Re-key the data so writes spread evenly, still keeping a single invoice's rows together.",
  guide: {
    title: "Required request path",
    description: "Keep partitioning but choose a key that splits a large tenant across shards.",
    flow: ["application-server", "postgresql"],
    notes: ["A compound key such as (tenant_id, order_id) keeps one invoice together but spreads one tenant across shards."],
  },
  concepts: ["Hot partitions", "Compound partition keys"],
  reading: [{ title: "Sharding learning path", description: "Review skew and hot partitions.", href: `${SH}#skew` }],
  components: ["load-balancer", "application-server", "postgresql"],
  sim: { shards: { ...shardBase, writesPerSec: 30000, maxShardUtilizationPercent: 75, hotKeys: { tenant_id: 0.45, region: 0.6, country: 0.5 } } },
  checks: shardChecks(30000, 75),
  reference: {
    config: ["PostgreSQL Large, partitioning enabled, Hash on (tenant_id, order_id), 8 shards: about 4,100 writes/s per shard (26%)."],
    explanation: [
      "Partitioning by tenant puts all of one tenant's writes on one shard. When tenants are wildly unequal, so are shards.",
      "Adding the order id to the key spreads a big tenant across all shards while each invoice still lives on exactly one.",
      "More shards alone would not help: the hot tenant would still land on a single shard.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 170, config: { healthChecks: "Enabled" } },
        ...hotTenantApps,
        { id: "db", type: "postgresql", x: 660, y: 170, config: { size: "Large", partitioning: "Enabled", partitionStrategy: "Hash", partitionKey: "tenant_id,order_id", shardCount: 8 } },
      ],
      edges: [...fanOut("lb", ids(hotTenantApps)), ...fanIn(ids(hotTenantApps), "db")],
    },
  },
  fix: {
    description: "Ledgerline shards invoices 8 ways by tenant_id. One tenant writes 45% of the traffic and its shard is at 140% with timeouts, while the rest sit near 20%. Repair the partitioning.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 170 },
        ...lbApps("fx-app", 3, "Large", 360, 170),
        { id: "fx-db", type: "postgresql", x: 660, y: 170, config: { size: "Large", partitioning: "Enabled", partitionStrategy: "Hash", partitionKey: "tenant_id", shardCount: 8 } },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3"]), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3"], "fx-db")],
    },
    metrics: { rps: 30000, trafficUnit: "writes/s", dbCpuPercent: 140, monthlyCostUsd: 6020, errorRatePercent: 21 },
  },
};

const newestApps = lbApps("app", 2, "Large", 360, 170);
const newestShardHot: ProblemDef = {
  code: "SSA0023",
  slug: "the-newest-shard-is-always-hot",
  title: "The Newest Shard Is Always Hot",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Beacon's telemetry store range-partitions events by created_at into 6 shards. Every new event lands in the newest range, so one shard takes 100% of 12,000 writes/s while the others only serve old reads. Repartition so new writes spread across all shards.",
  guide: {
    title: "Required request path",
    description: "Switch from time ranges to hashing a high-cardinality key.",
    flow: ["application-server", "postgresql"],
    notes: ["Monotonically increasing keys always write to the 'end' of a range."],
  },
  concepts: ["Range vs. hash partitioning", "Monotonic keys"],
  reading: [{ title: "Sharding learning path", description: "Review range and hash strategies.", href: `${SH}#strategies` }],
  components: ["load-balancer", "application-server", "postgresql"],
  sim: { shards: { ...shardBase, writesPerSec: 12000, maxShardUtilizationPercent: 50, monotonicKeys: ["created_at", "timestamp", "id"] } },
  checks: shardChecks(12000, 50, [
    rule("Use hash partitioning for the write-heavy table.", (c) => c.is("postgresql", "partitionStrategy", "Hash"), { category: "quality", label: "Strategy" }),
  ]),
  reference: {
    config: ["PostgreSQL Large, partitioning enabled, Hash strategy on device_id, 6 shards: about 2,200 writes/s each (14%)."],
    explanation: [
      "Range partitions on time keep recent data together, which is great for reads but sends every new write to one place.",
      "Hashing device_id spreads concurrent writes evenly; time-range queries become scatter-gather, which this read pattern tolerates.",
      "Keeping created_at as a secondary index preserves fast time filters within each shard.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 170, config: { healthChecks: "Enabled" } },
        ...newestApps,
        { id: "db", type: "postgresql", x: 660, y: 170, config: { size: "Large", partitioning: "Enabled", partitionStrategy: "Hash", partitionKey: "device_id", shardCount: 6, indexedFields: "created_at" } },
      ],
      edges: [...fanOut("lb", ids(newestApps)), ...fanIn(ids(newestApps), "db")],
    },
  },
  fix: {
    description: "Beacon range-partitions telemetry by created_at. The newest shard is pegged while five others idle, and ingest falls behind every afternoon. Repair the partitioning.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 170 },
        ...lbApps("fx-app", 2, "Large", 360, 170),
        { id: "fx-db", type: "postgresql", x: 660, y: 170, config: { size: "Large", partitioning: "Enabled", partitionStrategy: "Range", partitionKey: "created_at", shardCount: 6 } },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2"]), ...fanIn(["fx-app-1", "fx-app-2"], "fx-db")],
    },
    metrics: { rps: 12000, trafficUnit: "writes/s", dbCpuPercent: 98, monthlyCostUsd: 4120, errorRatePercent: 6 },
  },
};

const csApps = lbApps("app", 2, "Large", 360, 170);
const csKey = (c: Ctx) => E.str(c.first("postgresql")?.config.partitionKey).trim().toLowerCase();
const crossShard: ProblemDef = {
  code: "SSA0024",
  slug: "cross-shard-checkout",
  title: "Cross-Shard Checkout",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Halyard shards orders by order_id but payments by payment_id, so every checkout writes to two shards and needs a distributed transaction that sometimes half-commits. Re-key both tables so a customer's order and its payments always live on the same shard.",
  guide: {
    title: "Required request path",
    description: "Pick one partition key that every checkout table shares, and make sure each table carries it.",
    flow: ["application-server", "postgresql"],
    notes: ["Describe tables in the Schema field so both carry the shared key."],
  },
  concepts: ["Co-locating related data", "Avoiding distributed transactions"],
  reading: [{ title: "Sharding learning path", description: "Review cross-shard operations.", href: `${SH}#cross-shard` }],
  components: ["load-balancer", "application-server", "postgresql"],
  checks: [
    rule("Keep the checkout database partitioned across at least 4 shards.", (c) => c.is("postgresql", "partitioning", "Enabled") && c.n("postgresql", "shardCount", 1) >= 4, { label: "Sharded store" }),
    rule("Partition by customer_id so a checkout touches one shard.", (c) => csKey(c) === "customer_id", {
      category: "Data Locality",
      label: "Shared key",
      points: 20,
      fail: (c) => `Partitioning by ${csKey(c) || "nothing"} still splits an order from its payments.`,
    }),
    rule("Carry customer_id in both the orders and payments tables.", (c) => {
      const s = c.cfg("postgresql", "schemaTables").replace(/\s+/g, "").toLowerCase();
      return /orders\([^)]*customer_id/.test(s) && /payments\([^)]*customer_id/.test(s);
    }, { category: "Data Locality", label: "Key in every table", points: 15 }),
  ],
  reference: {
    config: ["PostgreSQL partitioned 4 ways by customer_id.", "Schema: orders(id, customer_id); payments(id, order_id FK -> orders, customer_id)."],
    explanation: [
      "Rows that change together should be partitioned together. Orders and payments for one checkout share a customer.",
      "With a shared key the checkout is an ordinary single-shard transaction again: no two-phase commit, no half-written state.",
      "Denormalizing customer_id onto payments is a small cost for keeping every checkout local.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 170, config: { healthChecks: "Enabled" } },
        ...csApps,
        {
          id: "db",
          type: "postgresql",
          x: 660,
          y: 170,
          config: { size: "Medium", partitioning: "Enabled", partitionStrategy: "Hash", partitionKey: "customer_id", shardCount: 4, schemaTables: "orders(id, customer_id); payments(id, order_id FK -> orders, customer_id)" },
        },
      ],
      edges: [...fanOut("lb", ids(csApps)), ...fanIn(ids(csApps), "db")],
    },
  },
  fix: {
    description: "Halyard's checkout writes orders partitioned by order_id and payments partitioned by payment_id. 0.3% of checkouts half-commit across shards and need manual cleanup. Repair the partitioning.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 170 },
        ...lbApps("fx-app", 2, "Large", 360, 170),
        { id: "fx-db", type: "postgresql", x: 660, y: 170, config: { size: "Medium", partitioning: "Enabled", partitionKey: "order_id", shardCount: 4, schemaTables: "orders(id); payments(id, order_id)" } },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2"]), ...fanIn(["fx-app-1", "fx-app-2"], "fx-db")],
    },
    metrics: { rps: 700, appCpuPercent: 44, monthlyCostUsd: 2300, errorRatePercent: 0.3 },
  },
};

/* ------------------------------------------------------------------ */
/* Section 7: Object Storage & File Systems                             */
/* ------------------------------------------------------------------ */

const vidApps = lbApps("app", 2, "Large", 360, 120);
const videosInPostgres: ProblemDef = {
  code: "SSA0025",
  slug: "stop-storing-videos-in-postgres",
  title: "Stop Storing Videos in Postgres",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Pinwheel stores user-uploaded videos as binary columns in PostgreSQL. The database is 6 TB, backups take a day, and uploads tie up application servers for minutes. Move the bytes to object storage, let clients upload directly with signed URLs, and keep only metadata in PostgreSQL.",
  guide: {
    title: "Upload path",
    description: "Clients ask an upload service for a signed URL and send bytes straight to object storage; the app keeps metadata in PostgreSQL.",
    flow: ["web-client", "upload-service", "object-storage"],
    secondary: { title: "Metadata path", flow: ["load-balancer", "application-server", "postgresql"] },
    notes: ["Set the upload service to Direct / Signed URL.", "The database stores the object key, not the bytes."],
  },
  concepts: ["Blobs vs. rows", "Signed direct uploads"],
  reading: [{ title: "Object storage learning path", description: "Review why large files belong in object storage.", href: `${OS}#blobs` }],
  components: ["web-client", "upload-service", "object-storage", "load-balancer", "application-server", "postgresql", "cdn"],
  checks: [
    hasComponent("object-storage", "Store video bytes in object storage.", "Storage", 15),
    rule("Let clients upload directly to object storage using signed URLs from an upload service.", (c) => c.is("upload-service", "uploadMethod", "Direct / Signed URL") && c.edge("web-client", "object-storage") && c.edge("web-client", "upload-service"), {
      category: "Storage",
      label: "Direct upload",
      points: 20,
      fail: "Uploads still flow through your own servers.",
      fix: "Client -> Upload Service (signed URL), then Client -> Object Storage with the bytes.",
    }),
    rule("Keep metadata in PostgreSQL behind the application tier.", (c) => c.path("load-balancer", "application-server", "postgresql"), { category: "validity", label: "Metadata path" }),
    rule("Keep application servers out of the byte path.", (c) => !c.edge("application-server", "object-storage") || c.is("upload-service", "uploadMethod", "Direct / Signed URL"), { label: "Thin app tier" }),
  ],
  reference: {
    config: [
      "Web Client -> Upload Service (Direct / Signed URL) and Web Client -> Object Storage.",
      "Load Balancer -> Application Servers -> PostgreSQL for metadata (title, owner, object key).",
    ],
    explanation: [
      "Databases are optimized for small rows and transactions; multi-gigabyte blobs bloat backups, replication and buffer caches.",
      "A signed URL authorizes one upload for a few minutes; the bytes never touch your servers, which stay free for real requests.",
      "PostgreSQL keeps what it is good at: the searchable, relational metadata.",
    ],
    graph: {
      nodes: [
        { id: "client", type: "web-client", x: 60, y: 380 },
        { id: "up", type: "upload-service", x: 360, y: 300, config: { uploadMethod: "Direct / Signed URL" } },
        { id: "obj", type: "object-storage", x: 660, y: 420 },
        { id: "lb", type: "load-balancer", x: 60, y: 120, config: { healthChecks: "Enabled" } },
        ...vidApps.map((n) => ({ ...n, y: n.y - 60 })),
        { id: "db", type: "postgresql", x: 660, y: 120 },
      ],
      edges: [
        { source: "client", target: "up" },
        { source: "client", target: "obj" },
        { source: "client", target: "lb" },
        ...fanOut("lb", ids(vidApps)),
        ...fanIn(ids(vidApps), "db"),
      ],
    },
  },
  fix: {
    description:
      "Pinwheel streams video uploads through its application servers into a PostgreSQL bytea column. The database has grown to 6 TB and app servers spend most of their time shuffling bytes. Repair the storage design.",
    starting: {
      nodes: [
        { id: "fx-client", type: "web-client", x: 60, y: 160 },
        { id: "fx-lb", type: "load-balancer", x: 300, y: 160 },
        ...lbApps("fx-app", 2, "Large", 560, 160),
        { id: "fx-db", type: "postgresql", x: 860, y: 160, config: { size: "XL" } },
      ],
      edges: [{ source: "fx-client", target: "fx-lb" }, ...fanOut("fx-lb", ["fx-app-1", "fx-app-2"]), ...fanIn(["fx-app-1", "fx-app-2"], "fx-db")],
    },
    metrics: { rps: 600, appCpuPercent: 88, dbCpuPercent: 71, monthlyCostUsd: 2380, p95Ms: 4800 },
  },
};

const objectRps = (c: Ctx) => c.nodes("object-storage").reduce((m, n) => Math.max(m, E.objectStoreRequestCapacity(n)), 0);
const tinyFiles: ProblemDef = {
  code: "SSA0026",
  slug: "millions-of-tiny-files",
  title: "Millions of Tiny Files",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Mosaic serves map tiles: billions of small files read 30,000 times per second. All keys share one prefix (`tiles/`), and the object store throttles a single prefix at about 5,500 requests per second. Redesign storage and delivery so tile reads stay under 80% of what the storage can serve.",
  guide: {
    title: "Required delivery path",
    description: "Spread keys across many prefixes and put a CDN in front of the bucket.",
    flow: ["web-client", "cdn", "object-storage"],
    notes: ["Per-prefix limits multiply with hashed prefixes.", "A CDN absorbs repeat reads before they reach storage."],
  },
  concepts: ["Key layout and prefix limits", "Edge caching for static files"],
  reading: [{ title: "Object storage learning path", description: "Review request limits and key design.", href: `${OS}#prefixes` }],
  components: ["web-client", "cdn", "object-storage"],
  checks: [
    rule("Use hashed key prefixes so requests spread across partitions.", (c) => c.is("object-storage", "keyLayout", "Hashed prefixes"), { category: "capacity", label: "Key layout", points: 15 }),
    rule("Serve at least 37,500 requests/s from storage (30,000 at 80%).", (c) => objectRps(c) >= 37500, {
      category: "capacity",
      label: "Storage throughput",
      points: 20,
      pass: (c) => `Storage can serve ${fmt(objectRps(c))} requests/s.`,
      fail: (c) => `Storage can serve only ${fmt(objectRps(c))} requests/s.`,
    }),
    rule("Put a CDN between clients and the bucket for repeat tile reads.", (c) => c.path("web-client", "cdn", "object-storage"), { category: "quality", label: "Edge cache" }),
  ],
  reference: {
    config: ["Object storage with hashed prefixes (about 44,000 requests/s).", "Web Client -> CDN (images, long TTL) -> Object Storage."],
    explanation: [
      "Object stores partition by key prefix. One shared prefix means one partition doing all the work.",
      "A short hash at the start of each key (`a3f9/tiles/...`) spreads load evenly with no other code changes.",
      "Tiles rarely change, so a CDN with a long TTL serves most reads without touching the bucket at all.",
    ],
    graph: {
      nodes: [
        { id: "client", type: "web-client", x: 60, y: 160 },
        { id: "cdn", type: "cdn", x: 360, y: 160, config: { cachedContent: "Images", ttlSeconds: 86400 } },
        { id: "obj", type: "object-storage", x: 660, y: 160, config: { keyLayout: "Hashed prefixes" } },
      ],
      edges: [
        { source: "client", target: "cdn" },
        { source: "cdn", target: "obj" },
      ],
    },
  },
  fix: {
    description: "Mosaic reads map tiles straight from one bucket where every key starts with `tiles/`. At 30,000 reads/s the store throttles and 15% of tiles fail to load. Repair the storage layout and delivery path.",
    starting: {
      nodes: [
        { id: "fx-client", type: "web-client", x: 60, y: 160 },
        { id: "fx-obj", type: "object-storage", x: 400, y: 160, config: { keyLayout: "Flat prefix" } },
      ],
      edges: [{ source: "fx-client", target: "fx-obj" }],
    },
    metrics: { rps: 30000, monthlyCostUsd: 25, errorRatePercent: 15 },
  },
};

const fsIops = (c: Ctx) => {
  const fs = c.first("shared-filesystem");
  if (!fs) return 0;
  return E.str(fs.config.throughputMode) === "Provisioned" ? E.num(fs.config.provisionedIops, 3000) : 3000;
};
const renderWorkers = column("rw", "worker", 3, 360, 160, { instances: 4 }, 110);
const sharedFs: ProblemDef = {
  code: "SSA0027",
  slug: "shared-filesystem-bottleneck",
  title: "Shared Filesystem Bottleneck",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Ember Studios' render farm has 12 workers that read textures from a shared network filesystem. Each worker needs about 800 IOPS while rendering, and the filesystem runs in bursting mode, which drops to a 3,000 IOPS baseline after its burst credits run out mid-job. Keep all 12 workers fed with at least 20% headroom.",
  guide: {
    title: "Required data path",
    description: "Workers mount a filesystem whose sustained IOPS covers every worker at once.",
    flow: ["worker", "shared-filesystem"],
    notes: ["12 workers x 800 IOPS = 9,600 IOPS sustained.", "Bursting performance is not sustained performance."],
  },
  concepts: ["Burst credits vs. provisioned throughput", "Shared storage contention"],
  reading: [{ title: "Object storage learning path", description: "Review shared filesystems and throughput modes.", href: `${OS}#filesystems` }],
  components: ["worker", "shared-filesystem", "object-storage", "job-scheduler"],
  checks: [
    rule("Run at least 12 render worker instances.", (c) => c.nodes("worker").reduce((s, w) => s + E.instancesOf(w), 0) >= 12, { category: "capacity", label: "Worker count" }),
    rule("Connect every worker to the shared filesystem.", (c) => c.every("worker", "shared-filesystem"), { category: "validity", label: "Mounts" }),
    rule("Provide at least 11,520 sustained IOPS (9,600 plus 20% headroom).", (c) => fsIops(c) >= 11520, {
      category: "capacity",
      label: "Sustained IOPS",
      points: 25,
      pass: (c) => `The filesystem sustains ${fmt(fsIops(c))} IOPS.`,
      fail: (c) => `The filesystem sustains only ${fmt(fsIops(c))} IOPS once burst credits are gone.`,
      fix: "Switch to provisioned throughput and size IOPS for every worker plus headroom.",
    }),
  ],
  reference: {
    config: ["Shared filesystem in Provisioned mode at 12,000 IOPS.", "Three worker nodes with 4 instances each, all mounting the filesystem."],
    explanation: [
      "Bursting filesystems look fast in short tests and then fall to their baseline in the middle of a long render.",
      "Provisioned IOPS are guaranteed for as long as the job runs, so size them for the worst sustained concurrency.",
      "If textures were immutable, object storage with local caching would be the cheaper long-term design.",
    ],
    graph: {
      nodes: [...renderWorkers, { id: "fs", type: "shared-filesystem", x: 680, y: 160, config: { throughputMode: "Provisioned", provisionedIops: 12000 } }],
      edges: fanIn(ids(renderWorkers), "fs"),
    },
  },
  fix: {
    description: "Ember Studios' 12 render workers share a bursting network filesystem. Jobs start fast, then stall for minutes when burst credits run out and IOPS fall to 3,000. Repair the storage so every worker stays fed.",
    starting: {
      nodes: [
        ...column("fx-rw", "worker", 3, 360, 160, { instances: 4 }, 110),
        { id: "fx-fs", type: "shared-filesystem", x: 680, y: 160, config: { throughputMode: "Bursting" } },
      ],
      edges: fanIn(["fx-rw-1", "fx-rw-2", "fx-rw-3"], "fx-fs"),
    },
    metrics: { rps: 9600, trafficUnit: "IOPS", monthlyCostUsd: 1020, p95Ms: 3900 },
  },
};

const buckets = (c: Ctx) => c.nodes("object-storage");
const durability: ProblemDef = {
  code: "SSA0028",
  slug: "keep-it-or-let-it-go",
  title: "Keep It or Let It Go",
  difficulty: "Easy",
  minutes: 12,
  description:
    "Parcelbox stores two kinds of files: signed customer contracts, which must survive accidental deletes and be kept for years, and generated CSV exports that are useless after a week. Today both live in one bucket with the same settings, so the bill keeps growing and nothing is protected. Give each kind of data the storage policy it needs.",
  guide: {
    title: "Required storage layout",
    description: "Use one bucket for durable records and one for temporary files, each with its own lifecycle.",
    flow: ["application-server", "object-storage"],
    notes: ["Versioning protects against overwrites and deletes.", "An expiry rule deletes temporary files automatically."],
  },
  concepts: ["Durable vs. temporary data", "Lifecycle rules"],
  reading: [{ title: "Object storage learning path", description: "Review versioning and lifecycle policies.", href: `${OS}#lifecycle` }],
  components: ["application-server", "object-storage"],
  checks: [
    rule("Use two separate buckets, both reachable from the application.", (c) => buckets(c).length >= 2 && buckets(c).every((b) => c.nodes("application-server").some((a) => E.linked(c.g, a.id, b.id))), { label: "Separate buckets" }),
    rule("Turn on versioning for the contracts bucket.", (c) => buckets(c).some((b) => E.str(b.config.versioning) === "Enabled"), { category: "reliability", label: "Protected records", points: 15 }),
    rule("Expire exports automatically within 7 days.", (c) => buckets(c).some((b) => E.num(b.config.expireDays) > 0 && E.num(b.config.expireDays) <= 7 && E.str(b.config.versioning) !== "Enabled"), {
      category: "cost",
      label: "Temporary data",
      points: 15,
    }),
    rule("Move contracts to a cheaper tier after 30 to 90 days.", (c) => buckets(c).some((b) => E.str(b.config.versioning) === "Enabled" && E.num(b.config.lifecycleDays) >= 30 && E.num(b.config.lifecycleDays) <= 90), {
      category: "cost",
      label: "Tiering",
      soft: true,
    }),
  ],
  reference: {
    config: ["Contracts bucket: versioning on, move to infrequent access after 60 days.", "Exports bucket: no versioning, delete after 7 days."],
    explanation: [
      "Durability requirements are per dataset. Applying the strictest policy to everything wastes money; applying the loosest risks records.",
      "Versioning keeps prior copies when an object is overwritten or deleted.",
      "Expiry rules turn 'remember to clean up' into something the storage does on its own.",
    ],
    graph: {
      nodes: [
        { id: "app", type: "application-server", x: 80, y: 160 },
        { id: "contracts", type: "object-storage", x: 420, y: 60, config: { versioning: "Enabled", lifecycleDays: 60 } },
        { id: "exports", type: "object-storage", x: 420, y: 260, config: { expireDays: 7 } },
      ],
      edges: [
        { source: "app", target: "contracts" },
        { source: "app", target: "exports" },
      ],
    },
  },
  fix: {
    description: "Parcelbox keeps contracts and weekly CSV exports in one unversioned bucket with no lifecycle rules. Storage cost has tripled this year and a script recently deleted contracts with no way back. Repair the storage layout.",
    starting: {
      nodes: [
        { id: "fx-app", type: "application-server", x: 80, y: 160 },
        { id: "fx-obj", type: "object-storage", x: 420, y: 160 },
      ],
      edges: [{ source: "fx-app", target: "fx-obj" }],
    },
    metrics: { rps: 120, monthlyCostUsd: 2900 },
  },
};

export const DATA_STORAGE: ProblemDef[] = [
  orderHistory,
  connectionAvalanche,
  checkoutVsAnalytics,
  relationalModel,
  readHeavy,
  staleRead,
  importLag,
  failPrimary,
  writeWall,
  meltingShard,
  newestShardHot,
  crossShard,
  videosInPostgres,
  tinyFiles,
  sharedFs,
  durability,
];
