import type { Guide } from "./types";

export const CACHING_GUIDE: Guide = {
  sectionId: "software-system-architecture-section-8",
  kicker: "Section 01 · Foundation",
  title: "Caching",
  intro:
    "A cache answers repeated questions from memory so the database doesn't have to. This guide covers cache-aside reads and hit-rate math, TTLs and eviction, keeping cached data fresh, and the two classic failure modes: stampedes and hot keys.",
  byTheEnd: "You can size a cache from its working set, predict database load from the hit rate, choose an invalidation strategy, and keep a cache from turning into an outage amplifier.",
  chapters: [
    {
      id: "why",
      kicker: "Memory is fast",
      title: "Why cache",
      navTitle: "Why Cache",
      summary: "Lower latency and less load, as long as reads repeat.",
      intro: [
        "Reading from an in-memory cache takes well under a millisecond; a database query takes several, and much longer under load. When the same data is read far more often than it changes, serving it from memory saves both latency and database capacity.",
      ],
      blocks: [
        {
          type: "terms",
          items: [
            ["Hit", "The cache had the value; the database wasn't touched."],
            ["Miss", "The cache didn't have it; the request fell through to the database."],
            ["Hit rate", "Hits divided by all reads. Everything else in this guide flows from it."],
            ["Working set", "The data that's actually read during a period, usually much smaller than everything stored."],
          ],
        },
        { type: "key", text: "Caching pays off when reads repeat. A cache in front of data that's read once, or changes on every read, only adds a hop." },
      ],
    },
    {
      id: "cache-aside",
      kicker: "The default pattern",
      title: "Cache-aside reads",
      navTitle: "Cache-Aside Reads",
      summary: "Check the cache, fall back to the database, then fill the cache.",
      intro: [
        "In cache-aside, the application owns the logic: read the key from the cache; on a miss, query the database, write the result into the cache with a TTL, and return it. The cache never talks to the database itself.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "App", sub: "GET product:42", tone: "info" },
            { label: "Cache", sub: "Hit: return", tone: "accent" },
            { label: "Database", sub: "Miss only", tone: "success" },
          ],
          caption: "On a miss the app reads the database and writes the value back into the cache.",
        },
        { type: "formula", lines: ["database reads = total reads x (1 - hit rate)", "cache memory ≈ working set size x overhead"] },
        { type: "widget", name: "cache-hit", caption: "Change the cache size and TTL and watch what reaches the database." },
        {
          type: "table",
          head: ["Size", "Ops/s", "Memory", "Monthly cost"],
          rows: [
            ["Small", "25,000", "4 GB", "$60"],
            ["Medium", "80,000", "16 GB", "$160"],
            ["Large", "200,000", "64 GB", "$420"],
            ["XL", "400,000", "128 GB", "$800"],
          ],
          caption: "Cache sizes used in the labs.",
        },
      ],
    },
    {
      id: "ttl",
      kicker: "How long to keep things",
      title: "TTLs and eviction",
      navTitle: "TTLs & Eviction",
      summary: "Expiry bounds staleness; eviction handles a full cache.",
      intro: [
        "A TTL caps how stale a cached value can get. Longer TTLs raise the hit rate and the staleness together. When memory fills before keys expire, the eviction policy decides what goes.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Policy", "Evicts", "Good for"],
          rows: [
            ["allkeys-lru", "Least recently used keys", "General caching"],
            ["allkeys-lfu", "Least frequently used keys", "Skewed popularity, steady hot set"],
            ["noeviction", "Nothing; writes fail when full", "Data that must never silently disappear"],
          ],
        },
        { type: "warn", text: "A cache with noeviction that runs out of memory starts rejecting writes. For caches, prefer an eviction policy and size the memory for the working set." },
      ],
    },
    {
      id: "invalidation",
      kicker: "Keeping it true",
      title: "Cache invalidation",
      navTitle: "Invalidation",
      summary: "Freshness versus hit rate, and the order of operations.",
      intro: [
        "When the source data changes, cached copies become wrong. TTL-only caching tolerates that until expiry. Deleting the key on every write keeps the cache fresh at the cost of a miss right after each change.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "TTL only", tone: "warning", points: ["Simplest to run", "Stale for up to one TTL", "Fine for catalogs, feeds"] },
            { title: "Delete on write", tone: "success", points: ["Fresh after every change", "A miss after each write", "Needed for stock, prices, permissions"] },
          ],
        },
        { type: "key", text: "Delete the cache key after the database transaction commits, not before. Deleting first lets a concurrent read refill the cache with the old value." },
      ],
    },
    {
      id: "stampede",
      kicker: "When keys expire together",
      title: "Cache stampedes",
      navTitle: "Stampedes",
      summary: "Many misses for the same data at once can flatten a database.",
      intro: [
        "If a hot key expires, every request that wants it misses at the same moment and they all query the database together. If many keys were written together with the same TTL, they all expire together too, often at a round hour.",
      ],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "Normal minute", value: 1200, max: 30000, tone: "success" },
            { label: "Midnight, same TTL everywhere", value: 30000, max: 30000, tone: "danger", note: "every key misses" },
            { label: "Jittered TTL + coalescing", value: 1500, max: 30000, tone: "success" },
          ],
          unit: " DB queries/s",
          caption: "Synchronized expiry turns a warm cache into a cold one in a single second.",
        },
        {
          type: "list",
          items: [
            "Jitter TTLs (for example ±10%) so keys expire at different times.",
            "Coalesce misses: one request recomputes the value, the others wait for it.",
            "Refresh very hot keys shortly before they expire.",
          ],
        },
      ],
    },
    {
      id: "hot-keys",
      kicker: "One key, too much traffic",
      title: "Hot keys",
      navTitle: "Hot Keys",
      summary: "A single key can outgrow the node that stores it.",
      intro: [
        "A cache cluster spreads keys across nodes, but each key lives on one node. A celebrity profile or a flash-sale product can receive more reads than that node can serve, even when the cluster as a whole is idle.",
      ],
      blocks: [
        { type: "formula", lines: ["node load = sum of reads for the keys on that node", "one key at 150,000 reads/s needs more than one 80,000 ops/s node"] },
        {
          type: "table",
          head: ["Technique", "How it helps"],
          rows: [
            ["Replicate hot keys", "Copies on several nodes or replicas share the reads"],
            ["Local in-process cache", "App servers keep a few hot keys for a second or two"],
            ["Key splitting", "product:42#1..#8 spread one value across eight keys"],
          ],
        },
      ],
    },
    {
      id: "what-not-to-cache",
      kicker: "Judgment",
      title: "What not to cache",
      navTitle: "What Not to Cache",
      summary: "Some data gets worse, not faster, in a cache.",
      intro: ["Caches are a trade of freshness for speed. Some data can't afford the trade, and some gains nothing from it."],
      blocks: [
        {
          type: "list",
          items: [
            "Data read once or rarely: it only adds a hop.",
            "Values that change on almost every read: the hit rate stays near zero.",
            "Security decisions that must reflect revocation immediately, unless TTLs are seconds.",
            "Anything whose staleness causes money or inventory errors without invalidation.",
          ],
        },
      ],
    },
  ],
};

export const CDN_GUIDE: Guide = {
  sectionId: "software-system-architecture-section-9",
  kicker: "Section 02 · Foundation",
  title: "CDNs & Edge Delivery",
  intro:
    "Distance is latency, and no amount of server capacity fixes the speed of light. This guide covers how CDNs cut latency and origin load, how to update cached assets safely, how to personalize pages and still cache them, and how an origin shield protects you under viral traffic.",
  byTheEnd: "You can decide what a CDN should cache and for how long, ship new assets without stale clients, and estimate how much traffic still reaches your origin.",
  chapters: [
    {
      id: "latency",
      kicker: "Bring content closer",
      title: "Distance is latency",
      navTitle: "Distance Is Latency",
      summary: "Round trips across oceans dominate page load time.",
      intro: [
        "A user in Sydney fetching from a server in Virginia pays a long round trip for every connection setup, TLS handshake and request. A CDN keeps copies at edge locations near users, so most requests finish locally.",
      ],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "Sydney to US origin", value: 600, max: 650, tone: "danger" },
            { label: "Sydney to Sydney edge (hit)", value: 35, max: 650, tone: "success" },
          ],
          unit: " ms",
          caption: "Same content, same page. The difference is where it was served from.",
        },
        { type: "formula", lines: ["origin requests = total x (1 - cacheable share x hit rate)"], caption: "Offload compounds: an 80% cacheable site with a 95% hit rate sends only 24% of requests to origin." },
      ],
    },
    {
      id: "cache-control",
      kicker: "Telling the CDN what to do",
      title: "Cache-Control and TTLs",
      navTitle: "Cache-Control & TTLs",
      summary: "Headers decide what's cached, where and for how long.",
      intro: ["The origin controls caching through response headers. Getting them right is most of running a CDN well."],
      blocks: [
        {
          type: "table",
          head: ["Header", "Meaning"],
          rows: [
            ["Cache-Control: max-age=N", "Browsers and CDNs may reuse the response for N seconds"],
            ["s-maxage=N", "Shared caches (CDNs) use N instead of max-age"],
            ["stale-while-revalidate=N", "Serve the old copy while fetching a new one in the background"],
            ["private / no-store", "Never cache at the CDN; for personal or sensitive responses"],
          ],
        },
      ],
    },
    {
      id: "versioning",
      kicker: "Shipping new assets",
      title: "Cache busting with content hashes",
      navTitle: "Content-Hashed Assets",
      summary: "Change the URL when the content changes.",
      intro: [
        "If app.js is cached for a day and you deploy a new version, some users keep the old file for up to a day, usually alongside new HTML that expects the new one. Putting a hash of the content in the filename makes each version a different URL.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Same filename", tone: "danger", points: ["app.js cached for 24 h", "Old JS meets new HTML", "Purges race with deploys"] },
            { title: "Content-hashed", tone: "success", points: ["app.3f9a1c.js cached for a year", "New deploy, new URL", "HTML cached briefly, points at the right files"] },
          ],
        },
        { type: "key", text: "Long TTLs on immutable, hashed assets; short TTLs on the HTML that references them. Then deploys are instant and caches stay warm." },
      ],
    },
    {
      id: "edge",
      kicker: "Personal and still cached",
      title: "Personalization at the edge",
      navTitle: "Edge Personalization",
      summary: "Cache the shell, fill in the personal parts.",
      intro: [
        "A fully personalized page can't be shared between users, so it skips the CDN. Most pages are 95% identical for everyone. Cache that shell at the edge and add the personal parts with a small API call or an edge function.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Browser", tone: "info" },
            { label: "Edge", sub: "Cached shell + small edge function", tone: "accent" },
            { label: "API", sub: "Only the personal bits", tone: "success" },
          ],
          caption: "The expensive render is shared; per-user work shrinks to a tiny request.",
        },
        { type: "warn", text: "Never cache a response that contains personal data under a shared key. Vary on what matters or mark it private." },
      ],
    },
    {
      id: "shield",
      kicker: "One more layer",
      title: "Origin shield",
      navTitle: "Origin Shield",
      summary: "Collapse misses from many edges into one request.",
      intro: [
        "Each edge location keeps its own cache. When a new piece of content goes viral, hundreds of edges miss at once and each asks the origin. An origin shield is a regional cache between the edges and the origin that collapses those misses into a single fetch.",
      ],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "No shield: every edge misses", value: 300, max: 300, tone: "danger" },
            { label: "With shield: one fetch per object", value: 1, max: 300, tone: "success" },
          ],
          unit: " origin fetches",
          caption: "Viral content, 300 edge locations, one new object.",
        },
      ],
    },
    {
      id: "purging",
      kicker: "When you must remove content",
      title: "Purging",
      navTitle: "Purging",
      summary: "Purges work, but versioning is better.",
      intro: ["Purging tells every edge to drop an object. It takes time to propagate and can cause a burst of origin traffic. Prefer versioned URLs for assets and reserve purges for content that must disappear, such as takedowns."],
      blocks: [
        { type: "list", items: ["Versioned URLs: instant, no origin burst.", "Purge by path: for HTML and API responses.", "Purge everything: last resort; expect a cold-cache spike."] },
      ],
    },
  ],
};

export const QUEUES_GUIDE: Guide = {
  sectionId: "software-system-architecture-section-10",
  kicker: "Section 03 · Foundation",
  title: "Queues & Background Processing",
  intro:
    "Not everything has to happen while the user waits. This guide covers moving work off the request path, how queues behave under load, sizing workers to drain a backlog, handling messages that always fail, and keeping urgent work ahead of bulk work.",
  byTheEnd: "You can decide what belongs in a background job, size a worker pool from arrival and service rates, and design a queue that survives poison messages and traffic spikes.",
  chapters: [
    {
      id: "async",
      kicker: "Respond now, finish later",
      title: "Moving work off the request path",
      navTitle: "Async Processing",
      summary: "If the user doesn't need the result to continue, don't make them wait.",
      intro: [
        "A checkout that sends the confirmation email, renders a PDF invoice and updates analytics before responding can take eight seconds. Only the payment needs to happen inside the request. Everything else can be a message on a queue, processed a moment later.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Checkout", sub: "Charge card", tone: "info" },
            { label: "Queue", sub: "Email, invoice, analytics", tone: "warning" },
            { label: "Workers", sub: "Process in background", tone: "success" },
          ],
          caption: "The user gets a response as soon as the critical step is done.",
        },
        {
          type: "bars",
          items: [
            { label: "Everything synchronous", value: 8000, max: 8000, tone: "danger" },
            { label: "Payment sync, rest queued", value: 450, max: 8000, tone: "success" },
          ],
          unit: " ms",
          caption: "Same work, different place.",
        },
      ],
    },
    {
      id: "queues",
      kicker: "How queues behave",
      title: "Queue basics",
      navTitle: "Queue Basics",
      summary: "Producers, consumers, acknowledgments and visibility timeouts.",
      intro: ["A queue holds messages until a consumer takes one, processes it and acknowledges it. If the consumer crashes before acknowledging, the message becomes visible again and another consumer picks it up."],
      blocks: [
        {
          type: "terms",
          items: [
            ["Producer", "Code that puts messages on the queue."],
            ["Consumer / worker", "Code that takes messages off and processes them."],
            ["Acknowledgment", "The consumer's signal that a message is done and can be deleted."],
            ["Visibility timeout", "How long a taken message stays hidden before it's redelivered."],
            ["At-least-once", "A message may be delivered more than once, so processing must tolerate duplicates."],
          ],
        },
      ],
    },
    {
      id: "drain",
      kicker: "Arrival vs. service",
      title: "Backlogs and drain time",
      navTitle: "Backlogs & Drain Time",
      summary: "A queue only shrinks when workers outpace arrivals.",
      intro: [
        "If messages arrive faster than workers finish them, the backlog grows without limit. If workers are only slightly faster, a backlog drains very slowly. The margin between service rate and arrival rate is what matters.",
      ],
      blocks: [
        { type: "formula", lines: ["service rate = workers x jobs per worker per second", "drain time = backlog / (service rate - arrival rate)"] },
        { type: "widget", name: "queue-drain", caption: "Add workers and watch the drain time fall, slowly at first, then fast." },
        { type: "key", text: "Doubling workers when service barely exceeds arrival can cut drain time tenfold, because only the surplus drains the backlog." },
      ],
    },
    {
      id: "retries",
      kicker: "When processing fails",
      title: "Retries and visibility timeouts",
      navTitle: "Retries",
      summary: "Retry transient failures with backoff, and bound the attempts.",
      intro: ["Most failures are transient: a timeout, a deadlock, a briefly unavailable dependency. Retrying after a delay usually succeeds. Retrying immediately and forever turns one bad message into a permanent load."],
      blocks: [
        {
          type: "table",
          head: ["Setting", "Recommendation"],
          rows: [
            ["Max retries", "A small number, e.g. 3 to 5"],
            ["Backoff", "Exponential, with jitter"],
            ["Visibility timeout", "Longer than the slowest normal job"],
          ],
        },
      ],
    },
    {
      id: "poison",
      kicker: "Messages that always fail",
      title: "Poison messages and dead-letter queues",
      navTitle: "Poison Messages",
      summary: "Move repeatedly failing messages aside so the rest can flow.",
      intro: [
        "A malformed message fails every time. With unlimited retries it's redelivered forever, wasting workers and sometimes blocking ordered queues. A dead-letter queue catches messages after a maximum number of attempts so they can be inspected and replayed after a fix.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Queue", tone: "warning" },
            { label: "Worker", sub: "Fails 5 times", tone: "danger" },
            { label: "Dead-letter queue", sub: "Alert, inspect, replay", tone: "info" },
          ],
          caption: "The poison message leaves the main queue; healthy messages keep moving.",
        },
        { type: "warn", text: "A dead-letter queue nobody watches is just slower data loss. Alert on its depth." },
      ],
    },
    {
      id: "priority",
      kicker: "Urgent before bulk",
      title: "Priority and isolation",
      navTitle: "Priority & Isolation",
      summary: "Don't let a bulk job starve urgent work.",
      intro: [
        "A password-reset email stuck behind a million marketing emails is a real outage for that user. Priority lanes, or entirely separate queues with their own workers, keep urgent work flowing whatever the bulk backlog looks like.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "One shared queue", tone: "danger", points: ["Urgent waits behind bulk", "One backlog for everything", "Bulk spikes delay critical jobs"] },
            { title: "Priority lanes / separate pools", tone: "success", points: ["Urgent work skips ahead", "Each workload sized on its own", "Bulk can't starve critical jobs"] },
          ],
        },
      ],
    },
    {
      id: "idempotency",
      kicker: "Duplicates will happen",
      title: "Idempotent consumers",
      navTitle: "Idempotent Consumers",
      summary: "Process a message twice, get the effect once.",
      intro: ["At-least-once delivery means duplicates during retries and redeliveries. Consumers should make processing idempotent: record a message id, or make the operation naturally repeatable (set a value rather than increment it)."],
      blocks: [
        { type: "key", text: "Design every consumer as if each message will arrive twice. The advanced track covers idempotency keys and exactly-once effects in depth." },
      ],
    },
  ],
};
