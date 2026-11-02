import type { ProblemDef } from "../types";
import { appTier, budget, column, connects, fanIn, fanOut, fmt, hasComponent, ids, pct, rule } from "../builders";
import type { Ctx } from "@/lib/sim/evaluate";
import * as E from "@/lib/sim/engine";
import { CACHE_SIZE_TABLE } from "@/lib/sim/tables";

const CA = "/tracks/caching-delivery-foundations/sections/software-system-architecture-section-8";
const CD = "/tracks/caching-delivery-foundations/sections/software-system-architecture-section-9";
const QU = "/tracks/caching-delivery-foundations/sections/software-system-architecture-section-10";

const apps = (prefix: string, n: number, size: string, x = 360, cy = 170) => column(prefix, "application-server", n, x, cy, { size }, 100);
const cacheNode = (c: Ctx) => E.readThroughCache(c.g);
const appsUse = (c: Ctx, id?: string) => !!id && c.topology().servers.length > 0 && c.topology().servers.every((s) => E.linked(c.g, s.id, id));

/* ------------------------------------------------------------------ */
/* Section 8: Caching                                                   */
/* ------------------------------------------------------------------ */

const sameReadDb = { readsPerSec: 50000, writesPerSec: 500, maxUtilizationPercent: 75, cache: { workingSetGb: 12, reuseSeconds: 10 } };
const srApps = apps("app", 4, "XL", 360, 200);
const sameRead: ProblemDef = {
  code: "SSA0029",
  slug: "the-same-read-fifty-thousand-times",
  title: "The Same Read, Fifty Thousand Times",
  difficulty: "Medium",
  minutes: 20,
  description:
    "Gilded's product pages trigger 50,000 database reads per second, almost all for the same 12 GB of popular products. The Medium PostgreSQL database handles 18,000 reads/s and is drowning. Add a cache-aside layer so most reads never reach the database, keeping the database at or below 75%.",
  guide: {
    title: "Required request path",
    description: "Application servers check Redis first and fall back to PostgreSQL on a miss.",
    flow: ["load-balancer", "application-server", "redis"],
    secondary: { title: "Miss path", flow: ["application-server", "postgresql"] },
    notes: ["Size the cache for the working set, not the whole database.", "The same products are re-read about every 10 seconds."],
  },
  concepts: ["Cache-aside reads", "Working-set sizing", "Hit rate math"],
  reading: [{ title: "Caching learning path", description: "Review cache-aside and hit rates.", href: `${CA}#cache-aside` }],
  components: ["load-balancer", "application-server", "redis", "postgresql"],
  sim: { db: sameReadDb, budgetMaxUsd: 600, budgetTypes: ["redis", "postgresql"] },
  checks: [
    rule("Serve product pages through a load balancer and application servers.", (c) => c.topology().entry?.type === "load-balancer" && c.topology().servers.length > 0, { label: "Request path" }),
    rule("Connect every application server to Redis used as a cache.", (c) => appsUse(c, cacheNode(c)?.id), { category: "Caching", label: "Cache-aside", points: 15 }),
    rule("Keep every application server connected to PostgreSQL for misses and writes.", (c) => appsUse(c, E.primaryDbNode(c.g)?.id), { category: "validity", label: "Miss path" }),
    rule("Reach a cache hit rate of at least 85%.", (c) => c.cacheHit() >= 85, {
      category: "Caching",
      label: "Hit rate",
      points: 20,
      pass: (c) => `The cache answers ${pct(c.cacheHit())} of reads.`,
      fail: (c) => `The cache answers only ${pct(c.cacheHit())} of reads.`,
      fix: "Give the cache enough memory for the 12 GB working set and a TTL well above the 10-second re-read interval.",
    }),
    rule("Keep PostgreSQL at or below 75% after the cache absorbs reads.", (c) => c.db().primaryUtilizationPercent <= 75, {
      category: "capacity",
      label: "Database load",
      points: 15,
      pass: (c) => `The database serves ${fmt(c.db().dbReadsPerSec)} reads/s at ${pct(c.db().primaryUtilizationPercent)}.`,
      fail: (c) => `The database still serves ${fmt(c.db().dbReadsPerSec)} reads/s (${pct(c.db().primaryUtilizationPercent)}).`,
    }),
    budget(600, "the cache and database", 10, ["redis", "postgresql"]),
  ],
  reference: {
    config: ["Redis Medium (16 GB) used as a cache, TTL 300 s, connected from all four application servers.", "Hit rate about 95%: the database sees 2,500 reads/s (21%)."],
    explanation: [
      "Hit rate depends on two things: whether the hot data fits in memory, and whether entries live longer than the gap between reads.",
      "A 4 GB cache holds only a third of the working set, so most reads would still miss.",
      "With 95% of reads served from memory, the existing Medium database is fine again.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 200, config: { healthChecks: "Enabled" } },
        ...srApps,
        { id: "cache", type: "redis", x: 680, y: 90, config: { size: "Medium", usage: "Cache", ttlSeconds: 300 } },
        { id: "db", type: "postgresql", x: 680, y: 320, config: { size: "Medium" } },
      ],
      edges: [...fanOut("lb", ids(srApps)), ...fanIn(ids(srApps), "cache"), ...fanIn(ids(srApps), "db")],
    },
  },
  fix: {
    description:
      "Gilded sends all 50,000 product reads per second straight to a Medium PostgreSQL database. A 4 GB Redis node exists but only caches the home page. Database CPU is pinned and pages time out. Repair the read path.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 200 },
        ...apps("fx-app", 4, "XL", 360, 200),
        { id: "fx-cache", type: "redis", x: 680, y: 60, config: { size: "Small", ttlSeconds: 30 } },
        { id: "fx-db", type: "postgresql", x: 680, y: 320, config: { size: "Medium" }, locked: true },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3", "fx-app-4"]), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3", "fx-app-4"], "fx-db")],
    },
    metrics: { rps: 50000, trafficUnit: "reads/s", dbCpuPercent: 100, monthlyCostUsd: 4980, p95Ms: 2600 },
  },
};

const invApps = apps("app", 2, "Large", 360, 170);
const inventoryWrong: ProblemDef = {
  code: "SSA0030",
  slug: "inventory-is-wrong",
  title: "Inventory Is Wrong",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Tern Outdoors caches stock levels in Redis with a 10-minute TTL. During a sale, items sell out but keep showing 'In stock' for up to ten minutes, and customers check out products that don't exist. Stock must be correct as soon as it changes, but the cache still needs to absorb the read load.",
  guide: {
    title: "Required request path",
    description: "Keep cache-aside reads, but invalidate an item's cache entry whenever its stock changes.",
    flow: ["application-server", "redis"],
    secondary: { title: "Write path", flow: ["application-server", "postgresql"] },
    notes: ["Shortening the TTL reduces staleness but never removes it.", "Delete-on-write invalidation removes the entry the moment the row changes."],
  },
  concepts: ["Cache invalidation", "Freshness vs. hit rate"],
  reading: [{ title: "Caching learning path", description: "Review invalidation strategies.", href: `${CA}#invalidation` }],
  components: ["load-balancer", "application-server", "redis", "postgresql"],
  checks: [
    rule("Keep a Redis cache in the read path of every application server.", (c) => appsUse(c, cacheNode(c)?.id), { category: "Caching", label: "Cache in place" }),
    rule("Write stock changes to PostgreSQL from the application tier.", (c) => appsUse(c, E.primaryDbNode(c.g)?.id), { category: "validity", label: "Source of truth" }),
    rule("Invalidate an item's cache entry whenever its stock changes.", (c) => E.str(cacheNode(c)?.config.invalidation) === "Delete on write", {
      category: "Correctness",
      label: "Invalidation",
      points: 25,
      fail: "With TTL-only expiry, stale stock is served until the entry times out.",
      fix: "Set the cache's invalidation to Delete on write.",
    }),
    rule("Keep a TTL as a safety net (60 seconds or more) so the cache still absorbs reads.", (c) => E.num(cacheNode(c)?.config.ttlSeconds) >= 60, {
      category: "Caching",
      label: "Hit rate preserved",
      fail: "A tiny TTL would push most reads back onto the database.",
    }),
  ],
  reference: {
    config: ["Redis as a cache with invalidation 'Delete on write' and a 600 s TTL.", "Application servers write stock to PostgreSQL, then delete the cached key."],
    explanation: [
      "TTL-only caches trade freshness for hit rate: stale for up to the TTL. Inventory cannot be stale.",
      "Deleting the key on every write means the next read repopulates it from the database with the current value.",
      "The TTL stays as a backstop for any missed invalidation, so the cache still serves the vast majority of reads.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 170, config: { healthChecks: "Enabled" } },
        ...invApps,
        { id: "cache", type: "redis", x: 680, y: 80, config: { usage: "Cache", ttlSeconds: 600, invalidation: "Delete on write", size: "Medium" } },
        { id: "db", type: "postgresql", x: 680, y: 280 },
      ],
      edges: [...fanOut("lb", ids(invApps)), ...fanIn(ids(invApps), "cache"), ...fanIn(ids(invApps), "db")],
    },
  },
  fix: {
    description: "Tern Outdoors caches stock in Redis with a 10-minute TTL and nothing else. Sold-out items keep showing in stock and 4% of orders fail at fulfilment. Repair the caching strategy without losing the cache's read offload.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 170 },
        ...apps("fx-app", 2, "Large", 360, 170),
        { id: "fx-cache", type: "redis", x: 680, y: 80, config: { usage: "Cache", ttlSeconds: 600, size: "Medium" } },
        { id: "fx-db", type: "postgresql", x: 680, y: 280 },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2"]), ...fanIn(["fx-app-1", "fx-app-2"], "fx-cache"), ...fanIn(["fx-app-1", "fx-app-2"], "fx-db")],
    },
    metrics: { rps: 2000, appCpuPercent: 62, monthlyCostUsd: 1550, errorRatePercent: 4 },
  },
};

const stampedeApps = apps("app", 3, "Large", 360, 170);
const midnight: ProblemDef = {
  code: "SSA0031",
  slug: "midnight-cache-explosion",
  title: "Midnight Cache Explosion",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Every night at 00:00 Juniper's price cache is reloaded with a 24-hour TTL, so every key also expires at exactly 00:00 the next day. At that moment thousands of concurrent requests miss together and stampede the database. Stop the stampede without giving up caching.",
  guide: {
    title: "Required request path",
    description: "Keep cache-aside reads; spread expiry times and collapse concurrent misses for the same key.",
    flow: ["application-server", "redis", "postgresql"],
    notes: ["Jittered TTLs stop keys from expiring at the same instant.", "Request coalescing lets one request refill a key while others wait."],
  },
  concepts: ["Cache stampedes", "TTL jitter and request coalescing"],
  reading: [{ title: "Caching learning path", description: "Review thundering herds at expiry.", href: `${CA}#stampede` }],
  components: ["load-balancer", "application-server", "redis", "postgresql"],
  checks: [
    rule("Keep Redis as a cache in front of PostgreSQL for every application server.", (c) => appsUse(c, cacheNode(c)?.id) && appsUse(c, E.primaryDbNode(c.g)?.id), { label: "Cache-aside" }),
    rule("Collapse concurrent misses for the same key into one database read.", (c) => /coalescing/i.test(E.str(cacheNode(c)?.config.stampedeProtection)), {
      category: "Reliability",
      label: "Coalescing",
      points: 20,
    }),
    rule("Spread expiry times with TTL jitter.", (c) => E.str(cacheNode(c)?.config.stampedeProtection) === "Jittered TTL + coalescing", { category: "Reliability", label: "Jitter", points: 15 }),
  ],
  reference: {
    config: ["Redis cache with stampede protection 'Jittered TTL + coalescing'."],
    explanation: [
      "A stampede is a synchronization problem: many keys expiring together, and many requests refilling the same key together.",
      "Jitter (for example TTL of 24h plus or minus 30 minutes) desynchronizes expiry; coalescing ensures only one request per key goes to the database.",
      "Neither change lowers the hit rate during normal operation.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 170, config: { healthChecks: "Enabled" } },
        ...stampedeApps,
        { id: "cache", type: "redis", x: 680, y: 80, config: { usage: "Cache", ttlSeconds: 86400, stampedeProtection: "Jittered TTL + coalescing", size: "Medium" } },
        { id: "db", type: "postgresql", x: 680, y: 280 },
      ],
      edges: [...fanOut("lb", ids(stampedeApps)), ...fanIn(ids(stampedeApps), "cache"), ...fanIn(ids(stampedeApps), "db")],
    },
  },
  fix: {
    description: "Juniper's database falls over at midnight every night when the whole price cache expires at once. Repair the cache so expiry never synchronizes and concurrent misses don't pile onto the database.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 170 },
        ...apps("fx-app", 3, "Large", 360, 170),
        { id: "fx-cache", type: "redis", x: 680, y: 80, config: { usage: "Cache", ttlSeconds: 86400, size: "Medium" } },
        { id: "fx-db", type: "postgresql", x: 680, y: 280 },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3"]), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3"], "fx-cache"), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3"], "fx-db")],
    },
    metrics: { rps: 3200, appCpuPercent: 48, dbCpuPercent: 100, monthlyCostUsd: 2430, errorRatePercent: 31 },
  },
};

const HOT_READS = 600_000;
const hotKeyCapacity = (c: Ctx) => {
  const n = cacheNode(c);
  if (!n) return 0;
  const base = (CACHE_SIZE_TABLE[E.str(n.config.size, "Small")] ?? CACHE_SIZE_TABLE.Small).opsPerSec;
  return E.str(n.config.hotKeyReplication) === "Enabled" ? base * (1 + Math.max(0, E.num(n.config.replicas))) : base;
};
const celebApps = apps("app", 4, "XL", 360, 200);
const celebrity: ProblemDef = {
  code: "SSA0032",
  slug: "celebrity-hot-key",
  title: "Celebrity Hot Key",
  difficulty: "Medium",
  minutes: 18,
  description:
    "When a pop star posts on Chirply, one profile key receives 600,000 reads per second. A single key lives on one Redis node, and even the XL size tops out at 400,000 operations per second. Make sure that key can be served at or below 80% of capacity, within $1,700 a month for the cache.",
  guide: {
    title: "Required request path",
    description: "Replicate hot keys so reads for one key spread across several cache nodes.",
    flow: ["application-server", "redis"],
    notes: ["Adding memory or a bigger node doesn't help if one key exceeds one node.", "Hot-key replication serves a key from the primary and its replicas."],
  },
  concepts: ["Hot keys", "Read fan-out across replicas"],
  reading: [{ title: "Caching learning path", description: "Review hot keys and skew.", href: `${CA}#hot-keys` }],
  components: ["load-balancer", "application-server", "redis", "postgresql"],
  sim: { budgetMaxUsd: 1700, budgetTypes: ["redis"] },
  checks: [
    rule("Read profiles through a Redis cache connected from every application server.", (c) => appsUse(c, cacheNode(c)?.id), { label: "Cache path" }),
    rule("Turn on hot-key replication.", (c) => E.str(cacheNode(c)?.config.hotKeyReplication) === "Enabled", { category: "Caching", label: "Hot-key replication", points: 15 }),
    rule("Serve the hot key at or below 80%: at least 750,000 reads/s of capacity for one key.", (c) => hotKeyCapacity(c) >= 750000, {
      category: "capacity",
      label: "Hot-key capacity",
      points: 25,
      pass: (c) => `One key can be served at ${fmt(hotKeyCapacity(c))} reads/s (${pct((HOT_READS / hotKeyCapacity(c)) * 100)}).`,
      fail: (c) => `One key tops out at ${fmt(hotKeyCapacity(c))} reads/s against a 600,000/s spike.`,
    }),
    budget(1700, "the cache", 10, ["redis"]),
  ],
  reference: {
    config: ["Redis XL with hot-key replication and 1 replica: 800,000 reads/s for a single key (75%). Cost: $1,600/month."],
    explanation: [
      "Sharding spreads different keys across nodes. A hot key is one key, so sharding alone keeps it on one node.",
      "Replicating hot keys lets reads for that key be answered by several nodes at once.",
      "Large plus three replicas also works ($1,680); Medium nodes can't reach the target within the replica limit.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 200, config: { healthChecks: "Enabled" } },
        ...celebApps,
        { id: "cache", type: "redis", x: 680, y: 100, config: { size: "XL", usage: "Cache", hotKeyReplication: "Enabled", replicas: 1, ttlSeconds: 60 } },
        { id: "db", type: "postgresql", x: 680, y: 320 },
      ],
      edges: [...fanOut("lb", ids(celebApps)), ...fanIn(ids(celebApps), "cache"), ...fanIn(ids(celebApps), "db")],
    },
  },
  fix: {
    description: "Chirply's profile cache is a single Redis Large node. Whenever a celebrity posts, one key gets 600,000 reads/s, that node saturates and timeouts cascade to every profile. Repair the cache within $1,700 a month.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 200 },
        ...apps("fx-app", 4, "XL", 360, 200),
        { id: "fx-cache", type: "redis", x: 680, y: 100, config: { size: "Large", usage: "Cache", ttlSeconds: 60 } },
        { id: "fx-db", type: "postgresql", x: 680, y: 320 },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3", "fx-app-4"]), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3", "fx-app-4"], "fx-cache"), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3", "fx-app-4"], "fx-db")],
    },
    metrics: { rps: 600000, trafficUnit: "reads/s", monthlyCostUsd: 5000, errorRatePercent: 22, p99Ms: 3100 },
  },
};

/* ------------------------------------------------------------------ */
/* Section 9: CDNs & Edge Delivery                                      */
/* ------------------------------------------------------------------ */

const sydneyCdn = { requestsPerSec: 8000, cacheableFraction: 0.9, contentType: "Static assets", originCapacityRps: 2400, maxOriginUtilizationPercent: 60, farRegionLatencyMs: 600 };
const sydApps = apps("app", 3, "Large", 660, 170);
const sydney: ProblemDef = {
  code: "SSA0033",
  slug: "sydney-is-600ms-away",
  title: "Sydney Is 600 ms Away",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Aurora's storefront runs in us-east. Customers in Australia wait over 600 ms for every asset because each request crosses the Pacific. 90% of requests are for static assets (images, scripts, styles). Bring p95 for far-away users under 150 ms and keep the origin at or below 60%.",
  guide: {
    title: "Required request path",
    description: "Put a global CDN between users and the origin, caching static assets at the edge.",
    flow: ["web-client", "cdn", "load-balancer", "application-server"],
    notes: ["The CDN must sit in front of the origin, not beside it.", "Choose a TTL long enough that edges rarely refetch."],
  },
  concepts: ["Edge caching for latency", "Origin offload"],
  reading: [{ title: "CDN learning path", description: "Review how edges cut round trips.", href: `${CD}#latency` }],
  components: ["web-client", "cdn", "load-balancer", "application-server"],
  sim: { cdn: sydneyCdn },
  checks: [
    rule("Route clients through a CDN that sits in front of the origin.", (c) => c.path("web-client", "cdn", "load-balancer"), { label: "Edge in path", points: 15 }),
    rule("Use a global edge footprint caching static assets.", (c) => c.is("cdn", "edgeLocations", "Global") && (c.is("cdn", "cachedContent", "Static assets") || c.is("cdn", "cachedContent", "Static + API GETs")), { category: "quality", label: "CDN config" }),
    rule("Bring p95 for distant users to 150 ms or less.", (c) => c.cdn().regionalP95Ms <= 150, {
      category: "Latency",
      label: "Regional p95",
      points: 20,
      pass: (c) => `Distant users see a p95 of ${fmt(c.cdn().regionalP95Ms)} ms.`,
      fail: (c) => `Distant users still see a p95 of ${fmt(c.cdn().regionalP95Ms)} ms.`,
    }),
    rule("Keep origin load at or below 60%.", (c) => c.cdn().originUtilizationPercent <= 60, {
      category: "capacity",
      label: "Origin load",
      points: 15,
      pass: (c) => `The origin serves ${fmt(c.cdn().originRps)} RPS (${pct(c.cdn().originUtilizationPercent)}).`,
      fail: (c) => `The origin still serves ${fmt(c.cdn().originRps)} RPS (${pct(c.cdn().originUtilizationPercent)}).`,
    }),
  ],
  reference: {
    config: ["Web Client -> CDN (global, static assets, TTL 3,600 s) -> Load Balancer -> three Large servers."],
    explanation: [
      "Distance sets a floor on latency that no server upgrade can lower. Serving from an edge near the user removes the ocean crossing for cached content.",
      "With a 95% hit rate on cacheable assets, the p95 drops to roughly 116 ms and the origin handles only the misses and dynamic requests.",
    ],
    graph: {
      nodes: [
        { id: "client", type: "web-client", x: 40, y: 170 },
        { id: "cdn", type: "cdn", x: 300, y: 70, config: { cachedContent: "Static assets", ttlSeconds: 3600, edgeLocations: "Global" } },
        { id: "lb", type: "load-balancer", x: 360, y: 270, config: { healthChecks: "Enabled" } },
        ...sydApps,
      ],
      edges: [{ source: "client", target: "cdn" }, { source: "cdn", target: "lb" }, ...fanOut("lb", ids(sydApps))],
    },
  },
  fix: {
    description: "Aurora's clients connect straight to a load balancer in us-east. Australian users wait 600+ ms per asset and conversion there is half of the US. Repair the delivery path.",
    starting: {
      nodes: [{ id: "fx-client", type: "web-client", x: 40, y: 170 }, { id: "fx-lb", type: "load-balancer", x: 320, y: 170 }, ...apps("fx-app", 3, "Large", 620, 170)],
      edges: [{ source: "fx-client", target: "fx-lb" }, ...fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3"])],
    },
    metrics: { rps: 8000, appCpuPercent: 33, monthlyCostUsd: 2040, p95Ms: 640 },
  },
};

const oldJs: ProblemDef = {
  code: "SSA0034",
  slug: "the-cdn-serves-old-javascript",
  title: "The CDN Serves Old JavaScript",
  difficulty: "Easy",
  minutes: 10,
  description:
    "Every time Ripple ships a release, some users get a broken page: their browsers and the CDN keep serving yesterday's `app.js` for up to a day while the new HTML expects the new bundle. Keep long cache lifetimes for performance, but make it impossible to serve a stale bundle after a deploy.",
  guide: {
    title: "Required delivery path",
    description: "Version assets in their file names so every build produces new URLs.",
    flow: ["web-client", "cdn", "object-storage"],
    notes: ["`app.3f9a1c.js` never changes; a new build is a new file.", "With versioned names, TTLs can be a year."],
  },
  concepts: ["Cache busting with content hashes", "Immutable assets"],
  reading: [{ title: "CDN learning path", description: "Review asset versioning and invalidation.", href: `${CD}#versioning` }],
  components: ["web-client", "cdn", "object-storage"],
  checks: [
    rule("Serve assets through a CDN backed by storage.", (c) => c.path("web-client", "cdn", "object-storage"), { label: "Delivery path" }),
    rule("Version assets with content-hashed file names.", (c) => c.is("cdn", "assetVersioning", "Content-hashed filenames"), { category: "Correctness", label: "Versioned assets", points: 25 }),
    rule("Keep a long TTL (at least one day) for versioned assets.", (c) => c.n("cdn", "ttlSeconds") >= 86400, { category: "quality", label: "Long caching" }),
  ],
  reference: {
    config: ["CDN with content-hashed file names and a one-year TTL in front of the asset bucket."],
    explanation: [
      "Purging caches races against clients that already downloaded the old HTML. Changing the URL avoids the race entirely.",
      "Because a hashed file can never change, it is safe to cache it for a year at every layer.",
      "Only the small HTML entry document needs a short TTL.",
    ],
    graph: {
      nodes: [
        { id: "client", type: "web-client", x: 60, y: 160 },
        { id: "cdn", type: "cdn", x: 360, y: 160, config: { assetVersioning: "Content-hashed filenames", ttlSeconds: 31536000 } },
        { id: "obj", type: "object-storage", x: 660, y: 160 },
      ],
      edges: [
        { source: "client", target: "cdn" },
        { source: "cdn", target: "obj" },
      ],
    },
  },
  fix: {
    description: "Ripple's CDN caches `app.js` for 24 hours under the same file name every release. After each deploy, 1 in 20 sessions loads mismatched HTML and JavaScript and crashes. Repair the asset strategy.",
    starting: {
      nodes: [
        { id: "fx-client", type: "web-client", x: 60, y: 160 },
        { id: "fx-cdn", type: "cdn", x: 360, y: 160, config: { ttlSeconds: 86400 } },
        { id: "fx-obj", type: "object-storage", x: 660, y: 160 },
      ],
      edges: [
        { source: "fx-client", target: "fx-cdn" },
        { source: "fx-cdn", target: "fx-obj" },
      ],
    },
    metrics: { rps: 5000, monthlyCostUsd: 145, errorRatePercent: 5 },
  },
};

const edgeApps = apps("app", 2, "Large", 900, 170);
const personalized: ProblemDef = {
  code: "SSA0035",
  slug: "personalized-pages-at-the-edge",
  title: "Personalized Pages at the Edge",
  difficulty: "Easy",
  minutes: 15,
  description:
    "Lumen's home page greets each user by name and shows their cart count, so it is marked uncacheable and every visit hits the origin. 95% of the page is identical for everyone. Cache the shared shell at the CDN and fill in the personal bits at the edge.",
  guide: {
    title: "Required request path",
    description: "The CDN serves a cached shell; a small edge function injects user-specific fragments.",
    flow: ["web-client", "cdn", "edge-compute", "load-balancer"],
    notes: ["Set the edge function's purpose to personalize the cached shell."],
  },
  concepts: ["Cacheable shells", "Edge compute"],
  reading: [{ title: "CDN learning path", description: "Review personalization without losing caching.", href: `${CD}#edge` }],
  components: ["web-client", "cdn", "edge-compute", "load-balancer", "application-server"],
  checks: [
    rule("Route requests client -> CDN -> edge function -> origin.", (c) => c.path("web-client", "cdn", "edge-compute") && c.edge("edge-compute", "load-balancer"), { label: "Edge path", points: 15 }),
    rule("Use the edge function to personalize the cached shell.", (c) => c.is("edge-compute", "purpose", "Personalize cached shell"), { category: "Caching", label: "Edge personalization", points: 20 }),
    rule("Cache the shared shell at the CDN.", (c) => c.n("cdn", "ttlSeconds") >= 60, { category: "Caching", label: "Cached shell" }),
  ],
  reference: {
    config: ["CDN caches the page shell (TTL 300 s).", "Edge Compute (Personalize cached shell, 5 ms) inserts name and cart count from a signed cookie."],
    explanation: [
      "Caching is all-or-nothing per URL unless you split the page. The shell is identical for everyone; only a few fragments are personal.",
      "An edge function runs next to the cache and can fill those fragments without a trip to the origin.",
    ],
    graph: {
      nodes: [
        { id: "client", type: "web-client", x: 40, y: 170 },
        { id: "cdn", type: "cdn", x: 300, y: 170, config: { ttlSeconds: 300 } },
        { id: "edge", type: "edge-compute", x: 560, y: 60, config: { purpose: "Personalize cached shell" } },
        { id: "lb", type: "load-balancer", x: 600, y: 280, config: { healthChecks: "Enabled" } },
        ...edgeApps,
      ],
      edges: [
        { source: "client", target: "cdn" },
        { source: "cdn", target: "edge" },
        { source: "edge", target: "lb" },
        ...fanOut("lb", ids(edgeApps)),
      ],
    },
  },
  fix: {
    description: "Lumen marks its whole home page uncacheable because two fragments are personal. Every visit hits the origin and the page is slow worldwide. Repair the delivery path so the shell is cached.",
    starting: {
      nodes: [
        { id: "fx-client", type: "web-client", x: 40, y: 170 },
        { id: "fx-cdn", type: "cdn", x: 300, y: 170, config: { ttlSeconds: 0 } },
        { id: "fx-lb", type: "load-balancer", x: 560, y: 170 },
        ...apps("fx-app", 2, "Large", 860, 170),
      ],
      edges: [{ source: "fx-client", target: "fx-cdn" }, { source: "fx-cdn", target: "fx-lb" }, ...fanOut("fx-lb", ["fx-app-1", "fx-app-2"])],
    },
    metrics: { rps: 4000, appCpuPercent: 81, monthlyCostUsd: 1540, p95Ms: 520 },
  },
};

const viralCdn = { requestsPerSec: 50000, cacheableFraction: 0.98, contentType: "Video segments", originCapacityRps: 6000, maxOriginUtilizationPercent: 60 };
const viral: ProblemDef = {
  code: "SSA0036",
  slug: "origin-shield-under-viral-traffic",
  title: "Origin Shield Under Viral Traffic",
  difficulty: "Easy",
  minutes: 12,
  description:
    "A clip on Reelhouse went viral: 50,000 requests per second for the same video segments from every corner of the world. Each of the CDN's edges misses independently, so the origin gets a flood of identical requests and falls over. Keep the origin at or below 60% while traffic stays viral.",
  guide: {
    title: "Required delivery path",
    description: "Add a shared caching tier between the edges and the origin, and cache segments long enough to matter.",
    flow: ["web-client", "cdn", "object-storage"],
    notes: ["An origin shield collapses misses from many edges into one fetch.", "Segments never change once written."],
  },
  concepts: ["Origin shield", "Miss collapsing"],
  reading: [{ title: "CDN learning path", description: "Review tiered caching.", href: `${CD}#shield` }],
  components: ["web-client", "cdn", "object-storage"],
  sim: { cdn: viralCdn },
  checks: [
    rule("Serve segments through the CDN from object storage.", (c) => c.path("web-client", "cdn", "object-storage"), { label: "Delivery path" }),
    rule("Enable an origin shield.", (c) => c.is("cdn", "originShield", "Enabled"), { category: "Caching", label: "Origin shield", points: 20 }),
    rule("Keep origin load at or below 60% during the spike.", (c) => c.cdn().originUtilizationPercent <= 60, {
      category: "capacity",
      label: "Origin load",
      points: 20,
      pass: (c) => `The origin serves ${fmt(c.cdn().originRps)} RPS (${pct(c.cdn().originUtilizationPercent)}).`,
      fail: (c) => `The origin serves ${fmt(c.cdn().originRps)} RPS (${pct(c.cdn().originUtilizationPercent)}).`,
      fix: "Combine an origin shield with a longer TTL for immutable segments.",
    }),
  ],
  reference: {
    config: ["CDN caching video segments with a 600 s TTL and an origin shield in front of object storage."],
    explanation: [
      "Hundreds of edges each missing once is still hundreds of origin requests per object. A shield gives them one shared upstream cache.",
      "A longer TTL raises the edge hit rate, and the shield absorbs most of what is left: origin load drops to about a third of capacity.",
    ],
    graph: {
      nodes: [
        { id: "client", type: "web-client", x: 60, y: 160 },
        { id: "cdn", type: "cdn", x: 360, y: 160, config: { cachedContent: "Video segments", ttlSeconds: 600, originShield: "Enabled" } },
        { id: "obj", type: "object-storage", x: 660, y: 160 },
      ],
      edges: [
        { source: "client", target: "cdn" },
        { source: "cdn", target: "obj" },
      ],
    },
  },
  fix: {
    description: "Reelhouse's CDN caches video segments for 60 seconds with no shield. A viral clip is driving 50,000 RPS and the origin is at 400% with 503s everywhere. Repair the delivery tier.",
    starting: {
      nodes: [
        { id: "fx-client", type: "web-client", x: 60, y: 160 },
        { id: "fx-cdn", type: "cdn", x: 360, y: 160, config: { cachedContent: "Video segments", ttlSeconds: 60 } },
        { id: "fx-obj", type: "object-storage", x: 660, y: 160 },
      ],
      edges: [
        { source: "fx-client", target: "fx-cdn" },
        { source: "fx-cdn", target: "fx-obj" },
      ],
    },
    metrics: { rps: 50000, monthlyCostUsd: 145, errorRatePercent: 38 },
  },
};

/* ------------------------------------------------------------------ */
/* Section 10: Queues & Background Processing                           */
/* ------------------------------------------------------------------ */

const coApps = apps("app", 3, "Large", 360, 120);
const checkoutSlow: ProblemDef = {
  code: "SSA0037",
  slug: "checkout-takes-eight-seconds",
  title: "Checkout Takes Eight Seconds",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Saffron's checkout handler charges the card, then synchronously sends a confirmation email, renders a PDF invoice and calls the warehouse API before responding. Customers wait eight seconds and abandon carts. Keep payment in the request, and move everything else to background workers.",
  guide: {
    title: "Checkout path",
    description: "Respond as soon as the order is stored; publish follow-up work to a queue drained by workers.",
    flow: ["load-balancer", "application-server", "postgresql"],
    secondary: { title: "Background path", flow: ["application-server", "message-queue", "worker", "email-provider"] },
    notes: ["Only the payment must complete before responding."],
  },
  concepts: ["Asynchronous processing", "Request-path latency"],
  reading: [{ title: "Queues learning path", description: "Review moving slow work off the request path.", href: `${QU}#async` }],
  components: ["load-balancer", "application-server", "postgresql", "message-queue", "worker", "email-provider", "payment-gateway"],
  checks: [
    rule("Store orders in PostgreSQL from the checkout servers.", (c) => c.path("load-balancer", "application-server", "postgresql"), { label: "Order path" }),
    connects("application-server", "message-queue", "Publish follow-up work from checkout to a message queue.", "Async Work", 15),
    rule("Drain the queue with workers that send the email.", (c) => c.path("message-queue", "worker", "email-provider"), { category: "Async Work", label: "Workers", points: 15 }),
    rule("Keep slow side effects out of the request: checkout servers must not call the email provider directly.", (c) => !c.edge("application-server", "email-provider"), {
      category: "Latency",
      label: "Fast checkout",
      points: 20,
      fail: "Checkout still waits for the email provider before responding.",
    }),
  ],
  reference: {
    config: ["Checkout servers write the order to PostgreSQL and publish an OrderPlaced message.", "Workers consume the queue and send email, invoices and warehouse calls."],
    explanation: [
      "Users only need to know the order was accepted. Everything that can happen a few seconds later should.",
      "The queue also absorbs provider outages: emails wait and retry instead of failing checkouts.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 120, config: { healthChecks: "Enabled" } },
        ...coApps,
        { id: "db", type: "postgresql", x: 680, y: 40 },
        { id: "q", type: "message-queue", x: 680, y: 240, config: { dlqEnabled: "Enabled", maxRetries: 5 } },
        { id: "wk", type: "worker", x: 980, y: 240, config: { instances: 2 } },
        { id: "mail", type: "email-provider", x: 1280, y: 240 },
      ],
      edges: [...fanOut("lb", ids(coApps)), ...fanIn(ids(coApps), "db"), ...fanIn(ids(coApps), "q"), { source: "q", target: "wk" }, { source: "wk", target: "mail" }],
    },
  },
  fix: {
    description: "Saffron's checkout servers call the email provider and warehouse API inline. p95 checkout latency is eight seconds and 12% of carts are abandoned at the final step. Repair the checkout flow.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 120 },
        ...apps("fx-app", 3, "Large", 360, 120),
        { id: "fx-db", type: "postgresql", x: 680, y: 40 },
        { id: "fx-mail", type: "email-provider", x: 680, y: 260 },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3"]), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3"], "fx-db"), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3"], "fx-mail")],
    },
    metrics: { rps: 400, appCpuPercent: 52, monthlyCostUsd: 2180, p95Ms: 8000 },
  },
};

const backlogQueue = { workerRatePerSec: 50, arrivalPerSec: 900, backlogJobs: 2_000_000, maxDrainMinutes: 60, maxWorkerUtilizationPercent: 80 };
const backlog: ProblemDef = {
  code: "SSA0038",
  slug: "the-backlog-keeps-growing",
  title: "The Backlog Keeps Growing",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Pixelry's thumbnail queue receives 900 jobs per second and already holds 2 million waiting jobs. Each worker instance finishes 50 jobs per second. Size the worker pool so the backlog clears within an hour while new jobs keep arriving, without running workers above 80%, for at most $2,000 a month.",
  guide: {
    title: "Required job path",
    description: "Workers consume from the queue; capacity must exceed arrivals by enough to burn down the backlog.",
    flow: ["message-queue", "worker"],
    notes: ["Drain time = backlog / (service rate - arrival rate).", "A worker instance costs $60/month."],
  },
  concepts: ["Arrival vs. service rate", "Backlog drain time"],
  reading: [{ title: "Queues learning path", description: "Review queue math.", href: `${QU}#drain` }],
  components: ["message-queue", "worker", "object-storage"],
  sim: { queue: backlogQueue, budgetMaxUsd: 2000 },
  checks: [
    connects("message-queue", "worker", "Consume the queue with workers.", "quality"),
    rule("Clear the 2 million job backlog within 60 minutes while new jobs arrive.", (c) => c.queue().drainMinutes <= 60, {
      category: "capacity",
      label: "Drain time",
      points: 25,
      pass: (c) => `The backlog clears in ${fmt(c.queue().drainMinutes)} minutes.`,
      fail: (c) => (Number.isFinite(c.queue().drainMinutes) ? `The backlog would take ${fmt(c.queue().drainMinutes)} minutes.` : "Arrivals outpace the workers, so the backlog never shrinks."),
      fix: "Service rate must exceed 900 + 2,000,000 / 3,600 = 1,456 jobs/s: at least 30 worker instances.",
    }),
    rule("Keep worker utilization at or below 80%.", (c) => c.queue().workerUtilizationPercent <= 80, {
      category: "utilization",
      label: "Worker load",
      pass: (c) => `Workers run at ${pct(c.queue().workerUtilizationPercent)}.`,
      fail: (c) => `Workers run at ${pct(c.queue().workerUtilizationPercent)}.`,
    }),
    budget(2000, "the queue and workers"),
  ],
  reference: {
    config: ["Message queue -> one Worker node with 30 instances (1,500 jobs/s).", "Drain: 2,000,000 / (1,500 - 900) = 3,333 s = 55.6 minutes. Cost: $1,800 + $50."],
    explanation: [
      "A queue only shrinks when service rate beats arrival rate, and it shrinks at the difference, not at the full service rate.",
      "20 workers would look 'faster than arrivals' on paper but take nearly six hours to catch up.",
    ],
    graph: {
      nodes: [
        { id: "q", type: "message-queue", x: 80, y: 160, config: { dlqEnabled: "Enabled", maxRetries: 5 } },
        { id: "wk", type: "worker", x: 420, y: 160, config: { instances: 30 } },
      ],
      edges: [{ source: "q", target: "wk" }],
    },
  },
  fix: {
    description: "Pixelry runs 12 thumbnail workers (600 jobs/s) against 900 jobs/s of arrivals. The backlog has grown to 2 million and users wait hours for thumbnails. Repair the worker pool so the backlog clears within an hour.",
    starting: {
      nodes: [
        { id: "fx-q", type: "message-queue", x: 80, y: 160 },
        { id: "fx-wk", type: "worker", x: 420, y: 160, config: { instances: 12 } },
      ],
      edges: [{ source: "fx-q", target: "fx-wk" }],
    },
    metrics: { rps: 900, trafficUnit: "jobs/s", monthlyCostUsd: 770, p95Ms: 7200000 },
  },
};

const poison: ProblemDef = {
  code: "SSA0039",
  slug: "the-poison-job",
  title: "The Poison Job",
  difficulty: "Easy",
  minutes: 10,
  description:
    "One malformed export request crashes Vellum's worker every time it is processed. The queue retries it forever, so the same message keeps killing workers and everything behind it waits. Make sure a bad message can only fail a few times before it is set aside for inspection.",
  guide: {
    title: "Required job path",
    description: "Cap retries and route messages that keep failing to a dead-letter queue.",
    flow: ["message-queue", "worker"],
    notes: ["Max retries of 0 means retry forever."],
  },
  concepts: ["Poison messages", "Dead-letter queues"],
  reading: [{ title: "Queues learning path", description: "Review retries and dead-letter queues.", href: `${QU}#poison` }],
  components: ["message-queue", "worker"],
  checks: [
    connects("message-queue", "worker", "Consume the queue with workers.", "quality"),
    rule("Cap retries between 1 and 5 attempts.", (c) => c.is("message-queue", "retry", "Enabled") && c.n("message-queue", "maxRetries") >= 1 && c.n("message-queue", "maxRetries") <= 5, {
      category: "Reliability",
      label: "Bounded retries",
      points: 20,
    }),
    rule("Send messages that exhaust their retries to a dead-letter queue.", (c) => c.is("message-queue", "dlqEnabled", "Enabled"), { category: "Reliability", label: "Dead-letter queue", points: 20 }),
    rule("Make workers idempotent so retries are safe.", (c) => c.is("worker", "idempotent", "Enabled"), { category: "quality", label: "Idempotent consumers", soft: true }),
  ],
  reference: {
    config: ["Message queue: retry enabled, max retries 3, dead-letter queue enabled.", "Workers marked idempotent."],
    explanation: [
      "Most failures are transient and a retry fixes them. A poison message fails deterministically, so infinite retries turn one bad input into an outage.",
      "A dead-letter queue keeps the message for debugging without blocking healthy work.",
    ],
    graph: {
      nodes: [
        { id: "q", type: "message-queue", x: 80, y: 160, config: { retry: "Enabled", maxRetries: 3, dlqEnabled: "Enabled" } },
        { id: "wk", type: "worker", x: 420, y: 160, config: { instances: 4, idempotent: "Enabled" } },
      ],
      edges: [{ source: "q", target: "wk" }],
    },
  },
  fix: {
    description: "Vellum's export queue retries failed messages forever with no dead-letter queue. A single malformed request has crashed workers 40,000 times today and the export backlog is stalled. Repair the queue configuration.",
    starting: {
      nodes: [
        { id: "fx-q", type: "message-queue", x: 80, y: 160, config: { retry: "Enabled", maxRetries: 0 } },
        { id: "fx-wk", type: "worker", x: 420, y: 160, config: { instances: 4 } },
      ],
      edges: [{ source: "fx-q", target: "fx-wk" }],
    },
    metrics: { rps: 200, trafficUnit: "jobs/s", monthlyCostUsd: 290, errorRatePercent: 100 },
  },
};

const urgentPath = (c: Ctx) => {
  const queues = c.nodes("message-queue");
  if (queues.some((q) => E.str(q.config.priority) === "Priority lanes" && E.outgoing(c.g, q.id).some((n) => n.type === "worker"))) return true;
  const withWorkers = queues.filter((q) => E.outgoing(c.g, q.id).some((n) => n.type === "worker"));
  if (withWorkers.length < 2) return false;
  const workerSets = withWorkers.map((q) => new Set(E.outgoing(c.g, q.id).filter((n) => n.type === "worker").map((n) => n.id)));
  return workerSets.some((a, i) => workerSets.some((b, j) => i !== j && [...a].every((id) => !b.has(id))));
};
const priority: ProblemDef = {
  code: "SSA0040",
  slug: "priority-matters",
  title: "Priority Matters",
  difficulty: "Hard",
  minutes: 18,
  description:
    "Parcelpost Mail sends password-reset emails and marketing newsletters through one queue. When a 2-million-email campaign starts, password resets wait behind it for over an hour and users can't log in. Keep marketing throughput, but make sure urgent emails never wait behind bulk sends.",
  guide: {
    title: "Urgent path",
    description: "Give urgent messages their own lane: either priority lanes or a separate queue with dedicated workers.",
    flow: ["application-server", "message-queue", "worker", "email-provider"],
    notes: ["Dedicated workers for the urgent queue can't be starved by bulk work."],
  },
  concepts: ["Priority queues", "Bulkheading async work"],
  reading: [{ title: "Queues learning path", description: "Review priorities and isolation.", href: `${QU}#priority` }],
  components: ["application-server", "message-queue", "worker", "email-provider"],
  checks: [
    rule("Send email through queues and workers to the provider.", (c) => c.path("message-queue", "worker", "email-provider"), { label: "Email path" }),
    rule("Give urgent email its own lane: priority lanes, or a separate queue with dedicated workers.", urgentPath, {
      category: "Isolation",
      label: "Urgent lane",
      points: 25,
      fail: "Urgent and bulk email still share one lane and one set of workers.",
      fix: "Enable priority lanes, or add a second queue for urgent mail with its own worker pool.",
    }),
    rule("Keep producers off the email provider: all sends go through queues.", (c) => !c.edge("application-server", "email-provider"), { category: "quality", label: "Async sends" }),
  ],
  reference: {
    config: ["Two queues: 'urgent' with 2 dedicated workers, 'bulk' with 10 workers, both sending through the email provider."],
    explanation: [
      "A FIFO queue treats a password reset like newsletter number 1,999,999. Order is fairness, not priority.",
      "Separate queues with separate workers act as a bulkhead: a bulk campaign can saturate its own pool without touching urgent mail.",
    ],
    graph: {
      nodes: [
        { id: "app", type: "application-server", x: 60, y: 200 },
        { id: "qu", type: "message-queue", x: 360, y: 80, config: { maxRetries: 5, dlqEnabled: "Enabled" } },
        { id: "qb", type: "message-queue", x: 360, y: 320, config: { maxRetries: 5, dlqEnabled: "Enabled" } },
        { id: "wu", type: "worker", x: 660, y: 80, config: { instances: 2 } },
        { id: "wb", type: "worker", x: 660, y: 320, config: { instances: 10 } },
        { id: "mail", type: "email-provider", x: 960, y: 200 },
      ],
      edges: [
        { source: "app", target: "qu" },
        { source: "app", target: "qb" },
        { source: "qu", target: "wu" },
        { source: "qb", target: "wb" },
        { source: "wu", target: "mail" },
        { source: "wb", target: "mail" },
      ],
    },
  },
  fix: {
    description: "Parcelpost Mail pushes password resets and newsletters through one FIFO queue. During campaigns, resets wait 70 minutes and login support tickets spike. Repair the email pipeline.",
    starting: {
      nodes: [
        { id: "fx-app", type: "application-server", x: 60, y: 200 },
        { id: "fx-q", type: "message-queue", x: 360, y: 200 },
        { id: "fx-wk", type: "worker", x: 660, y: 200, config: { instances: 12 } },
        { id: "fx-mail", type: "email-provider", x: 960, y: 200 },
      ],
      edges: [
        { source: "fx-app", target: "fx-q" },
        { source: "fx-q", target: "fx-wk" },
        { source: "fx-wk", target: "fx-mail" },
      ],
    },
    metrics: { rps: 1200, trafficUnit: "emails/s", monthlyCostUsd: 1110, p95Ms: 4200000 },
  },
};

void appTier;
void hasComponent;

export const CACHING_DELIVERY: ProblemDef[] = [sameRead, inventoryWrong, midnight, celebrity, sydney, oldJs, personalized, viral, checkoutSlow, backlog, poison, priority];
