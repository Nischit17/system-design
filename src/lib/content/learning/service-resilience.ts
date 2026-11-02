import type { Guide } from "./types";

export const BOUNDARIES_GUIDE: Guide = {
  sectionId: "advanced-software-system-architecture-section-4",
  kicker: "Section 01 · Advanced",
  title: "Service Boundaries & Microservices",
  intro:
    "Splitting a system into services can isolate failures and let teams move independently, or it can create a slow, fragile web of calls. This guide covers when to extract a service, owning data per service, sizing services sensibly, and keeping non-critical dependencies off the critical path.",
  byTheEnd: "You can decide when a piece of a monolith deserves its own service, draw boundaries around data ownership, and structure calls so one service's outage doesn't become everyone's.",
  chapters: [
    {
      id: "monolith",
      kicker: "Where to start",
      title: "Monoliths are not the enemy",
      navTitle: "Start With a Monolith",
      summary: "A well-structured monolith is often the right first architecture.",
      intro: [
        "A modular monolith deploys as one unit but keeps clear internal boundaries. It's simpler to build, test and operate than a fleet of services. Split when there's a concrete reason: different load profiles, team ownership, or release cadence.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Modular monolith", tone: "info", points: ["One deploy, one database", "In-process calls, no network failures", "Shared scaling and blast radius"] },
            { title: "Services", tone: "accent", points: ["Independent deploys and scaling", "Failure isolation when done right", "Network calls, contracts, more operations"] },
          ],
        },
      ],
    },
    {
      id: "extraction",
      kicker: "A reason to split",
      title: "Extracting a service",
      navTitle: "Service Extraction",
      summary: "Pull out the part whose load or ownership differs.",
      intro: [
        "When search queries spike to 97% CPU and starve checkout, the problem isn't search's code, it's that both share a fleet. Extracting search into its own service with its own capacity isolates the hot path. Path-based routing at the load balancer sends /search/* to the new fleet without clients noticing.",
      ],
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            "Pick the boundary: a workload with distinct load, team or release needs.",
            "Route its traffic to a new fleet (path routing, a facade, or the strangler pattern).",
            "Move its data into a store it owns.",
            "Remove the old code path once traffic has moved.",
          ],
        },
        { type: "key", text: "The strangler pattern replaces a monolith gradually: route one feature at a time to the new service until the old code has nothing left to do." },
      ],
    },
    {
      id: "ownership",
      kicker: "Data has one owner",
      title: "Database per service",
      navTitle: "Database per Service",
      summary: "Shared tables are hidden APIs nobody versions.",
      intro: [
        "Two services reading and writing the same tables are coupled through the schema: one team's migration breaks the other's queries. Giving each service its own database turns that hidden coupling into an explicit contract, usually events.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Orders", sub: "Owns orders DB", tone: "info" },
            { label: "Outbox + relay", tone: "warning" },
            { label: "Events", sub: "OrderPlaced", tone: "accent" },
            { label: "Inventory", sub: "Owns inventory DB", tone: "success" },
          ],
          caption: "Inventory learns about orders from events, not by reading the orders table.",
        },
        { type: "warn", text: "A service that reaches into another service's database bypasses its rules and blocks its migrations. Read through its API or its events." },
      ],
    },
    {
      id: "granularity",
      kicker: "How big is a service",
      title: "Service granularity",
      navTitle: "Granularity",
      summary: "Group what changes together; avoid long chains of calls.",
      intro: [
        "Seven tiny services called one after another to render one page pay seven network hops and have seven ways to fail. Services should follow what changes together: price, discount and tax rules belong in one service if they always change as a set.",
      ],
      blocks: [
        { type: "formula", lines: ["sequential latency = sum of every hop", "parallel latency = slowest single call"] },
        {
          type: "bars",
          items: [
            { label: "Seven services in a chain", value: 340, max: 360, tone: "danger" },
            { label: "Page service + 3 in parallel", value: 115, max: 360, tone: "success" },
          ],
          unit: " ms",
          caption: "At about 45 ms per hop, depth matters more than service count.",
        },
      ],
    },
    {
      id: "async",
      kicker: "Critical vs. nice to have",
      title: "Synchronous vs. asynchronous dependencies",
      navTitle: "Async Dependencies",
      summary: "Every synchronous call multiplies your availability by theirs.",
      intro: [
        "If checkout synchronously calls loyalty, checkout can only be as available as loyalty. Availabilities multiply: three 99.9% dependencies in a chain give about 99.7%. Calls the user doesn't need to wait for should go through a queue.",
      ],
      blocks: [
        { type: "formula", lines: ["availability of a chain = product of each dependency's availability", "0.999 x 0.999 x 0.999 ≈ 0.997"] },
        {
          type: "compare",
          items: [
            { title: "Keep synchronous", tone: "info", points: ["Payment authorization", "Inventory reservation", "Anything the user must see succeed"] },
            { title: "Make asynchronous", tone: "success", points: ["Loyalty points", "Emails and notifications", "Analytics and search indexing"] },
          ],
        },
      ],
    },
    {
      id: "costs",
      kicker: "Eyes open",
      title: "The costs of services",
      navTitle: "Costs of Services",
      summary: "What you sign up for when you split.",
      intro: ["Services buy isolation and autonomy with real overhead. Budget for it before splitting."],
      blocks: [
        {
          type: "list",
          items: [
            "Network failures and timeouts on every call.",
            "Contracts to version and test across teams.",
            "Distributed tracing to debug a single request.",
            "More deployments, dashboards and on-call surface.",
            "Data consistency handled with events instead of transactions.",
          ],
        },
      ],
    },
  ],
};

export const CONSISTENCY_GUIDE: Guide = {
  sectionId: "advanced-software-system-architecture-section-5",
  kicker: "Section 02 · Advanced",
  title: "Consistency & Distributed Data",
  intro:
    "Once data lives in more than one place, every read can disagree with some write. This guide covers consistency models, read-after-write guarantees, resolving conflicts between writers, the CAP trade-off, quorums, and read models kept fresh with change data capture.",
  byTheEnd: "You can pick the consistency each dataset actually needs, keep users seeing their own changes, merge concurrent writes safely, and run read models that stay seconds behind the source.",
  chapters: [
    {
      id: "models",
      kicker: "What a read can return",
      title: "Consistency models",
      navTitle: "Consistency Models",
      summary: "From 'always the latest' to 'eventually the latest'.",
      intro: ["Consistency models describe which writes a read is guaranteed to see. Stronger models are easier to reason about and cost more latency or availability."],
      blocks: [
        {
          type: "table",
          head: ["Model", "Guarantee", "Typical use"],
          rows: [
            ["Strong (linearizable)", "Every read sees the latest committed write", "Balances, inventory, locks"],
            ["Read-your-writes", "A user always sees their own changes", "Profiles, settings, posts"],
            ["Monotonic reads", "Never see older data after newer data", "Feeds, timelines"],
            ["Eventual", "All copies converge given time", "Counters, likes, analytics"],
          ],
        },
      ],
    },
    {
      id: "read-after-write",
      kicker: "See your own changes",
      title: "Read-after-write consistency",
      navTitle: "Read-After-Write",
      summary: "Pin a user's reads to fresh data right after they write.",
      intro: [
        "Users forgive slightly stale feeds but not a profile edit that seems to vanish. Read-after-write consistency routes a user's reads to the primary (or to a replica known to be caught up) for a short window after they write, while everyone else keeps reading replicas.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "User saves profile", tone: "info" },
            { label: "Primary", sub: "Write", tone: "success" },
            { label: "Next reads", sub: "Primary for ~seconds", tone: "accent" },
            { label: "Then replicas", tone: "warning" },
          ],
          caption: "Only the reads that need freshness pay for it.",
        },
        { type: "warn", text: "Switching replication to synchronous for everyone also fixes stale reads, and slows every write in the system. Fix the reads that need it instead." },
      ],
    },
    {
      id: "conflicts",
      kicker: "Two writers, one record",
      title: "Resolving conflicts",
      navTitle: "Conflict Resolution",
      summary: "Last-write-wins drops data; merges keep it.",
      intro: [
        "In an active-active system, two regions can change the same record at the same moment. Last-write-wins keeps one version and silently drops the other. For a shopping cart, that's a lost item.",
        "CRDTs (conflict-free replicated data types) define merges that give the same result in any order: a cart can be a set of added items minus removed items, so concurrent adds both survive.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Last-write-wins", tone: "danger", points: ["Simple, no extra state", "Concurrent changes are lost", "Fine when writes truly replace"] },
            { title: "CRDT / custom merge", tone: "success", points: ["Concurrent changes combine", "Order-independent results", "Needs data types designed for merging"] },
          ],
        },
      ],
    },
    {
      id: "cap",
      kicker: "The trade-off you can't avoid",
      title: "CAP and choosing per dataset",
      navTitle: "CAP Trade-offs",
      summary: "During a partition, choose consistency or availability, per dataset.",
      intro: [
        "When a network partition splits replicas, a system must either refuse some requests (stay consistent) or serve possibly conflicting data (stay available). You don't choose once for the whole system; you choose per dataset.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Dataset", "During a partition", "Setup"],
          rows: [
            ["Wallet balances", "Refuse writes rather than diverge", "Synchronous replication, single primary"],
            ["Like counts", "Keep accepting, reconcile later", "Eventual consistency, 3 replicas"],
            ["Product catalog", "Serve slightly stale", "Async replicas and caches"],
          ],
        },
        { type: "key", text: "A refused balance update can be retried; a double-spent balance can't be undone. Let the cost of being wrong decide the model." },
      ],
    },
    {
      id: "quorums",
      kicker: "Tunable consistency",
      title: "Quorums",
      navTitle: "Quorums",
      summary: "Overlap read and write sets to see the latest write.",
      intro: ["Replicated stores often let you choose how many replicas must answer each write (W) and read (R) out of N copies. If every read set overlaps every write set, reads see the latest acknowledged write."],
      blocks: [
        { type: "formula", lines: ["strongly consistent reads when R + W > N", "N = 3, W = 2, R = 2: any read overlaps any write"] },
        {
          type: "table",
          head: ["N / W / R", "Reads", "Tolerates"],
          rows: [
            ["3 / 2 / 2", "Latest write", "One replica down"],
            ["3 / 1 / 1", "May be stale", "Two replicas down, fastest"],
            ["3 / 3 / 1", "Latest write", "No replica down for writes"],
          ],
        },
      ],
    },
    {
      id: "read-models",
      kicker: "Separate reads from writes",
      title: "Read models and change data capture",
      navTitle: "Read Models & CDC",
      summary: "Materialized views are only as fresh as their pipeline.",
      intro: [
        "A search index or dashboard built from the main database is a read model: shaped for queries, separate from the write path. If a nightly job rebuilds it, it's up to a day stale. Change data capture streams each committed change into the read model within seconds.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Database", sub: "Commits", tone: "success" },
            { label: "CDC indexer", sub: "Streams changes", tone: "warning" },
            { label: "Search index", sub: "Seconds behind", tone: "accent" },
          ],
          caption: "Heavy read traffic hits the read model, never the write database.",
        },
        { type: "key", text: "Monitor read-model lag like a replica's: alert when the gap between source and view grows beyond what users accept." },
      ],
    },
  ],
};

export const RELIABILITY_GUIDE: Guide = {
  sectionId: "advanced-software-system-architecture-section-6",
  kicker: "Section 03 · Advanced",
  title: "Reliability Patterns",
  intro:
    "Dependencies fail, and slow dependencies are worse than dead ones. This guide covers timeouts, circuit breakers, safe retries, bulkheads and admission control, and how to combine them so one failing dependency degrades one feature instead of the whole product.",
  byTheEnd: "You can match each failure mode to the pattern that contains it, configure each pattern with sensible numbers, and compose them in the right order.",
  chapters: [
    {
      id: "failure-modes",
      kicker: "How things break",
      title: "How dependencies fail",
      navTitle: "Failure Modes",
      summary: "Slow is worse than down, and failures spread.",
      intro: [
        "A dependency that's down fails fast. One that hangs holds a thread, a connection and memory for every call until the caller's pool is exhausted, and then the caller is down too. That's how a cascade starts.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Failure mode", "What happens", "Contained by"],
          rows: [
            ["Hang / slow responses", "Caller's workers pile up", "Timeouts, circuit breakers"],
            ["Brief blip", "Retries multiply load", "Backoff, jitter, retry budgets"],
            ["One slow partner of many", "Shared pool exhausted", "Bulkheads"],
            ["Recovery stampede", "Waiting clients flood back", "Admission control, gradual ramp-up"],
          ],
        },
      ],
    },
    {
      id: "timeouts",
      kicker: "The first line of defence",
      title: "Timeouts",
      navTitle: "Timeouts",
      summary: "Every remote call needs one, shorter than the caller's budget.",
      intro: ["Without a timeout, a call can wait forever. Set timeouts from the latency budget: if a page must render in 500 ms, an optional dependency can't be allowed 30 seconds."],
      blocks: [
        { type: "key", text: "Base timeouts on the dependency's normal p99 plus a margin, then check they fit inside the caller's own budget." },
      ],
    },
    {
      id: "circuit-breakers",
      kicker: "Stop calling what's broken",
      title: "Circuit breakers",
      navTitle: "Circuit Breakers",
      summary: "Fail fast while a dependency is unhealthy, and fall back.",
      intro: [
        "A circuit breaker watches the error rate of calls to a dependency. When failures pass a threshold it opens: calls fail immediately (or return a fallback) instead of waiting. After a cooldown it lets a few trial calls through; if they succeed, it closes again.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Closed", sub: "Calls pass through", tone: "success" },
            { label: "Open", sub: "Fail fast / fallback", tone: "danger" },
            { label: "Half-open", sub: "Trial calls", tone: "warning" },
          ],
          caption: "Too many failures open the breaker; successful trials close it.",
        },
        {
          type: "table",
          head: ["Setting", "Typical value"],
          rows: [
            ["Failure threshold", "25-50% of recent calls"],
            ["Open duration", "10-60 s"],
            ["Timeout", "Fits the caller's budget, e.g. 300 ms"],
            ["Fallback", "Cached or default response if the feature is optional"],
          ],
        },
      ],
    },
    {
      id: "retries",
      kicker: "Retry without amplifying",
      title: "Retries done right",
      navTitle: "Safe Retries",
      summary: "Exponential backoff, jitter, attempt caps and budgets.",
      intro: [
        "Retries rescue transient failures, and they multiply load exactly when a service is weakest. Ten immediate retries from every client can turn a 30-second blip into a long outage at ten times normal traffic.",
      ],
      blocks: [
        { type: "formula", lines: ["delay = base x 2^attempt, randomized (jitter)", "worst-case load ≈ normal load x (1 + retry budget)"] },
        { type: "widget", name: "retry-storm", caption: "Compare immediate retries with backoff and jitter during an outage." },
        {
          type: "list",
          items: [
            "Cap total attempts at 2-4.",
            "Back off exponentially and add jitter so clients don't retry in lockstep.",
            "Limit retries to a small share of traffic (a retry budget, e.g. 10%).",
            "Only retry operations that are safe to repeat.",
          ],
        },
      ],
    },
    {
      id: "bulkheads",
      kicker: "Compartments",
      title: "Bulkheads",
      navTitle: "Bulkheads",
      summary: "Separate pools so one dependency can't take every resource.",
      intro: [
        "Ships have watertight compartments so one breach doesn't sink the ship. A bulkhead gives each dependency its own pool of connections or threads. When the car-rental partner slows to 20 seconds, it fills only its own pool; flights and hotels keep working.",
      ],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "Flights pool", value: 30, max: 100, tone: "success" },
            { label: "Hotels pool", value: 35, max: 100, tone: "success" },
            { label: "Cars pool (slow partner)", value: 100, max: 100, tone: "danger", note: "only this pool is full" },
          ],
          unit: "% of pool",
          caption: "With one shared pool, the slow partner would have taken all three.",
        },
      ],
    },
    {
      id: "load-shedding",
      kicker: "Coming back gently",
      title: "Admission control and ramp-up",
      navTitle: "Admission Control",
      summary: "Shed load at the edge and ramp up after recovery.",
      intro: [
        "When a service recovers, every client that was waiting retries at once and knocks it over again. Admission control at the edge (a rate limiter) caps incoming work, and a gradual ramp-up lets capacity warm up before full traffic returns.",
      ],
      blocks: [
        { type: "key", text: "It's better to serve 80% of requests well than 100% of requests badly. Rejecting excess work quickly protects the work you accept." },
      ],
    },
    {
      id: "composition",
      kicker: "Putting them together",
      title: "Composing the patterns",
      navTitle: "Composing Patterns",
      summary: "Each pattern answers one failure mode; most systems need several.",
      intro: ["A checkout with three dependencies typically needs all of these at once. The order of wrapping matters: the bulkhead limits concurrency, the breaker decides whether to call at all, retries repeat calls that failed transiently, and the timeout bounds each attempt."],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Rate limiter", sub: "Gradual ramp", tone: "warning" },
            { label: "Bulkhead", sub: "Pool per dependency", tone: "info" },
            { label: "Circuit breaker", sub: "Fail fast", tone: "danger" },
            { label: "Retry + timeout", sub: "Backoff, jitter", tone: "success" },
          ],
          caption: "Outer layers protect the system; inner layers protect each call.",
        },
      ],
    },
  ],
};
