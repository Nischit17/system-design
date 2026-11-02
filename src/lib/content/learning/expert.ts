import type { Guide } from "./types";

export const CORE_BACKEND_GUIDE: Guide = {
  sectionId: "expert-system-architecture-section-1",
  kicker: "Section 01 · Expert",
  title: "Core Backend Systems",
  intro:
    "These five systems show up in almost every product: short links, notifications, rate limits, file sync and messaging. This guide walks through how to approach a full design, then the key decisions behind each system and the failure modes each scenario tests.",
  byTheEnd: "You can move from requirements to a defensible design, estimate the numbers that matter, and explain the core trade-off in each of these systems.",
  chapters: [
    {
      id: "approach",
      kicker: "Method first",
      title: "Approaching a system design",
      navTitle: "Approaching a Design",
      summary: "Requirements, numbers, paths, then deep dives and failures.",
      intro: [
        "Expert problems are graded against several scenarios: normal operation, a traffic spike, a failure. A design that passes them all usually comes from the same method: pin down requirements, estimate load, draw the main paths, then stress each path against the scenarios.",
      ],
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            "Requirements: what must work, what can degrade, what must never happen.",
            "Estimates: requests per second, data size, read/write ratio, peak factor.",
            "Main paths: the request path users wait on, and the background paths.",
            "Data: what's stored where, keyed how, and how consistent it must be.",
            "Scenarios: spike, failure, abuse. What breaks first and what contains it?",
          ],
        },
        { type: "formula", lines: ["average RPS = daily requests / 86,400", "peak RPS ≈ average x peak factor (often 3-10x)"] },
      ],
    },
    {
      id: "url-shortener",
      kicker: "Read-heavy, immutable",
      title: "URL shortener",
      navTitle: "URL Shortener",
      summary: "Unique codes without coordination, redirects from the edge.",
      intro: [
        "Creating links is rare; redirecting is constant, often 100 times more frequent, and spiky when a link goes viral. Redirects are reads of data that never changes, so they cache superbly at every layer, including the CDN.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Code strategy", "Pros", "Cons"],
          rows: [
            ["Counter + Base62", "No collisions, short codes", "Counter must be handed out in batches"],
            ["Random + collision check", "No coordination", "Extra read per create"],
            ["Hash of URL", "Same URL, same code", "Collisions; can't give two users separate links"],
          ],
          caption: "Seven Base62 characters give 62^7, about 3.5 trillion codes.",
        },
        {
          type: "flow",
          steps: [
            { label: "Browser", tone: "info" },
            { label: "CDN", sub: "Cached redirects", tone: "accent" },
            { label: "Redirect tier", sub: "Misses only", tone: "warning" },
            { label: "Cache + store", sub: "Replicated", tone: "success" },
          ],
          caption: "Click analytics leave the redirect path as events, so counting never slows a redirect.",
        },
      ],
    },
    {
      id: "notifications",
      kicker: "Fan-out with priorities",
      title: "Notification platform",
      navTitle: "Notification Platform",
      summary: "Accept fast, prioritize, apply policy centrally, fail over providers.",
      intro: [
        "Every team sends notifications, so the platform owns the hard parts: priority (a fraud alert must not wait behind a marketing blast), user preferences and quiet hours, deduplication, provider rate limits and failover between channels.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "API", sub: "Accept + enqueue", tone: "info" },
            { label: "Priority lanes", tone: "warning" },
            { label: "Orchestrator", sub: "Preferences, dedup, channel", tone: "accent" },
            { label: "Providers", sub: "Push, email, SMS", tone: "success" },
          ],
          caption: "An outbound rate limiter in front of providers keeps a blast from getting the account throttled.",
        },
        { type: "key", text: "Separate lanes for transactional and bulk traffic is the single most important decision. Everything else is policy layered on top." },
      ],
    },
    {
      id: "rate-limiting",
      kicker: "Global, smooth, durable",
      title: "Distributed rate limiter",
      navTitle: "Distributed Rate Limiter",
      summary: "Shared counters, token buckets and a store that survives failures.",
      intro: [
        "A limit of 100 requests per second per customer must hold across 40 gateway nodes, so counters live in a shared store such as Redis, updated atomically. Token buckets or sliding windows avoid the double bursts fixed windows allow at their edges.",
      ],
      blocks: [
        { type: "formula", lines: ["counter-store ops/s ≈ limit checks per second", "size the store for peak checks at ~70%, plus replicas"] },
        {
          type: "compare",
          items: [
            { title: "Fail open", tone: "warning", points: ["Store down: allow requests", "Availability first", "Abuse possible during outage"] },
            { title: "Fail closed", tone: "danger", points: ["Store down: reject requests", "Protection first", "Outage of the limiter is an outage of the API"] },
          ],
        },
        { type: "key", text: "After an outage, ramp limits back up gradually so the backlog of waiting clients doesn't stampede the API." },
      ],
    },
    {
      id: "file-sync",
      kicker: "Big files, flaky networks",
      title: "File sync",
      navTitle: "File Sync",
      summary: "Chunk, deduplicate, upload directly, notify other devices.",
      intro: [
        "Files of many gigabytes over unreliable connections need chunking: split files into small pieces identified by their content hash. Only changed chunks upload after an edit, identical chunks are stored once, and an interrupted upload resumes from the last confirmed chunk.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Client", sub: "Chunk + hash", tone: "info" },
            { label: "Upload service", sub: "Signed URLs", tone: "warning" },
            { label: "Object storage", sub: "Chunks by hash", tone: "success" },
          ],
          caption: "Metadata (which chunks make which file version) goes through the API to a database.",
        },
        { type: "list", items: ["Push change events to devices over WebSockets with a shared connection registry.", "Detect conflicting edits by comparing the version each device started from.", "Serve popular downloads through a CDN."] },
      ],
    },
    {
      id: "messaging",
      kicker: "Real time, in order, never lost",
      title: "Messaging",
      navTitle: "Messaging",
      summary: "Connection routing, per-conversation order, offline delivery.",
      intro: [
        "Millions of phones hold persistent connections to gateways. A message for a user must find the gateway holding their connection (a shared registry), arrive in order relative to the rest of the conversation (a log partitioned by conversation), and wait safely if the phone is off (durable history plus push).",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Gateways", sub: "50k connections each", tone: "info" },
            { label: "Chat service", tone: "warning" },
            { label: "Log by conversation_id", tone: "accent" },
            { label: "Fan-out workers", sub: "Deliver, store, push", tone: "success" },
          ],
          caption: "Idempotent consumers make redelivery harmless, so a retried message is never shown twice.",
        },
        { type: "formula", lines: ["gateway instances = concurrent connections / (50,000 x 0.7)"] },
      ],
    },
  ],
};

export const CONSUMER_SCALE_GUIDE: Guide = {
  sectionId: "expert-system-architecture-section-2",
  kicker: "Section 02 · Expert",
  title: "Consumer Systems at Scale",
  intro:
    "Consumer products combine huge read volumes, media that's expensive to process, and global audiences. This guide covers the arithmetic of consumer scale, then feeds, photo sharing, video platforms, streaming services and ride hailing.",
  byTheEnd: "You can convert user numbers into load, choose fan-out strategies, design media pipelines, and keep consistency where it matters in a location-based marketplace.",
  chapters: [
    {
      id: "scale-math",
      kicker: "Users to requests",
      title: "Thinking at consumer scale",
      navTitle: "Consumer-Scale Math",
      summary: "Daily users, actions per user and peak factors.",
      intro: ["Start from users and behaviour: daily active users times actions per user gives daily requests; divide by 86,400 for the average; multiply by the peak factor. Separate reads from writes, because they scale differently."],
      blocks: [
        {
          type: "table",
          head: ["Input", "Example"],
          rows: [
            ["Daily active users", "200 million"],
            ["Timeline loads per user per day", "~130"],
            ["Average timeline reads/s", "~300,000"],
            ["Posts per second", "~6,000"],
            ["Read:write ratio", "50:1"],
          ],
        },
      ],
    },
    {
      id: "feeds",
      kicker: "Push or pull",
      title: "Timelines and feeds",
      navTitle: "Feeds",
      summary: "Fan-out on write, on read, or both.",
      intro: [
        "Fan-out on write precomputes each follower's timeline when someone posts, making reads cheap. Fan-out on read assembles timelines at request time, making posts cheap. Celebrity accounts with tens of millions of followers break fan-out on write, so real systems use a hybrid.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Fan-out on write", tone: "info", points: ["Fast reads from precomputed timelines", "Expensive for huge accounts", "Wasted work for inactive followers"] },
            { title: "Fan-out on read", tone: "warning", points: ["Cheap posts", "Expensive, slow reads", "Hard to rank in 200 ms"] },
            { title: "Hybrid", tone: "success", points: ["Push for normal accounts", "Merge celebrity posts at read time", "What large feeds actually run"] },
          ],
        },
      ],
    },
    {
      id: "photos",
      kicker: "Upload once, view millions of times",
      title: "Photo sharing",
      navTitle: "Photo Sharing",
      summary: "Direct uploads, async renditions, global delivery.",
      intro: ["Photos upload straight to object storage with signed URLs, a queue drives image processors that write several renditions, and a global CDN with an origin shield serves views. Object storage sees only CDN misses, spread across hashed key prefixes."],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Upload", sub: "Signed URL", tone: "info" },
            { label: "Queue", tone: "warning" },
            { label: "Image processors", sub: "Renditions", tone: "accent" },
            { label: "CDN", sub: "Views", tone: "success" },
          ],
          caption: "Processing is sized for upload rate; delivery is sized for view rate, which is far larger.",
        },
      ],
    },
    {
      id: "video",
      kicker: "Expensive to process, cheap to watch",
      title: "Video platforms",
      navTitle: "Video Platforms",
      summary: "Resumable uploads, adaptive encoding, segment delivery.",
      intro: [
        "Videos upload in resumable chunks, then encoders produce an adaptive bitrate ladder (several renditions) and manifests that let players switch quality with network conditions. Players fetch short segments from a CDN. Encoding is the bursty, costly part, so it sits behind a queue and scales independently.",
      ],
      blocks: [
        { type: "formula", lines: ["encoders = minutes uploaded per minute / (minutes each encoder processes per minute x target utilization)"] },
        { type: "key", text: "Adaptive streaming moves the decision of which quality to play to the client, which knows its own bandwidth." },
      ],
    },
    {
      id: "streaming",
      kicker: "A fixed catalog",
      title: "Subscription streaming",
      navTitle: "Subscription Streaming",
      summary: "Pre-encode, protect, deliver from the edge, survive a region.",
      intro: ["A known catalog can be encoded and DRM-packaged ahead of time, so peak load is almost pure delivery, absorbed by CDN edges with an origin shield. The API personalizes the home page with ranking and caching, and a second region with health-checked DNS keeps playback going during a regional outage."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Delivery path", tone: "accent", points: ["Segments from CDN edges", "Origin shield collapses misses", "Most traffic never reaches origin"] },
            { title: "Control path", tone: "info", points: ["API: auth, catalog, personalization", "Ranking and home-page caching", "Viewing history via events"] },
          ],
        },
      ],
    },
    {
      id: "ride-hailing",
      kicker: "Real-time and correct",
      title: "Ride hailing",
      navTitle: "Ride Hailing",
      summary: "A location firehose, consistent assignment, idempotent billing.",
      intro: [
        "A million drivers sending positions every few seconds is a firehose of overwrites, absorbed by a sharded in-memory geo index rather than a database. Assigning a driver to a trip, though, must be strongly consistent, so it runs as a transaction on a single primary. Trip events then drive billing through idempotent consumers.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Concern", "Choice"],
          rows: [
            ["Location updates", "WebSocket gateways into a sharded geo index"],
            ["Matching", "Query the geo index near the rider"],
            ["Assignment", "Transaction on a relational primary"],
            ["Billing", "Trip events keyed by trip_id, idempotency keys at the processor"],
          ],
        },
      ],
    },
  ],
};

export const HIGH_INTEGRITY_GUIDE: Guide = {
  sectionId: "expert-system-architecture-section-3",
  kicker: "Section 03 · Expert",
  title: "High-Integrity Platforms",
  intro:
    "Some systems can't trade correctness for speed: tickets can't be sold twice, money can't be lost, messages can't reorder, and private files can't leak. This guide covers the invariants behind ticketing, payments, team chat and cloud drives, and the evidence trails that prove they held.",
  byTheEnd: "You can name the invariants a platform must protect, choose mechanisms that enforce them under contention and failure, and design audit trails that hold up.",
  chapters: [
    {
      id: "integrity",
      kicker: "Invariants first",
      title: "When correctness beats availability",
      navTitle: "Correctness First",
      summary: "Find the rule that must never break, then defend it.",
      intro: ["Start each design by writing down its invariants: each seat sold once, every cent accounted for, messages ordered per channel, access only for people with permission. Every component choice is then judged by whether it can break one."],
      blocks: [
        {
          type: "table",
          head: ["Platform", "Invariant", "Enforced by"],
          rows: [
            ["Ticketing", "A seat is sold at most once", "Single transactional source of truth"],
            ["Payments", "No double charges; books balance", "Idempotency keys, double-entry ledger"],
            ["Team chat", "Channel order is preserved", "Log partitioned by channel"],
            ["Cloud drive", "Only permitted users can read", "Authorization on every access"],
          ],
        },
      ],
    },
    {
      id: "ticketing",
      kicker: "Two million fans, fifty thousand seats",
      title: "Ticketing",
      navTitle: "Ticketing",
      summary: "Meter the crowd, hold seats briefly, sell from one source of truth.",
      intro: [
        "No amount of scaling makes two million people fit into fifty thousand seats, but you can meter them. A virtual waiting room admits fans at the rate checkout can serve. Seats are held with a short TTL and sold in a single transactional database, so contention resolves correctly.",
      ],
      blocks: [
        { type: "formula", lines: ["fans in checkout ≈ admission rate x minutes shopping (Little's Law)", "admission rate <= what checkout serves at target utilization"] },
        { type: "list", items: ["Per-client rate limits slow bots.", "Expired holds return to sale automatically.", "Payments use idempotency keys."] },
      ],
    },
    {
      id: "payments",
      kicker: "Every cent accounted for",
      title: "Payments",
      navTitle: "Payments",
      summary: "Idempotent APIs, a double-entry ledger and guarded external calls.",
      intro: [
        "Merchants retry freely, so every write takes an idempotency key. Money movements go into an immutable double-entry ledger, where every transaction has balancing debits and credits and corrections are new entries, never edits. Calls to card networks are guarded by timeouts, circuit breakers and backoff.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Entry", "Debit", "Credit"],
          rows: [
            ["Customer pays $100", "Customer funds $100", "Merchant balance $97, fees $3"],
            ["Refund", "Merchant balance $97, fees $3", "Customer funds $100"],
          ],
          caption: "Each transaction balances; history is append-only.",
        },
        { type: "key", text: "A charge has no safe default response. When the network is down, fail clearly rather than guessing." },
      ],
    },
    {
      id: "team-chat",
      kicker: "Ordered and searchable",
      title: "Team chat",
      navTitle: "Team Chat",
      summary: "Persist first, then fan out; index history for search.",
      intro: ["Messages are written to a log partitioned by channel before anyone sees them, which preserves order and durability. Fan-out workers deliver through pub/sub to the gateways holding members' connections, push to away members, and history flows into a search index via change data capture."],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Gateways", tone: "info" },
            { label: "Log by channel_id", tone: "warning" },
            { label: "Fan-out", sub: "Pub/sub, push", tone: "accent" },
            { label: "History + search", tone: "success" },
          ],
          caption: "Large workspaces don't slow small ones: fan-out scales per channel.",
        },
      ],
    },
    {
      id: "drive",
      kicker: "Share safely",
      title: "Cloud drive",
      navTitle: "Cloud Drive",
      summary: "Relationship-based permissions, versions and co-editing.",
      intro: [
        "Sharing rules nest: a file in a folder shared with a group that contains another group. Relationship-based authorization answers 'can this user see this file?' by walking those relationships, with short decision caches. Versioned storage makes every overwrite recoverable, and a collaboration engine merges concurrent edits.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Role-based", tone: "warning", points: ["Users have roles", "Simple for org-wide rules", "Struggles with per-file sharing"] },
            { title: "Relationship-based", tone: "success", points: ["Permissions follow relationships", "Handles nested folders and groups", "Built for sharing"] },
          ],
        },
      ],
    },
    {
      id: "audit",
      kicker: "Proof",
      title: "Audit trails",
      navTitle: "Audit Trails",
      summary: "Immutable records of who did what, kept as long as required.",
      intro: ["Integrity has to be demonstrable. Immutable audit logs record sensitive actions (charges, refunds, permission changes, share events) with actor, time and target, retained as long as regulations require."],
      blocks: [
        { type: "list", items: ["Write audit events in the same flow as the action.", "Make the log append-only.", "Retain per policy, then expire automatically."] },
      ],
    },
  ],
};

export const PLATFORM_SERVICES_GUIDE: Guide = {
  sectionId: "expert-system-architecture-section-4",
  kicker: "Section 04 · Expert",
  title: "Search & Platform Services",
  intro:
    "Platform services are used by other engineers and other systems, which means multi-tenancy, isolation and very high expectations. This guide covers autocomplete, full-text search, collaborative editing, webhook delivery and distributed scheduling.",
  byTheEnd: "You can design search that's fast and fresh, editing that merges correctly, delivery that survives bad endpoints, and scheduling that fires exactly once.",
  chapters: [
    {
      id: "platforms",
      kicker: "Customers are engineers",
      title: "Building platform services",
      navTitle: "Platform Services",
      summary: "Tenant isolation, clear guarantees, safe defaults.",
      intro: ["Platform services multiply their users' mistakes: one tenant's runaway job can starve everyone. Design for isolation (quotas, bulkheads, per-tenant concurrency), state guarantees precisely, and make the safe behaviour the default."],
      blocks: [
        { type: "list", items: ["Per-tenant quotas and concurrency caps.", "Explicit delivery and timing guarantees.", "Metrics customers can see for their own usage."] },
      ],
    },
    {
      id: "autocomplete",
      kicker: "Every keystroke is a query",
      title: "Search autocomplete",
      navTitle: "Autocomplete",
      summary: "Prefix lookups in memory, popular prefixes at the edge.",
      intro: [
        "Typeahead must answer in tens of milliseconds for every keystroke. Rankings are computed offline from query logs and loaded into an in-memory prefix store; the request path is a single lookup. Most people type the same first letters, so popular prefixes cache well at the CDN.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Keystroke", tone: "info" },
            { label: "CDN", sub: "Popular prefixes", tone: "accent" },
            { label: "Suggest service", tone: "warning" },
            { label: "Prefix store", sub: "Rebuilt hourly", tone: "success" },
          ],
          caption: "A streaming consumer adds trending queries within minutes, between hourly rebuilds.",
        },
      ],
    },
    {
      id: "full-text",
      kicker: "Find, then rank",
      title: "Full-text search",
      navTitle: "Full-Text Search",
      summary: "Sharded inverted index, near-real-time indexing, re-ranking.",
      intro: [
        "An inverted index maps each term to the documents containing it. It's sharded so queries run in parallel across shards, and replicated so every shard survives a node loss. Change data capture streams new and changed documents in within seconds, and a re-ranker orders the top results.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Decision", "Choice"],
          rows: [
            ["Shards", "Enough that each stays small and fast"],
            ["Replicas", "At least one per shard"],
            ["Freshness", "CDC indexing from the source database"],
            ["Relevance", "Lexical scoring, then a learned re-ranker on the top results"],
          ],
        },
      ],
    },
    {
      id: "collaboration",
      kicker: "Many editors, one document",
      title: "Collaborative editing",
      navTitle: "Collaborative Editing",
      summary: "Operational transform or CRDTs, logs and snapshots.",
      intro: [
        "Concurrent edits must converge to the same document for everyone. Operational transform rewrites operations against each other through a central server; CRDTs use data structures whose merges commute, which suits offline editing. Either way, operations go to a durable log and periodic snapshots keep documents fast to open.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Operational transform", tone: "info", points: ["Central server orders operations", "Compact operations", "Offline merges are harder"] },
            { title: "CRDTs", tone: "success", points: ["Merges commute, any order works", "Great for offline and peer-to-peer", "More metadata per document"] },
          ],
        },
      ],
    },
    {
      id: "webhooks",
      kicker: "Delivering to the unknown",
      title: "Webhook platforms",
      navTitle: "Webhooks",
      summary: "Retries over days, isolation per endpoint, signing and SSRF protection.",
      intro: [
        "Customer endpoints are slow, flaky and occasionally hostile. Delivery is at-least-once with exponential backoff spread over days, bulkheads and circuit breakers stop one slow endpoint from holding every worker, and an egress proxy signs payloads and blocks requests to internal addresses.",
      ],
      blocks: [
        { type: "warn", text: "A customer can register http://169.254.169.254 as their webhook URL. Without an egress allowlist, your delivery workers will happily fetch your cloud metadata for them." },
      ],
    },
    {
      id: "scheduler",
      kicker: "On time, exactly once",
      title: "Distributed scheduling",
      navTitle: "Distributed Scheduler",
      summary: "Durable schedules, leader election, idempotent jobs.",
      intro: [
        "Schedules live in a durable store, not in a scheduler's memory. Leader election ensures one active scheduler fires each schedule, even across crashes. Due jobs go to a queue, and idempotent workers turn at-least-once delivery into exactly-once effect. Per-tenant concurrency caps keep one team's burst from starving the rest.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Leader scheduler", sub: "Durable schedules", tone: "warning" },
            { label: "Queue", sub: "Priority lanes", tone: "info" },
            { label: "Idempotent workers", tone: "success" },
          ],
          caption: "Track lateness percentiles: 'jobs start within one second' is the real SLO.",
        },
      ],
    },
  ],
};

export const INFRASTRUCTURE_GUIDE: Guide = {
  sectionId: "expert-system-architecture-section-5",
  kicker: "Section 05 · Expert",
  title: "Infrastructure Systems",
  intro:
    "Infrastructure systems are what everything else depends on, so their outages are everyone's outages. This guide covers metrics and logging platforms, feature flags, distributed caches, secrets management and object storage, with the design choices that keep each one boring.",
  byTheEnd: "You can design the shared systems other teams rely on, with ingestion that absorbs spikes, evaluation that never blocks requests, and durability that survives losing a zone.",
  chapters: [
    {
      id: "infra-mindset",
      kicker: "Everything depends on you",
      title: "Infrastructure as a product",
      navTitle: "Infrastructure Mindset",
      summary: "Small blast radius, graceful degradation, no hard dependency on yourself.",
      intro: ["When the secrets manager is down, nothing can start; when the logging pipeline blocks, applications stall. Infrastructure must degrade gracefully, keep its blast radius small, and avoid sitting on every request path."],
      blocks: [
        { type: "list", items: ["Clients cache what they need to keep working briefly without you.", "Buffer instead of block.", "Spread across zones; plan for losing one."] },
      ],
    },
    {
      id: "metrics",
      kicker: "Millions of points per second",
      title: "Metrics platform",
      navTitle: "Metrics Platform",
      summary: "Buffered ingestion, percentile storage, tiered retention.",
      intro: ["Agents send to collectors that buffer through backend blips; a partitioned stream absorbs bursts; ingesters write to a time-series store that keeps percentiles. Old data is downsampled and moved to cheaper storage so long retention doesn't bloat the hot store."],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Agents", tone: "info" },
            { label: "Collectors", sub: "Buffer", tone: "warning" },
            { label: "Stream", sub: "Partitioned", tone: "accent" },
            { label: "TSDB", sub: "Percentiles, tiers", tone: "success" },
          ],
          caption: "Dashboards query recent data through a query cache.",
        },
      ],
    },
    {
      id: "logging",
      kicker: "Spikes when it matters most",
      title: "Logging platform",
      navTitle: "Logging Platform",
      summary: "Never block apps, absorb incident spikes, redact at ingestion.",
      intro: ["Log volume jumps tenfold during incidents, exactly when logs matter. Collectors buffer, a stream absorbs the spike, indexers autoscale on backlog, and personal data is redacted before storage. Recent logs stay searchable; older logs move to archive storage and expire on schedule."],
      blocks: [
        { type: "key", text: "Logging must degrade by delaying, never by blocking the application or dropping the logs from the incident you're debugging." },
      ],
    },
    {
      id: "feature-flags",
      kicker: "Millions of checks per second",
      title: "Feature flag platform",
      navTitle: "Feature Flags",
      summary: "Evaluate locally, push changes, version and audit them.",
      intro: ["Flag checks happen on nearly every request, so they must never leave the process: services evaluate flags locally from a cached rule set. Changes are versioned and pushed within seconds; kill switches and targeting live in the platform; every change is audited."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Remote evaluation", tone: "danger", points: ["Network call per check", "Adds latency", "Platform outage breaks requests"] },
            { title: "Local evaluation", tone: "success", points: ["In-memory check", "Microseconds", "Keeps working if the platform is down"] },
          ],
        },
      ],
    },
    {
      id: "caching",
      kicker: "Shared memory for many services",
      title: "Distributed cache",
      navTitle: "Distributed Cache",
      summary: "Shard for memory, replicate for reads, protect the database.",
      intro: ["Sharding spreads keys and memory across nodes; replicas add read capacity and survive node loss. Hot keys get replicated across nodes; eviction uses LRU or LFU, never 'refuse writes'; and request coalescing with jittered TTLs keeps a lost node from stampeding the databases behind the cache."],
      blocks: [
        { type: "formula", lines: ["memory = sum of shard memory (replicas add copies, not capacity)", "ops capacity = sum over shards of ops per node x (1 + replicas)"] },
      ],
    },
    {
      id: "secrets",
      kicker: "Who can read what",
      title: "Secrets manager",
      navTitle: "Secrets Manager",
      summary: "Identity, authorization and audit on every read; rotation without downtime.",
      intro: ["Services authenticate with signed identity tokens; every read is authorized against attribute- or relationship-based policies and written to an immutable audit log. Rotation writes a new version first; services pick it up by push before the old version retires. Replication across zones keeps startup possible during an outage."],
      blocks: [
        { type: "list", items: ["Read through a cache of encrypted values with short TTLs.", "Version secrets so rotation never breaks running services.", "Audit every access for at least a year."] },
      ],
    },
    {
      id: "object-storage",
      kicker: "Eleven nines",
      title: "Object storage service",
      navTitle: "Object Storage Service",
      summary: "Data across zones, strongly consistent metadata, multipart uploads.",
      intro: ["Durability comes from writing every object to independent failure domains before acknowledging (replication or erasure coding across zones). Metadata lives in a strongly consistent store so a read right after a write sees it. Large objects upload in resumable parts; lifecycle rules move cold objects to cheaper tiers."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Replication (3 copies)", tone: "info", points: ["Simple, fast reads", "3x storage overhead", "Survives losing two copies"] },
            { title: "Erasure coding", tone: "success", points: ["~1.4-1.6x overhead", "Rebuild from fragments", "More CPU on writes and repairs"] },
          ],
        },
      ],
    },
  ],
};
