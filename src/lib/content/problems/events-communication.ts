import type { ProblemDef } from "../types";
import { column, connects, fanIn, fanOut, ids, rule } from "../builders";
import type { Ctx } from "@/lib/sim/evaluate";
import * as E from "@/lib/sim/engine";

const PS = "/tracks/events-communication-advanced/sections/advanced-software-system-architecture-section-1";
const ID = "/tracks/events-communication-advanced/sections/advanced-software-system-architecture-section-2";
const AP = "/tracks/events-communication-advanced/sections/advanced-software-system-architecture-section-3";

const subscribersOf = (c: Ctx) => {
  const bus = c.first("pub-sub");
  return bus ? E.outgoing(c.g, bus.id).filter((n) => n.type === "worker" || n.type === "application-server" || n.type === "message-queue" || n.type === "serverless-function") : [];
};
const svc = (id: string, x: number, y: number, extra: Record<string, string | number> = {}) => ({ id, type: "worker", x, y, config: { idempotent: "Enabled", ...extra } });

/* ---------------- Pub/Sub & Event-Driven ---------------- */

const fiveSubs = [svc("email", 680, 20), svc("analytics", 680, 120), svc("inventory", 680, 220), svc("loyalty", 680, 320), svc("fraud", 680, 420)];
const oneOrder: ProblemDef = {
  code: "SSA0041",
  slug: "one-order-five-listeners",
  title: "One Order, Five Listeners",
  difficulty: "Medium",
  minutes: 15,
  description:
    "When an order is placed at Meridian, five teams need to know: email, analytics, inventory, loyalty and fraud. Today the order service calls each one in turn, so one slow team slows every checkout and adding a sixth means changing order code. Publish the event once and let each team subscribe independently.",
  guide: {
    title: "Required event path",
    description: "The order service publishes one OrderPlaced event; each consumer subscribes on its own.",
    flow: ["application-server", "pub-sub", "worker"],
    notes: ["The order service shouldn't know who is listening.", "Each team runs its own consumer."],
  },
  concepts: ["Publish/subscribe fan-out", "Temporal decoupling"],
  reading: [{ title: "Pub/Sub learning path", description: "Review fan-out and decoupling.", href: `${PS}#pubsub` }],
  components: ["application-server", "pub-sub", "worker", "postgresql"],
  checks: [
    connects("application-server", "pub-sub", "Publish order events from the order service to a pub/sub topic.", "Decoupling", 15),
    rule("Give each of the five consumers its own subscription.", (c) => subscribersOf(c).length >= 5, {
      category: "Decoupling",
      label: "Independent subscribers",
      points: 20,
      fail: (c) => `Only ${subscribersOf(c).length} consumer(s) subscribe to the topic.`,
    }),
    rule("Remove direct calls from the order service to the consumers.", (c) => !c.edge("application-server", "worker"), {
      category: "quality",
      label: "No direct calls",
      points: 15,
      fail: "The order service still calls consumers directly, so their latency is still checkout latency.",
    }),
  ],
  reference: {
    config: ["Order service -> Pub/Sub topic 'order.placed' -> five worker subscriptions (email, analytics, inventory, loyalty, fraud)."],
    explanation: [
      "Fan-out moves the 'who cares about this?' decision out of the producer. New consumers subscribe without a deploy of the order service.",
      "Checkout latency now only includes publishing one event; slow consumers just process later.",
    ],
    graph: {
      nodes: [{ id: "orders", type: "application-server", x: 60, y: 220 }, { id: "bus", type: "pub-sub", x: 360, y: 220 }, ...fiveSubs],
      edges: [{ source: "orders", target: "bus" }, ...fanOut("bus", ids(fiveSubs))],
    },
  },
  fix: {
    description: "Meridian's order service calls five downstream services synchronously after every purchase. When analytics is slow, checkout p95 climbs to 3 seconds. Repair the integration so consumers are decoupled.",
    starting: {
      nodes: [{ id: "fx-orders", type: "application-server", x: 60, y: 220 }, ...fiveSubs.map((n) => ({ ...n, id: `fx-${n.id}`, x: 420, config: {} }))],
      edges: fanOut("fx-orders", fiveSubs.map((n) => `fx-${n.id}`)),
    },
    metrics: { rps: 300, appCpuPercent: 41, monthlyCostUsd: 630, p95Ms: 3000 },
  },
};

const slowSubs = [svc("email", 680, 60), svc("search", 680, 180), svc("warehouse", 680, 300)];
const slowSubscriber: ProblemDef = {
  code: "SSA0042",
  slug: "the-slow-subscriber",
  title: "The Slow Subscriber",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Canopy's catalog events go to three subscribers through shared delivery. When the warehouse sync falls behind, delivery stalls for everyone and search results go stale. Make each subscriber's progress independent, so a slow one only delays itself.",
  guide: {
    title: "Required event path",
    description: "Give every subscriber its own durable queue so backlogs are isolated.",
    flow: ["application-server", "pub-sub", "worker"],
    notes: ["Per-subscriber queues let a slow consumer build a private backlog."],
  },
  concepts: ["Subscriber isolation", "Per-consumer backlogs"],
  reading: [{ title: "Pub/Sub learning path", description: "Review consumer isolation.", href: `${PS}#queue` }],
  components: ["application-server", "pub-sub", "message-queue", "worker"],
  checks: [
    rule("Keep catalog events flowing through a pub/sub topic to three subscribers.", (c) => c.edge("application-server", "pub-sub") && subscribersOf(c).length >= 3, { label: "Fan-out" }),
    rule("Isolate subscribers with a queue per subscriber.", (c) => c.is("pub-sub", "subscriberIsolation", "Queue per subscriber") || c.nodes("message-queue").length >= 3, {
      category: "Isolation",
      label: "Per-subscriber backlog",
      points: 25,
      fail: "Subscribers share delivery, so one slow consumer holds everyone back.",
    }),
  ],
  reference: {
    config: ["Pub/Sub with 'Queue per subscriber' isolation feeding email, search and warehouse workers."],
    explanation: [
      "With shared delivery, the slowest consumer sets the pace. With a queue per subscriber, each one has its own backlog and its own pace.",
      "The warehouse can now fall behind for an hour without delaying search indexing by a second.",
    ],
    graph: {
      nodes: [{ id: "cat", type: "application-server", x: 60, y: 180 }, { id: "bus", type: "pub-sub", x: 360, y: 180, config: { subscriberIsolation: "Queue per subscriber" } }, ...slowSubs],
      edges: [{ source: "cat", target: "bus" }, ...fanOut("bus", ids(slowSubs))],
    },
  },
  fix: {
    description: "Canopy's pub/sub uses shared delivery. The warehouse consumer is 40 minutes behind and has dragged search and email down with it. Repair the subscription model.",
    starting: {
      nodes: [{ id: "fx-cat", type: "application-server", x: 60, y: 180 }, { id: "fx-bus", type: "pub-sub", x: 360, y: 180 }, ...slowSubs.map((n) => ({ ...n, id: `fx-${n.id}` }))],
      edges: [{ source: "fx-cat", target: "fx-bus" }, ...fanOut("fx-bus", slowSubs.map((n) => `fx-${n.id}`))],
    },
    metrics: { rps: 1500, trafficUnit: "events/s", monthlyCostUsd: 300, p95Ms: 2400000 },
  },
};

const typedSubs = [svc("billing", 680, 60), svc("crm", 680, 180), svc("audit", 680, 300)];
const eventSoup: ProblemDef = {
  code: "SSA0043",
  slug: "event-soup",
  title: "Event Soup",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Tidal's teams publish 60 kinds of untyped JSON events. Last week someone renamed a field and three consumers silently broke. Introduce event contracts that are versioned and checked, and keep a replayable log so a fixed consumer can catch up.",
  guide: {
    title: "Required event path",
    description: "Validate events against a versioned schema and keep them in a durable log.",
    flow: ["application-server", "pub-sub", "worker"],
    secondary: { title: "Replay log", flow: ["pub-sub", "event-stream"] },
    notes: ["Retention lets consumers re-read events after a bug fix."],
  },
  concepts: ["Event contracts and schema versioning", "Replayable event logs"],
  reading: [{ title: "Pub/Sub learning path", description: "Review event taxonomy and contracts.", href: `${PS}#taxonomy` }],
  components: ["application-server", "pub-sub", "event-stream", "worker"],
  checks: [
    rule("Publish through pub/sub to independent subscribers.", (c) => c.edge("application-server", "pub-sub") && subscribersOf(c).length >= 3, { label: "Fan-out" }),
    rule("Validate every event against a versioned schema registry.", (c) => c.is("pub-sub", "schema", "Versioned schema registry"), { category: "Contracts", label: "Schema registry", points: 20 }),
    rule("Keep a replayable event log with at least 7 days of retention.", (c) => c.edge("pub-sub", "event-stream") && c.n("event-stream", "retentionHours") >= 168, {
      category: "Contracts",
      label: "Replay",
      points: 15,
    }),
  ],
  reference: {
    config: ["Pub/Sub with a versioned schema registry; topic mirrored into an event stream with 7-day retention."],
    explanation: [
      "A schema registry turns breaking changes into a failed publish instead of a silent consumer bug.",
      "Versioned schemas let producers add fields safely and consumers migrate on their own schedule.",
      "Retention means a consumer that was broken for a day can replay exactly what it missed.",
    ],
    graph: {
      nodes: [
        { id: "prod", type: "application-server", x: 60, y: 180 },
        { id: "bus", type: "pub-sub", x: 360, y: 180, config: { schema: "Versioned schema registry", subscriberIsolation: "Queue per subscriber" } },
        { id: "log", type: "event-stream", x: 360, y: 400, config: { retentionHours: 168, partitions: 6, replicationFactor: 3 } },
        ...typedSubs,
      ],
      edges: [{ source: "prod", target: "bus" }, { source: "bus", target: "log" }, ...fanOut("bus", ids(typedSubs))],
    },
  },
  fix: {
    description: "Tidal publishes untyped JSON with no retention. A renamed field broke three consumers for two days and the lost events can't be recovered. Repair the event platform.",
    starting: {
      nodes: [{ id: "fx-prod", type: "application-server", x: 60, y: 180 }, { id: "fx-bus", type: "pub-sub", x: 360, y: 180 }, ...typedSubs.map((n) => ({ ...n, id: `fx-${n.id}` }))],
      edges: [{ source: "fx-prod", target: "fx-bus" }, ...fanOut("fx-bus", typedSubs.map((n) => `fx-${n.id}`))],
    },
    metrics: { rps: 4000, trafficUnit: "events/s", monthlyCostUsd: 300, errorRatePercent: 6 },
  },
};

const wfSteps = [svc("payment", 660, 40), svc("inventory", 660, 160), svc("shipping", 660, 280)];
const workflow: ProblemDef = {
  code: "SSA0044",
  slug: "event-driven-workflow-challenge",
  title: "Event-Driven Workflow Challenge",
  difficulty: "Hard",
  minutes: 25,
  sectionChallenge: true,
  description:
    "Orchard's order workflow spans payment, inventory and shipping services. Steps for the same order sometimes run out of order, duplicates double-reserve stock, and a broker failure once lost a day of events. Design the event backbone: per-order ordering, durable replication, idempotent consumers and a place for messages that keep failing.",
  guide: {
    title: "Required event path",
    description: "Publish workflow events to a partitioned, replicated stream keyed by order; consume idempotently.",
    flow: ["application-server", "event-stream", "worker"],
    secondary: { title: "Failure path", flow: ["worker", "message-queue"] },
    notes: ["Events with the same partition key stay in order.", "Replication factor 3 survives a broker loss."],
  },
  concepts: ["Partitioned ordering", "Replicated logs", "Idempotent consumers"],
  reading: [{ title: "Pub/Sub learning path", description: "Review event-driven workflows.", href: `${PS}#workflow` }],
  components: ["application-server", "event-stream", "worker", "message-queue"],
  checks: [
    connects("application-server", "event-stream", "Publish workflow events to an event stream.", "quality"),
    rule("Partition the stream by order_id so each order's events stay in order.", (c) => E.str(c.first("event-stream")?.config.partitionKey).trim().toLowerCase() === "order_id" && c.n("event-stream", "partitions", 1) >= 3, {
      category: "Ordering",
      label: "Per-order ordering",
      points: 15,
    }),
    rule("Replicate the stream with a replication factor of at least 3.", (c) => c.n("event-stream", "replicationFactor", 1) >= 3, { category: "reliability", label: "Durability", points: 15 }),
    rule("Make every consumer idempotent.", (c) => c.has("worker", 3) && c.all("worker", "idempotent", "Enabled"), { category: "Correctness", label: "Idempotent consumers", points: 15 }),
    rule("Route repeatedly failing messages to a dead-letter queue.", (c) => c.nodes("message-queue").some((q) => E.str(q.config.dlqEnabled) === "Enabled") && c.edge("worker", "message-queue"), {
      category: "reliability",
      label: "Dead letters",
    }),
  ],
  reference: {
    config: ["Event stream: 12 partitions, key order_id, replication factor 3, 72 h retention.", "Payment, inventory and shipping workers are idempotent; failures go to a DLQ-enabled queue."],
    explanation: [
      "Ordering only exists within a partition, so the partition key must be the unit that needs ordering: the order.",
      "Replication factor 3 keeps every event on three brokers; losing one loses nothing.",
      "At-least-once delivery plus idempotent consumers gives effectively-once processing.",
    ],
    graph: {
      nodes: [
        { id: "orders", type: "application-server", x: 60, y: 160 },
        { id: "stream", type: "event-stream", x: 360, y: 160, config: { partitions: 12, partitionKey: "order_id", replicationFactor: 3, retentionHours: 72 } },
        ...wfSteps,
        { id: "dlq", type: "message-queue", x: 960, y: 160, config: { dlqEnabled: "Enabled", maxRetries: 5 } },
      ],
      edges: [{ source: "orders", target: "stream" }, ...fanOut("stream", ids(wfSteps)), ...fanIn(ids(wfSteps), "dlq")],
    },
  },
  fix: {
    description: "Orchard's workflow runs on a single-partition stream with replication factor 1 and non-idempotent consumers. Duplicate events double-reserve stock and a broker crash lost a day of orders. Repair the event backbone.",
    starting: {
      nodes: [
        { id: "fx-orders", type: "application-server", x: 60, y: 160 },
        { id: "fx-stream", type: "event-stream", x: 360, y: 160, config: { partitions: 1, replicationFactor: 1 } },
        ...wfSteps.map((n) => ({ ...n, id: `fx-${n.id}`, config: {} })),
      ],
      edges: [{ source: "fx-orders", target: "fx-stream" }, ...fanOut("fx-stream", wfSteps.map((n) => `fx-${n.id}`))],
    },
    metrics: { rps: 800, trafficUnit: "events/s", monthlyCostUsd: 210, errorRatePercent: 2 },
  },
};

/* ---------------- Idempotency, Ordering & Delivery ---------------- */

const paidTwice: ProblemDef = {
  code: "SSA0045",
  slug: "the-payment-ran-twice",
  title: "The Payment Ran Twice",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Fernhill's mobile app retries a checkout request when it times out. Sometimes the first attempt actually succeeded, so the customer is charged twice. Make retries safe end to end: the API must recognize a repeated request, and the card processor must never charge the same attempt twice.",
  guide: {
    title: "Required payment path",
    description: "Require an idempotency key on writes at the gateway and forward it to the payment processor.",
    flow: ["mobile-client", "api-gateway", "application-server", "payment-gateway"],
    notes: ["The client generates one key per checkout attempt and reuses it on retry."],
  },
  concepts: ["Idempotency keys", "Safe retries"],
  reading: [{ title: "Delivery guarantees learning path", description: "Review idempotency.", href: `${ID}#idempotency` }],
  components: ["mobile-client", "api-gateway", "application-server", "payment-gateway", "postgresql", "redis"],
  checks: [
    rule("Route checkout through the API gateway to the payment service and processor.", (c) => c.path("mobile-client", "api-gateway", "application-server", "payment-gateway"), { label: "Payment path" }),
    rule("Require idempotency keys on write requests at the gateway.", (c) => c.is("api-gateway", "idempotencyKeys", "Required on writes"), { category: "Correctness", label: "API idempotency", points: 20 }),
    rule("Forward idempotency keys to the payment processor.", (c) => c.is("payment-gateway", "idempotencyKeys", "Enabled"), { category: "Correctness", label: "Processor idempotency", points: 20 }),
    rule("Store seen keys durably so a retry gets the original response.", (c) => c.edge("application-server", "postgresql") || c.edge("application-server", "redis"), { category: "quality", label: "Key store" }),
  ],
  reference: {
    config: ["API gateway: idempotency keys required on writes.", "Payment service stores keys and responses in PostgreSQL and sends the key to the processor."],
    explanation: [
      "A timeout tells the client nothing about whether the charge happened. The only safe retry is one the server can recognize.",
      "Storing (key, response) lets the server replay the original result instead of charging again.",
      "Passing the key to the processor protects against the payment service itself retrying.",
    ],
    graph: {
      nodes: [
        { id: "mobile", type: "mobile-client", x: 40, y: 160 },
        { id: "gw", type: "api-gateway", x: 300, y: 160, config: { idempotencyKeys: "Required on writes", auth: "JWT" } },
        { id: "pay", type: "application-server", x: 560, y: 160 },
        { id: "psp", type: "payment-gateway", x: 860, y: 60, config: { idempotencyKeys: "Enabled" } },
        { id: "db", type: "postgresql", x: 860, y: 260 },
      ],
      edges: [
        { source: "mobile", target: "gw" },
        { source: "gw", target: "pay" },
        { source: "pay", target: "psp" },
        { source: "pay", target: "db" },
      ],
    },
  },
  fix: {
    description: "Fernhill charges about 1 in 400 customers twice when the app retries a slow checkout. No layer recognizes repeated requests. Repair the payment path.",
    starting: {
      nodes: [
        { id: "fx-mobile", type: "mobile-client", x: 40, y: 160 },
        { id: "fx-gw", type: "api-gateway", x: 300, y: 160 },
        { id: "fx-pay", type: "application-server", x: 560, y: 160 },
        { id: "fx-psp", type: "payment-gateway", x: 860, y: 60 },
        { id: "fx-db", type: "postgresql", x: 860, y: 260 },
      ],
      edges: [
        { source: "fx-mobile", target: "fx-gw" },
        { source: "fx-gw", target: "fx-pay" },
        { source: "fx-pay", target: "fx-psp" },
        { source: "fx-pay", target: "fx-db" },
      ],
    },
    metrics: { rps: 250, appCpuPercent: 37, monthlyCostUsd: 520, errorRatePercent: 0.25 },
  },
};

const orderedConsumers = column("c", "worker", 2, 660, 160, { idempotent: "Enabled" }, 140);
const outOfOrder: ProblemDef = {
  code: "SSA0046",
  slug: "cancelled-before-created",
  title: "Cancelled Before Created",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Brookline's subscription events go through a best-effort queue consumed by several workers in parallel. Occasionally 'SubscriptionCancelled' is processed before 'SubscriptionCreated' for the same customer, leaving zombie subscriptions that bill forever. Keep parallelism across customers, but process each customer's events in order.",
  guide: {
    title: "Required event path",
    description: "Order events per customer, not globally.",
    flow: ["application-server", "message-queue", "worker"],
    notes: ["FIFO per key keeps one key's events in order while different keys run in parallel."],
  },
  concepts: ["Per-key ordering", "Parallelism vs. ordering"],
  reading: [{ title: "Delivery guarantees learning path", description: "Review ordering guarantees.", href: `${ID}#ordering` }],
  components: ["application-server", "message-queue", "event-stream", "worker"],
  checks: [
    rule("Deliver subscription events to parallel workers.", (c) => (c.path("message-queue", "worker") || c.path("event-stream", "worker")) && c.nodes("worker").length >= 2, { label: "Parallel consumers" }),
    rule("Guarantee ordering per customer (FIFO per key, or a stream partitioned by customer).", (c) => c.is("message-queue", "ordering", "FIFO per key") || E.str(c.first("event-stream")?.config.partitionKey).trim().toLowerCase() === "customer_id", {
      category: "Ordering",
      label: "Per-customer order",
      points: 25,
      fail: "Best-effort delivery lets two events for the same customer race.",
    }),
  ],
  reference: {
    config: ["Message queue with 'FIFO per key' ordering keyed by customer_id, consumed by two worker groups."],
    explanation: [
      "Global ordering would force a single consumer. Per-key ordering keeps one customer's events in sequence while thousands of customers are processed in parallel.",
      "The same idea applies to a log: partition by customer_id and each partition is consumed in order.",
    ],
    graph: {
      nodes: [{ id: "subs", type: "application-server", x: 60, y: 160 }, { id: "q", type: "message-queue", x: 360, y: 160, config: { ordering: "FIFO per key", dlqEnabled: "Enabled", maxRetries: 5 } }, ...orderedConsumers],
      edges: [{ source: "subs", target: "q" }, ...fanOut("q", ids(orderedConsumers))],
    },
  },
  fix: {
    description: "Brookline processes subscription events from a best-effort queue with parallel workers. 0.2% of cancellations run before creation and leave subscriptions that keep billing. Repair the delivery ordering.",
    starting: {
      nodes: [{ id: "fx-subs", type: "application-server", x: 60, y: 160 }, { id: "fx-q", type: "message-queue", x: 360, y: 160 }, ...column("fx-c", "worker", 2, 660, 160, {}, 140)],
      edges: [{ source: "fx-subs", target: "fx-q" }, ...fanOut("fx-q", ["fx-c-1", "fx-c-2"])],
    },
    metrics: { rps: 600, trafficUnit: "events/s", monthlyCostUsd: 290, errorRatePercent: 0.2 },
  },
};

const exactlyOnce: ProblemDef = {
  code: "SSA0047",
  slug: "exactly-once-requirement",
  title: "The Exactly-Once Requirement",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Finance at Lumberly wants every 'credit loyalty points' message applied exactly once. The queue guarantees at-least-once delivery, so duplicates happen during retries and consumer restarts. Design processing that is effectively exactly-once: retries stay on, and duplicates have no effect.",
  guide: {
    title: "Required processing path",
    description: "Keep retries, and make the consumer record processed message ids in the same store as the balance.",
    flow: ["message-queue", "worker", "postgresql"],
    notes: ["Exactly-once delivery doesn't exist across networks; exactly-once effect does."],
  },
  concepts: ["At-least-once delivery", "Idempotent consumers", "Dedup keys"],
  reading: [{ title: "Delivery guarantees learning path", description: "Review delivery semantics.", href: `${ID}#guarantees` }],
  components: ["message-queue", "worker", "postgresql", "redis"],
  checks: [
    rule("Consume the queue with workers that write balances to PostgreSQL.", (c) => c.path("message-queue", "worker", "postgresql"), { label: "Processing path" }),
    rule("Keep retries enabled so no message is lost.", (c) => c.is("message-queue", "retry", "Enabled"), { category: "reliability", label: "At-least-once" }),
    rule("Make the consumer idempotent.", (c) => c.all("worker", "idempotent", "Enabled"), { category: "Correctness", label: "Idempotent consumer", points: 20 }),
    rule("Bound retries and keep a dead-letter queue for messages that never succeed.", (c) => c.is("message-queue", "dlqEnabled", "Enabled") && c.n("message-queue", "maxRetries") > 0, { category: "reliability", label: "Dead letters" }),
  ],
  reference: {
    config: ["Queue with retries (max 5) and DLQ.", "Idempotent workers insert the message id into a processed_messages table in the same transaction as the balance update."],
    explanation: [
      "Turning retries off trades duplicates for lost messages, which finance cannot accept either.",
      "Recording the message id and the balance change atomically means a duplicate finds its id already present and does nothing.",
    ],
    graph: {
      nodes: [
        { id: "q", type: "message-queue", x: 80, y: 160, config: { retry: "Enabled", maxRetries: 5, dlqEnabled: "Enabled" } },
        { id: "wk", type: "worker", x: 400, y: 160, config: { idempotent: "Enabled", instances: 3 } },
        { id: "db", type: "postgresql", x: 720, y: 160 },
      ],
      edges: [
        { source: "q", target: "wk" },
        { source: "wk", target: "db" },
      ],
    },
  },
  fix: {
    description: "Lumberly's loyalty consumers are not idempotent and the queue retries without a cap. Finance found 3,100 double credits last month. Repair processing so every message has exactly one effect.",
    starting: {
      nodes: [
        { id: "fx-q", type: "message-queue", x: 80, y: 160, config: { retry: "Enabled", maxRetries: 0 } },
        { id: "fx-wk", type: "worker", x: 400, y: 160, config: { instances: 3 } },
        { id: "fx-db", type: "postgresql", x: 720, y: 160 },
      ],
      edges: [
        { source: "fx-q", target: "fx-wk" },
        { source: "fx-wk", target: "fx-db" },
      ],
    },
    metrics: { rps: 450, trafficUnit: "messages/s", monthlyCostUsd: 320, errorRatePercent: 0.4 },
  },
};

const outbox: ProblemDef = {
  code: "SSA0048",
  slug: "commit-succeeded-publish-failed",
  title: "Commit Succeeded, Publish Failed",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Hollow Bank's account service commits a transfer to PostgreSQL and then publishes 'TransferCompleted' to the event stream. When the publish fails after the commit, downstream ledgers never hear about real transfers. Make the database write and the event publication succeed or fail together.",
  guide: {
    title: "Required event path",
    description: "Write the event into an outbox table in the same transaction; a relay publishes from the outbox.",
    flow: ["application-server", "postgresql", "worker", "event-stream"],
    notes: ["The relay may publish twice; consumers must tolerate duplicates."],
  },
  concepts: ["Dual-write problem", "Transactional outbox"],
  reading: [{ title: "Delivery guarantees learning path", description: "Review the outbox pattern.", href: `${ID}#outbox` }],
  components: ["application-server", "postgresql", "worker", "event-stream"],
  checks: [
    connects("application-server", "postgresql", "Write transfers to PostgreSQL.", "validity"),
    rule("Enable the transactional outbox on PostgreSQL.", (c) => c.is("postgresql", "outboxPattern", "Enabled"), { category: "Correctness", label: "Outbox", points: 25 }),
    rule("Relay outbox rows to the event stream with a worker.", (c) => c.path("postgresql", "worker", "event-stream"), { category: "Correctness", label: "Relay", points: 15 }),
    rule("Stop the account service from publishing directly.", (c) => !c.edge("application-server", "event-stream"), { category: "quality", label: "Single write" }),
  ],
  reference: {
    config: ["PostgreSQL with the transactional outbox enabled.", "Relay worker reads unpublished outbox rows and publishes them to the event stream."],
    explanation: [
      "Two separate writes (database, then broker) can't be atomic. The outbox turns them into one database transaction.",
      "The relay retries until the stream acknowledges, so an event is never lost, only possibly duplicated.",
    ],
    graph: {
      nodes: [
        { id: "acct", type: "application-server", x: 60, y: 160 },
        { id: "db", type: "postgresql", x: 340, y: 160, config: { outboxPattern: "Enabled" } },
        { id: "relay", type: "worker", x: 620, y: 160, config: { idempotent: "Enabled" } },
        { id: "stream", type: "event-stream", x: 900, y: 160, config: { replicationFactor: 3, partitions: 6 } },
      ],
      edges: [
        { source: "acct", target: "db" },
        { source: "db", target: "relay" },
        { source: "relay", target: "stream" },
      ],
    },
  },
  fix: {
    description: "Hollow Bank's account service commits to PostgreSQL then publishes to the stream separately. About 40 transfers a day are committed but never announced, so ledgers drift. Repair the publication path.",
    starting: {
      nodes: [
        { id: "fx-acct", type: "application-server", x: 60, y: 160 },
        { id: "fx-db", type: "postgresql", x: 340, y: 60 },
        { id: "fx-stream", type: "event-stream", x: 340, y: 280 },
      ],
      edges: [
        { source: "fx-acct", target: "fx-db" },
        { source: "fx-acct", target: "fx-stream" },
      ],
    },
    metrics: { rps: 200, trafficUnit: "transfers/s", monthlyCostUsd: 320, errorRatePercent: 0.01 },
  },
};

/* ---------------- APIs & Service Communication ---------------- */

const bffServices = column("s", "application-server", 3, 640, 160, {}, 120);
const chatty: ProblemDef = {
  code: "SSA0049",
  slug: "the-chatty-mobile-app",
  title: "The Chatty Mobile App",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Sparrow's mobile home screen makes 14 separate API calls over cellular networks, each paying full round-trip latency. Load time on 4G is over five seconds. Put one aggregation point in front of the services so the app makes one call per screen.",
  guide: {
    title: "Required request path",
    description: "The app talks to a backend-for-frontend at the gateway, which fans out to services over the fast internal network.",
    flow: ["mobile-client", "api-gateway", "application-server"],
    notes: ["Round trips are cheap inside the data center and expensive on a phone."],
  },
  concepts: ["Backend for frontend", "Round-trip reduction"],
  reading: [{ title: "APIs learning path", description: "Review aggregation and BFFs.", href: `${AP}#aggregation` }],
  components: ["mobile-client", "api-gateway", "application-server"],
  checks: [
    rule("Route the mobile app through an API gateway.", (c) => c.edge("mobile-client", "api-gateway") && !c.edge("mobile-client", "application-server"), { label: "Single entry point", points: 15 }),
    rule("Aggregate responses with a backend-for-frontend at the gateway.", (c) => c.is("api-gateway", "aggregation", "Backend for frontend"), { category: "Latency", label: "Aggregation", points: 20 }),
    rule("Fan out from the gateway to the backend services.", (c) => c.feeds("api-gateway", "application-server") && c.nodes("application-server").length >= 3, { category: "validity", label: "Service fan-out" }),
  ],
  reference: {
    config: ["Mobile Client -> API Gateway (Backend for frontend) -> profile, feed and offers services."],
    explanation: [
      "Fourteen calls at 300 ms of cellular round trip each is over four seconds of waiting before any server work.",
      "A BFF makes those calls server-side in parallel over a sub-millisecond network and returns one tailored payload.",
    ],
    graph: {
      nodes: [{ id: "mobile", type: "mobile-client", x: 40, y: 160 }, { id: "gw", type: "api-gateway", x: 320, y: 160, config: { aggregation: "Backend for frontend", auth: "JWT" } }, ...bffServices],
      edges: [{ source: "mobile", target: "gw" }, ...fanOut("gw", ids(bffServices))],
    },
  },
  fix: {
    description: "Sparrow's app calls three backend services directly, 14 times per home screen. On 4G the screen takes 5.2 seconds. Repair the API layer.",
    starting: {
      nodes: [{ id: "fx-mobile", type: "mobile-client", x: 40, y: 160 }, ...column("fx-s", "application-server", 3, 400, 160, {}, 120)],
      edges: fanOut("fx-mobile", ["fx-s-1", "fx-s-2", "fx-s-3"]),
    },
    metrics: { rps: 900, appCpuPercent: 46, monthlyCostUsd: 990, p95Ms: 5200 },
  },
};

const internalSvcs = column("int", "application-server", 2, 660, 160, { protocol: "gRPC" }, 140);
const internalCalls: ProblemDef = {
  code: "SSA0050",
  slug: "internal-calls-waste-capacity",
  title: "Internal Calls Waste Capacity",
  difficulty: "Medium",
  minutes: 15,
  description:
    "At Quillon, the edge API calls two internal services thousands of times per second using verbose JSON over HTTP/1.1, opening a new connection for many calls. Profiling shows a third of internal CPU goes to parsing and handshakes. Switch internal service-to-service traffic to an efficient binary protocol over persistent connections.",
  guide: {
    title: "Required request path",
    description: "Keep JSON at the public edge; use gRPC between internal services.",
    flow: ["load-balancer", "application-server", "application-server"],
    notes: ["Set the internal services' protocol to gRPC."],
  },
  concepts: ["Internal protocols", "Serialization overhead"],
  reading: [{ title: "APIs learning path", description: "Review protocol choices.", href: `${AP}#protocols` }],
  components: ["load-balancer", "application-server"],
  checks: [
    rule("Serve public traffic through a load balancer to the edge API.", (c) => c.topology().entry?.type === "load-balancer", { label: "Public edge" }),
    rule("Call at least two internal services from the edge API.", (c) => c.nodes("application-server").filter((s) => E.incoming(c.g, s.id).some((n) => n.type === "application-server")).length >= 2, { category: "validity", label: "Internal calls" }),
    rule("Use gRPC for every internal service.", (c) => {
      const internal = c.nodes("application-server").filter((s) => E.incoming(c.g, s.id).some((n) => n.type === "application-server"));
      return internal.length > 0 && internal.every((s) => E.str(s.config.protocol) === "gRPC");
    }, { category: "Efficiency", label: "Binary protocol", points: 25 }),
  ],
  reference: {
    config: ["Load Balancer -> edge API (HTTPS/JSON) -> two internal services using gRPC."],
    explanation: [
      "Public clients need a universal format; internal services don't. gRPC uses compact binary messages over long-lived HTTP/2 connections.",
      "The saved CPU becomes capacity: the same fleet handles more requests.",
    ],
    graph: {
      nodes: [{ id: "lb", type: "load-balancer", x: 40, y: 160, config: { healthChecks: "Enabled" } }, { id: "edge", type: "application-server", x: 340, y: 160, config: { protocol: "HTTPS" } }, ...internalSvcs],
      edges: [{ source: "lb", target: "edge" }, ...fanOut("edge", ids(internalSvcs))],
    },
  },
  fix: {
    description: "Quillon's internal services exchange JSON over short-lived HTTP connections and burn a third of their CPU on overhead. Repair internal communication.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 40, y: 160 },
        { id: "fx-edge", type: "application-server", x: 340, y: 160 },
        ...column("fx-int", "application-server", 2, 660, 160, { protocol: "HTTP" }, 140),
      ],
      edges: [{ source: "fx-lb", target: "fx-edge" }, ...fanOut("fx-edge", ["fx-int-1", "fx-int-2"])],
    },
    metrics: { rps: 3000, appCpuPercent: 84, monthlyCostUsd: 1170, p95Ms: 380 },
  },
};

const protectApi: ProblemDef = {
  code: "SSA0051",
  slug: "the-public-api-needs-protection",
  title: "The Public API Needs Protection",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Atlas Weather's public API is open to anyone. A few scrapers hammer it at thousands of requests per second and paying customers see errors. Authenticate every client and limit each one to 100 requests per second, with limits enforced consistently across all gateway nodes.",
  guide: {
    title: "Required request path",
    description: "Authenticate at the gateway, rate limit per client, and keep the counters in a shared store.",
    flow: ["web-client", "api-gateway", "application-server"],
    secondary: { title: "Limit counters", flow: ["rate-limiter", "redis"] },
    notes: ["Per-node counters let a client multiply its limit by the number of nodes."],
  },
  concepts: ["Authentication at the edge", "Distributed rate limiting"],
  reading: [{ title: "APIs learning path", description: "Review gateways and rate limits.", href: `${AP}#gateway` }],
  components: ["web-client", "api-gateway", "rate-limiter", "redis", "application-server"],
  checks: [
    rule("Put an API gateway in front of the API servers.", (c) => c.path("web-client", "api-gateway", "application-server"), { label: "Gateway" }),
    rule("Require API keys or JWTs for every request.", (c) => c.nodes("api-gateway").some((g) => E.str(g.config.auth) !== "None"), { category: "Security", label: "Authentication", points: 15 }),
    rule("Limit each client to 100 requests per second or less.", (c) => c.nodes("api-gateway").some((g) => E.num(g.config.rateLimitPerClientRps, 1000) <= 100) || c.nodes("rate-limiter").some((r) => E.str(r.config.scope) === "Per client" && E.num(r.config.requestsPerSecond) <= 100), {
      category: "Security",
      label: "Per-client limit",
      points: 15,
    }),
    rule("Keep rate-limit counters in a shared Redis store.", (c) => c.is("rate-limiter", "store", "Shared (Redis)") && c.edge("rate-limiter", "redis"), { category: "Correctness", label: "Shared counters", points: 15 }),
  ],
  reference: {
    config: ["API gateway with API-key auth and a 100 req/s per-client limit.", "Rate limiter (token bucket, per client) with counters in Redis."],
    explanation: [
      "Authentication gives every request an identity, which is what makes per-client limits possible.",
      "If each gateway node counted locally, a client could get 100 req/s from every node. A shared counter enforces one global limit.",
    ],
    graph: {
      nodes: [
        { id: "client", type: "web-client", x: 40, y: 160 },
        { id: "gw", type: "api-gateway", x: 300, y: 160, config: { auth: "API key", rateLimitPerClientRps: 100 } },
        { id: "rl", type: "rate-limiter", x: 300, y: 360, config: { algorithm: "Token bucket", requestsPerSecond: 100, scope: "Per client", store: "Shared (Redis)" } },
        { id: "redis", type: "redis", x: 600, y: 360, config: { usage: "Rate limit counters" } },
        { id: "api", type: "application-server", x: 600, y: 160, config: { size: "Large" } },
      ],
      edges: [
        { source: "client", target: "gw" },
        { source: "gw", target: "rl" },
        { source: "rl", target: "redis" },
        { source: "gw", target: "api" },
      ],
    },
  },
  fix: {
    description: "Atlas Weather's gateway has no authentication and a 1,000 req/s per-node limit counted locally. Three scrapers take 70% of capacity. Repair the edge protection.",
    starting: {
      nodes: [
        { id: "fx-client", type: "web-client", x: 40, y: 160 },
        { id: "fx-gw", type: "api-gateway", x: 300, y: 160 },
        { id: "fx-api", type: "application-server", x: 600, y: 160, config: { size: "Large" } },
      ],
      edges: [
        { source: "fx-client", target: "fx-gw" },
        { source: "fx-gw", target: "fx-api" },
      ],
    },
    metrics: { rps: 9000, appCpuPercent: 97, monthlyCostUsd: 710, errorRatePercent: 23 },
  },
};

const versionsOf = (c: Ctx) =>
  E.str(c.first("api-gateway")?.config.supportedVersions)
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean);
const versioning: ProblemDef = {
  code: "SSA0052",
  slug: "version-without-breaking-clients",
  title: "Version Without Breaking Clients",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Juno needs to change its orders API in a breaking way, but older mobile app versions stay installed for months. Ship v2 for new clients while every v1 client keeps working, and route each version to the right backend.",
  guide: {
    title: "Required request path",
    description: "Version the API at the gateway and keep both versions live until v1 traffic dies off.",
    flow: ["mobile-client", "api-gateway", "application-server"],
    notes: ["List both versions in the gateway's Supported versions field."],
  },
  concepts: ["API versioning", "Backward compatibility"],
  reading: [{ title: "APIs learning path", description: "Review versioning strategies.", href: `${AP}#versioning` }],
  components: ["mobile-client", "api-gateway", "application-server"],
  checks: [
    rule("Route clients through an API gateway.", (c) => c.path("mobile-client", "api-gateway", "application-server"), { label: "Gateway" }),
    rule("Choose a versioning strategy (URI or header).", (c) => c.nodes("api-gateway").some((g) => E.str(g.config.versioningStrategy) !== "None"), { category: "Compatibility", label: "Strategy", points: 15 }),
    rule("Support both v1 and v2 at the same time.", (c) => versionsOf(c).includes("v1") && versionsOf(c).includes("v2"), { category: "Compatibility", label: "Both versions live", points: 20 }),
    rule("Serve each version from its own backend.", (c) => c.nodes("application-server").filter((s) => E.incoming(c.g, s.id).some((n) => n.type === "api-gateway")).length >= 2, { category: "quality", label: "Version backends" }),
  ],
  reference: {
    config: ["API gateway with URI versioning, supported versions 'v1, v2', routing /v1 and /v2 to separate deployments."],
    explanation: [
      "Mobile clients can't be force-upgraded. A breaking change without versioning breaks every installed app at once.",
      "URI versioning keeps both contracts explicit and easy to route, monitor and eventually retire.",
    ],
    graph: {
      nodes: [
        { id: "mobile", type: "mobile-client", x: 40, y: 160 },
        { id: "gw", type: "api-gateway", x: 320, y: 160, config: { versioningStrategy: "URI versioning", supportedVersions: "v1, v2" } },
        { id: "v1", type: "application-server", x: 640, y: 80 },
        { id: "v2", type: "application-server", x: 640, y: 260 },
      ],
      edges: [
        { source: "mobile", target: "gw" },
        { source: "gw", target: "v1" },
        { source: "gw", target: "v2" },
      ],
    },
  },
  fix: {
    description: "Juno deployed a breaking orders API change in place with no versioning. 38% of mobile users, still on old app versions, now get errors on checkout. Repair the API rollout.",
    starting: {
      nodes: [
        { id: "fx-mobile", type: "mobile-client", x: 40, y: 160 },
        { id: "fx-gw", type: "api-gateway", x: 320, y: 160 },
        { id: "fx-api", type: "application-server", x: 640, y: 160 },
      ],
      edges: [
        { source: "fx-mobile", target: "fx-gw" },
        { source: "fx-gw", target: "fx-api" },
      ],
    },
    metrics: { rps: 700, appCpuPercent: 40, monthlyCostUsd: 420, errorRatePercent: 38 },
  },
};

export const EVENTS_COMMUNICATION: ProblemDef[] = [oneOrder, slowSubscriber, eventSoup, workflow, paidTwice, outOfOrder, exactlyOnce, outbox, chatty, internalCalls, protectApi, versioning];
