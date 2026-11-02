import type { Guide } from "./types";

export const PUBSUB_GUIDE: Guide = {
  sectionId: "advanced-software-system-architecture-section-1",
  kicker: "Section 01 · Advanced",
  title: "Pub/Sub & Event-Driven Systems",
  intro:
    "Events let one part of a system announce that something happened without knowing who cares. This guide covers publish/subscribe fan-out, isolating slow subscribers, designing event contracts that can evolve, logs versus queues, and building workflows on events that stay ordered and correct.",
  byTheEnd: "You can decouple producers from consumers, keep one slow consumer from hurting the others, evolve event schemas safely, and design an event-driven workflow that survives broker failures and duplicates.",
  chapters: [
    {
      id: "pubsub",
      kicker: "Announce, don't call",
      title: "Publish once, react many times",
      navTitle: "Publish/Subscribe",
      summary: "Producers emit events; any number of consumers subscribe.",
      intro: [
        "When an order service calls email, analytics, inventory, loyalty and fraud one after another, every new consumer means a change to the order service, and the slowest consumer sets checkout latency. With pub/sub the order service publishes `OrderPlaced` once; each team subscribes on its own.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Direct calls", tone: "danger", points: ["Producer knows every consumer", "Latency adds up per call", "One failure fails the request"] },
            { title: "Publish/subscribe", tone: "success", points: ["Producer publishes one event", "Consumers react on their own time", "New consumers need no producer change"] },
          ],
        },
        {
          type: "flow",
          steps: [
            { label: "Order service", sub: "OrderPlaced", tone: "info" },
            { label: "Topic", sub: "Fan-out", tone: "warning" },
            { label: "Subscribers", sub: "Email, analytics, inventory...", tone: "success" },
          ],
          caption: "Temporal decoupling: consumers can be slow, down or brand new without the producer noticing.",
        },
      ],
    },
    {
      id: "queue",
      kicker: "One slow consumer",
      title: "Subscriber isolation",
      navTitle: "Subscriber Isolation",
      summary: "Give each subscriber its own backlog.",
      intro: [
        "If subscribers share one delivery stream, the slowest one holds everyone back: messages can't be dropped until all have processed them. With a queue per subscriber, each one builds a private backlog and moves at its own pace.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Shared delivery", tone: "danger", points: ["Slowest subscriber sets the pace", "A lagging warehouse sync delays search", "Failures spread across teams"] },
            { title: "Queue per subscriber", tone: "success", points: ["Private backlog per consumer", "Slow consumers only delay themselves", "Independent retries and alerting"] },
          ],
        },
        { type: "key", text: "Monitor backlog per subscriber. A growing backlog on one subscription is that team's incident, not the platform's." },
      ],
    },
    {
      id: "taxonomy",
      kicker: "Contracts between teams",
      title: "Events, commands and contracts",
      navTitle: "Event Contracts",
      summary: "Name events for facts, version their schemas, never break consumers.",
      intro: [
        "An event is a fact about the past (`OrderPlaced`), a command is a request for the future (`SendInvoice`). Mixing them up creates hidden coupling. Every event is also a contract: consumers depend on its fields, so changes must be compatible.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Change", "Safe?", "Why"],
          rows: [
            ["Add an optional field", "Yes", "Old consumers ignore it"],
            ["Remove a field", "No", "Consumers reading it break"],
            ["Rename a field", "No", "Same as remove plus add"],
            ["Change a field's type", "No", "Parsing fails"],
            ["New event type", "Yes", "Nobody subscribes until they choose to"],
          ],
          caption: "A schema registry enforces these rules at publish time instead of at 3 AM.",
        },
        { type: "warn", text: "Untyped JSON events mean breaking changes are discovered by the consumers that break. Put schemas in a registry and check compatibility before publishing." },
      ],
    },
    {
      id: "replay",
      kicker: "Two kinds of broker",
      title: "Logs vs. queues",
      navTitle: "Logs vs. Queues",
      summary: "Queues delete after delivery; logs keep events for replay.",
      intro: ["A queue removes a message once it's acknowledged. A log keeps events for a retention period and lets each consumer track its own position, so a fixed consumer can rewind and replay what it missed."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Queue", tone: "info", points: ["Message deleted when acknowledged", "Great for work distribution", "No replay"] },
            { title: "Log (event stream)", tone: "accent", points: ["Events retained for hours to weeks", "Each consumer has its own offset", "Replay after bugs or for new consumers"] },
          ],
        },
        { type: "key", text: "Retention turns consumer bugs from data loss into a replay. Keep at least as much history as it takes to notice and fix a broken consumer." },
      ],
    },
    {
      id: "partitions",
      kicker: "Parallelism and order",
      title: "Partitions and ordering",
      navTitle: "Partitions & Ordering",
      summary: "Order exists within a partition, so choose the key carefully.",
      intro: [
        "A log is split into partitions so many consumers can work in parallel. Events with the same key always land in the same partition and are read in order; events in different partitions have no ordering relative to each other.",
      ],
      blocks: [
        { type: "formula", lines: ["max consumer parallelism = number of partitions", "ordering guarantee = per partition key"] },
        {
          type: "table",
          head: ["Workflow", "Partition key", "Ordered per"],
          rows: [
            ["Order lifecycle", "order_id", "Order"],
            ["Chat messages", "conversation_id", "Conversation"],
            ["Account balance changes", "account_id", "Account"],
          ],
        },
      ],
    },
    {
      id: "workflow",
      kicker: "Putting it together",
      title: "Event-driven workflows",
      navTitle: "Event-Driven Workflows",
      summary: "Ordered, durable, idempotent, with somewhere for failures to go.",
      intro: [
        "A workflow such as payment, then inventory, then shipping can run as services reacting to each other's events. It works reliably only with four properties: per-entity ordering, replicated storage, idempotent consumers and a dead-letter path.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Order service", tone: "info" },
            { label: "Stream", sub: "Keyed by order_id, RF 3", tone: "warning" },
            { label: "Idempotent consumers", sub: "Payment, inventory, shipping", tone: "success" },
            { label: "Dead letters", sub: "Repeated failures", tone: "danger" },
          ],
          caption: "Replication factor 3 survives a broker loss; idempotency absorbs redeliveries.",
        },
        {
          type: "compare",
          items: [
            { title: "Choreography", tone: "info", points: ["Services react to each other's events", "No central coordinator", "Harder to see the whole flow"] },
            { title: "Orchestration", tone: "accent", points: ["A coordinator drives each step", "Flow visible in one place", "Coordinator is one more service"] },
          ],
        },
      ],
    },
    {
      id: "pitfalls",
      kicker: "Lessons learned",
      title: "Common pitfalls",
      navTitle: "Common Pitfalls",
      summary: "What goes wrong in event-driven systems.",
      intro: ["Events remove coupling in one place and can add confusion in another. These are the usual traps."],
      blocks: [
        {
          type: "list",
          items: [
            "Event soup: dozens of untyped events nobody owns.",
            "Hidden commands: events that secretly expect exactly one consumer to act.",
            "No correlation ids: impossible to follow one order across services.",
            "Assuming exactly-once delivery: duplicates arrive eventually.",
            "Unbounded retries: one poison event blocks a partition forever.",
          ],
        },
      ],
    },
  ],
};

export const DELIVERY_GUIDE: Guide = {
  sectionId: "advanced-software-system-architecture-section-2",
  kicker: "Section 02 · Advanced",
  title: "Idempotency, Ordering & Delivery Guarantees",
  intro:
    "Networks fail in the middle of requests, so every distributed system eventually sends something twice or out of order. This guide covers delivery guarantees, idempotency keys, idempotent consumers, ordering, and the outbox pattern that keeps databases and events in step.",
  byTheEnd: "You can make retries safe end to end, get effectively-once processing on at-least-once infrastructure, keep per-entity order without losing parallelism, and publish events atomically with database changes.",
  chapters: [
    {
      id: "guarantees",
      kicker: "What brokers promise",
      title: "Delivery guarantees",
      navTitle: "Delivery Guarantees",
      summary: "At-most-once, at-least-once, and the myth of exactly-once.",
      intro: [
        "A sender that gets no acknowledgment can't know whether the message arrived. It can retry (and risk a duplicate) or give up (and risk a loss). That choice defines the delivery guarantee.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Guarantee", "On failure", "Risk", "Typical use"],
          rows: [
            ["At-most-once", "Don't retry", "Lost messages", "Metrics samples, best-effort signals"],
            ["At-least-once", "Retry until acknowledged", "Duplicates", "Almost everything"],
            ["Exactly-once effect", "Retry + idempotent processing", "None, if done right", "Payments, balances, inventory"],
          ],
        },
        { type: "key", text: "Exactly-once delivery across a network isn't achievable; exactly-once effect is. You get it by combining at-least-once delivery with idempotent processing." },
      ],
    },
    {
      id: "idempotency",
      kicker: "Safe retries for APIs",
      title: "Idempotency keys",
      navTitle: "Idempotency Keys",
      summary: "The client names each attempt; the server remembers the answer.",
      intro: [
        "A mobile app retries a checkout after a timeout, but the first attempt actually charged the card. To make the retry safe, the client generates one key per checkout attempt and sends it with every retry. The server stores the key with the result and returns the stored result for repeats.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Client", sub: "Key: 7f3c...", tone: "info" },
            { label: "API", sub: "Seen this key?", tone: "warning" },
            { label: "Key store", sub: "Key + response", tone: "accent" },
            { label: "Processor", sub: "Same key forwarded", tone: "success" },
          ],
          caption: "Pass the key downstream too, so the payment processor also refuses to charge twice.",
        },
        {
          type: "list",
          items: [
            "Generate the key on the client, once per logical operation.",
            "Store key, request fingerprint and response atomically with the side effect.",
            "Keep keys long enough to cover realistic retry windows (hours to days).",
            "Reject a reused key with a different request body.",
          ],
        },
      ],
    },
    {
      id: "dedupe",
      kicker: "Safe retries for consumers",
      title: "Idempotent consumers",
      navTitle: "Idempotent Consumers",
      summary: "Record what you processed in the same transaction as the effect.",
      intro: [
        "A queue consumer that credits loyalty points will eventually see the same message twice. If it records the message id in a processed-messages table inside the same transaction as the credit, a duplicate finds its id already there and does nothing.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Naturally idempotent", tone: "success", points: ["SET status = 'shipped'", "Upsert by id", "Repeating changes nothing"] },
            { title: "Needs dedupe", tone: "warning", points: ["balance = balance + 10", "Append a row", "Repeating double-counts"] },
          ],
        },
        { type: "warn", text: "Recording the id and applying the effect in separate steps reopens the gap. They must commit together or not at all." },
      ],
    },
    {
      id: "ordering",
      kicker: "Before and after",
      title: "Ordering",
      navTitle: "Ordering",
      summary: "Order per key keeps parallelism; global order kills it.",
      intro: [
        "Processing 'SubscriptionCancelled' before 'SubscriptionCreated' leaves a zombie subscription. Most systems don't need every event in global order, only each customer's events in order. FIFO per key, or a log partitioned by customer, gives exactly that.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Best-effort order", tone: "danger", points: ["Parallel workers race", "Same customer's events reorder", "Cancel before create"] },
            { title: "FIFO per key", tone: "success", points: ["Each key processed in order", "Different keys in parallel", "Throughput scales with keys"] },
          ],
        },
        { type: "key", text: "When order can't be guaranteed, carry a version or sequence number and have consumers ignore anything older than what they've already applied." },
      ],
    },
    {
      id: "outbox",
      kicker: "Two writes, one outcome",
      title: "The dual-write problem and the outbox",
      navTitle: "Transactional Outbox",
      summary: "Write the event in the same transaction as the data.",
      intro: [
        "Committing a transfer to the database and then publishing `TransferCompleted` are two separate writes. If the process dies between them, the database says the transfer happened and nobody downstream ever hears about it.",
        "The outbox pattern writes the event into an outbox table in the same transaction. A relay reads the outbox and publishes, retrying until the broker acknowledges.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Service", tone: "info" },
            { label: "Database", sub: "Row + outbox entry, one commit", tone: "success" },
            { label: "Relay", sub: "Publishes, retries", tone: "warning" },
            { label: "Event stream", tone: "accent" },
          ],
          caption: "The relay may publish an event twice, never zero times. Consumers handle the duplicate.",
        },
        { type: "terms", items: [["Change data capture", "Reading the database's own change log to publish events; an alternative relay with no outbox table polling."]] },
      ],
    },
    {
      id: "sagas",
      kicker: "Multi-step without locks",
      title: "Sagas and compensation",
      navTitle: "Sagas",
      summary: "Undo with new actions instead of distributed transactions.",
      intro: ["A booking that reserves a flight, a hotel and a car across three services can't hold one transaction open across all of them. A saga runs each step as a local transaction and, if a later step fails, runs compensating actions for the earlier ones."],
      blocks: [
        {
          type: "table",
          head: ["Step", "Action", "Compensation"],
          rows: [
            ["1", "Reserve flight", "Cancel flight"],
            ["2", "Reserve hotel", "Cancel hotel"],
            ["3", "Charge card", "Refund card"],
          ],
        },
      ],
    },
  ],
};

export const APIS_GUIDE: Guide = {
  sectionId: "advanced-software-system-architecture-section-3",
  kicker: "Section 03 · Advanced",
  title: "APIs & Service Communication",
  intro:
    "APIs are where clients and services meet, and where most of the slow, chatty or fragile communication starts. This guide covers API gateways, backends for frontends, choosing protocols, rate limiting, authentication at the edge, and versioning without breaking anyone.",
  byTheEnd: "You can design an API edge that authenticates and protects the system, cut client round trips, pick the right protocol per hop, and evolve APIs while old clients keep working.",
  chapters: [
    {
      id: "gateway",
      kicker: "One front door",
      title: "API gateways",
      navTitle: "API Gateways",
      summary: "Cross-cutting concerns handled once, at the edge.",
      intro: [
        "An API gateway sits in front of the services and handles the things every request needs: authentication, rate limiting, routing to the right backend, request shaping and sometimes aggregation. Services behind it stay focused on business logic.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Clients", tone: "info" },
            { label: "Gateway", sub: "Auth, limits, routing", tone: "warning" },
            { label: "Services", sub: "Business logic", tone: "success" },
          ],
          caption: "Policies live in one place instead of being reimplemented in every service.",
        },
      ],
    },
    {
      id: "aggregation",
      kicker: "Fewer round trips",
      title: "Backend for frontend",
      navTitle: "Backend for Frontend",
      summary: "Let a server make the many calls a phone shouldn't.",
      intro: [
        "A mobile home screen that makes fourteen API calls over cellular pays fourteen round trips of 150–300 ms each. A backend for frontend (BFF) makes those calls inside the data center, in parallel, and returns one payload shaped for the screen.",
      ],
      blocks: [
        { type: "formula", lines: ["client latency ≈ round trips x network RTT + server time", "14 x 300 ms ≈ 4.2 s of waiting, versus 1 x 300 ms with a BFF"] },
        {
          type: "compare",
          items: [
            { title: "Client calls services", tone: "danger", points: ["Many round trips over slow links", "Client stitches data together", "Every service exposed publicly"] },
            { title: "Backend for frontend", tone: "success", points: ["One round trip per screen", "Parallel calls on a fast network", "Payload tailored to the client"] },
          ],
        },
      ],
    },
    {
      id: "protocols",
      kicker: "Right tool per hop",
      title: "Choosing a protocol",
      navTitle: "Protocols",
      summary: "JSON at the edge, binary inside, where it pays.",
      intro: ["Public APIs favour formats every client understands. Internal calls between your own services can use compact binary encodings over long-lived connections, saving CPU on both sides."],
      blocks: [
        {
          type: "table",
          head: ["Protocol", "Strengths", "Watch out for", "Typical place"],
          rows: [
            ["REST + JSON", "Universal, cacheable, easy to debug", "Verbose, many round trips", "Public APIs"],
            ["gRPC (HTTP/2 + protobuf)", "Compact, fast, streaming, typed contracts", "Harder from browsers", "Service to service"],
            ["GraphQL", "Clients ask for exactly what they need", "Query cost control, caching", "Client-facing aggregation"],
          ],
        },
        { type: "key", text: "Serialization and connection setup are real CPU. At thousands of internal calls per second, a binary protocol over persistent connections frees capacity you're already paying for." },
      ],
    },
    {
      id: "rate-limits",
      kicker: "Protecting the system",
      title: "Rate limiting",
      navTitle: "Rate Limiting",
      summary: "Per-client limits, smooth algorithms, shared counters.",
      intro: [
        "Without limits, a few scrapers can take most of your capacity. Rate limits give each client a fair share, but only if they're per client, smooth across window boundaries, and enforced globally rather than per gateway node.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Algorithm", "Behaviour", "Trade-off"],
          rows: [
            ["Fixed window", "Count per calendar second/minute", "Allows 2x bursts at window edges"],
            ["Sliding window", "Count over the last N seconds", "Smooth, slightly more state"],
            ["Token bucket", "Tokens refill at a rate; bursts up to bucket size", "Smooth with controlled bursts"],
          ],
        },
        { type: "warn", text: "Counting locally on each of 40 gateway nodes lets a client get 40 times its limit. Keep counters in a shared store." },
      ],
    },
    {
      id: "auth",
      kicker: "Who is calling",
      title: "Authentication at the edge",
      navTitle: "Authentication",
      summary: "Verify identity once, pass it inward.",
      intro: ["Every request should carry an identity: an API key for server-to-server clients, a signed token (JWT) for users and services. The gateway verifies it once and forwards the identity, which is also what makes per-client rate limits possible."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "API keys", tone: "info", points: ["Simple for partners", "Revocable per client", "Must be kept secret and rotated"] },
            { title: "Signed tokens (JWT)", tone: "accent", points: ["Verified without a lookup", "Carry claims such as scopes", "Short expiry limits damage"] },
          ],
        },
      ],
    },
    {
      id: "versioning",
      kicker: "Changing without breaking",
      title: "Versioning and compatibility",
      navTitle: "Versioning",
      summary: "Keep old versions alive while clients migrate.",
      intro: [
        "Mobile apps stay installed for months, so a breaking API change breaks real users. Make additive changes where possible; when you must break, ship a new version, run both side by side, and retire the old one when its traffic is gone.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "URI versioning", tone: "info", points: ["/v1/orders, /v2/orders", "Explicit and easy to route", "Easy to monitor per version"] },
            { title: "Header versioning", tone: "accent", points: ["Accept-Version: 2", "Clean URLs", "Less visible in logs and caches"] },
          ],
        },
        { type: "list", ordered: true, items: ["Add fields instead of changing them.", "Ship v2 next to v1.", "Measure v1 traffic and announce a deprecation date.", "Retire v1 only when traffic is negligible."] },
      ],
    },
    {
      id: "deadlines",
      kicker: "Time budgets",
      title: "Timeouts and deadlines",
      navTitle: "Timeouts & Deadlines",
      summary: "Every call needs a timeout that fits the caller's budget.",
      intro: ["A request with a 2-second budget that calls three services in sequence can't let each of them take 2 seconds. Propagate a deadline with the request so every hop knows how much time is left and gives up early instead of doing work nobody will wait for."],
      blocks: [
        { type: "key", text: "Timeouts should shrink as requests go deeper. An inner timeout longer than the outer one wastes work on answers that arrive after the caller has given up." },
      ],
    },
  ],
};
