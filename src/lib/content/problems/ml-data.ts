import type { ProblemDef } from "../types";
import { configIs, fmt, node as n, numberAtLeast, numberAtMost, rule, wire as w } from "../builders";
import type { Ctx } from "@/lib/sim/evaluate";
import * as E from "@/lib/sim/engine";

const SEC = (n: number) => `/tracks/ml-data-foundations/sections/ml-ai-system-design-section-${n}`;

const reaches = (c: Ctx, fromType: string, toType: string) =>
  c.nodes(fromType).some((f) => [...E.reachable(c.g, f.id)].some((id) => c.g.nodes.find((x) => x.id === id)?.type === toType));
const idempotentWorkers = (c: Ctx) => c.has("worker") && c.all("worker", "idempotent", "Enabled");
const immutableDatasets = (c: Ctx) => c.nodes("dataset-store").some((d) => E.str(d.config.versioning) === "Immutable snapshots");
const durableScheduler = (c: Ctx, target = "worker") =>
  c.nodes("job-scheduler").some((j) => E.str(j.config.durability) === "Durable store" && E.outgoing(c.g, j.id).some((x) => x.type === target));
const onlineStore = (c: Ctx) => c.nodes("feature-store").some((f) => E.str(f.config.onlineStore, "None") !== "None");
const onlineLookups = (c: Ctx) => c.edge("model-server", "feature-store") && c.all("model-server", "featureLookup", "Online feature store");
const modelRps = (c: Ctx) =>
  c.nodes("model-server").filter((m) => E.incoming(c.g, m.id).length > 0).reduce((s, m) => s + E.serverCapacityRps(m), 0);

/* ---------------- ML System Architecture Fundamentals ---------------- */

const oneServer: ProblemDef = {
  code: "ML0001",
  slug: "training-and-serving-on-one-server",
  title: "Training and Serving on One Server",
  difficulty: "Easy",
  minutes: 15,
  description:
    "Juniper Bank retrains its churn model every night on the same two servers that answer prediction requests. While training runs, prediction latency jumps from 40 ms to two seconds. Separate the two: training reads historical data and publishes a model, and serving loads the published model behind a load balancer.",
  guide: {
    title: "Training and serving paths",
    description: "Training produces an artifact; serving consumes it. The two never share machines.",
    flow: ["dataset-store", "training-job", "model-registry", "model-server"],
    secondary: { title: "Prediction requests", flow: ["load-balancer", "model-server"] },
    notes: ["Training is a batch workload; serving is latency-sensitive."],
  },
  concepts: ["The training/serving boundary", "Model artifacts"],
  reading: [{ title: "ML fundamentals learning path", description: "Review how a model becomes a system.", href: `${SEC(1)}#boundary` }],
  components: ["load-balancer", "model-server", "training-job", "dataset-store", "object-storage", "model-registry"],
  checks: [
    rule("Serve predictions from model servers behind a load balancer.", (c) => c.path("load-balancer", "model-server"), { category: "validity", label: "Serving path" }),
    rule("Train in a separate training job that reads historical data.", (c) => c.nodes("training-job").some((t) => E.incoming(c.g, t.id).some((x) => x.category === "database")), {
      category: "Isolation",
      label: "Separate training",
      points: 20,
    }),
    rule("Publish trained models to a registry that the model servers load from.", (c) => c.path("training-job", "model-registry", "model-server"), { label: "Model hand-off", points: 15 }),
    rule("Keep training off the request path.", (c) => c.has("training-job") && !reaches(c, "load-balancer", "training-job"), { category: "Isolation", label: "No shared path", points: 15 }),
  ],
  reference: {
    config: ["Dataset store -> nightly training job -> model registry -> model servers (Medium x2) behind a load balancer."],
    explanation: [
      "Training saturates CPU and memory for hours; serving needs predictable headroom every second. They belong on different machines.",
      "The registry is the only connection between the two, so a training failure can never take predictions down.",
    ],
    graph: {
      nodes: [
        n("lb", "load-balancer", 40, 100, { healthChecks: "Enabled" }),
        n("serve", "model-server", 300, 100, { size: "Medium", instances: 2 }),
        n("data", "dataset-store", 40, 300, { versioning: "Immutable snapshots" }),
        n("train", "training-job", 300, 300, { gpuType: "T4", gpuCount: 1 }),
        n("registry", "model-registry", 560, 200),
      ],
      edges: w("lb>serve", "data>train>registry>serve"),
    },
  },
};

const batchOrOnline: ProblemDef = {
  code: "ML0002",
  slug: "weekly-emails-and-instant-fraud-checks",
  title: "Weekly Emails and Instant Fraud Checks",
  difficulty: "Easy",
  minutes: 15,
  description:
    "Pellucid has two models. One picks product recommendations for a weekly email to 20 million customers; the other scores fraud while a customer waits at checkout and must answer within 100 ms. Today both run as on-demand APIs, and the email job hammers the fraud servers every Monday. Give each model the prediction style it needs.",
  guide: {
    title: "Two prediction styles",
    description: "Precompute what can wait; score live only what must be live.",
    flow: ["job-scheduler", "batch-scoring-job", "dynamodb"],
    secondary: { title: "Live scoring", flow: ["load-balancer", "application-server", "model-server"] },
    notes: ["Batch predictions are just rows to look up later."],
  },
  concepts: ["Batch vs. online prediction", "Latency budgets"],
  reading: [{ title: "ML fundamentals learning path", description: "Review prediction styles.", href: `${SEC(1)}#batch-vs-online` }],
  components: ["job-scheduler", "batch-scoring-job", "dataset-store", "dynamodb", "load-balancer", "application-server", "model-server"],
  checks: [
    rule("Precompute weekly recommendations with a scheduled batch scoring job.", (c) => c.path("job-scheduler", "batch-scoring-job"), { category: "Design", label: "Batch scoring", points: 15 }),
    rule("Write batch scores to a store that the email service reads.", (c) => c.nodes("batch-scoring-job").some((b) => E.outgoing(c.g, b.id).some((x) => x.category === "database")), {
      category: "validity",
      label: "Score store",
    }),
    rule("Score fraud online: checkout calls a model server directly.", (c) => c.path("load-balancer", "application-server", "model-server"), { category: "Design", label: "Online scoring", points: 15 }),
    numberAtMost("model-server", "timeoutMs", 100, "Time out fraud predictions after 100 ms or less.", "Latency", 15),
    configIs("model-server", "fallback", "Cached / default prediction", "Fall back to a default decision if the model can't answer in time.", "reliability", 10),
  ],
  reference: {
    config: [
      "Weekly: scheduler -> batch scoring job (4 instances) reading the dataset store -> recommendations in DynamoDB.",
      "Live: load balancer -> checkout -> fraud model server (80 ms timeout, default-decision fallback).",
    ],
    explanation: [
      "Nobody is waiting on the weekly email, so its predictions can be computed in bulk at the cheapest time.",
      "Fraud must be scored with what's happening now, inside the checkout's latency budget, with a safe answer if the model is slow.",
    ],
    graph: {
      nodes: [
        n("sched", "job-scheduler", 40, 80, { schedule: "0 2 * * 1", durability: "Durable store" }),
        n("data", "dataset-store", 40, 220),
        n("batch", "batch-scoring-job", 300, 140, { instances: 4 }),
        n("recs", "dynamodb", 560, 140),
        n("lb", "load-balancer", 40, 380, { healthChecks: "Enabled" }),
        n("checkout", "application-server", 300, 380, { size: "Large", instances: 2 }),
        n("fraud", "model-server", 560, 380, { size: "Medium", instances: 2, timeoutMs: 80, fallback: "Cached / default prediction" }),
      ],
      edges: w("sched>batch>recs", "data>batch", "lb>checkout>fraud"),
    },
  },
};

const twoPlaces: ProblemDef = {
  code: "ML0003",
  slug: "features-computed-twice",
  title: "Features Computed Twice",
  difficulty: "Medium",
  minutes: 15,
  description:
    "At Larchfield the data science team computes features in SQL for training, while the serving team re-implements them in Java. The two versions disagree just enough that the model scores 0.89 AUC offline and 0.76 in production. Put a feature layer between data and models so training and serving read the same features.",
  guide: {
    title: "Feature layer",
    description: "One feature store feeds training offline and serving online from a single set of definitions.",
    flow: ["event-stream", "worker", "feature-store", "training-job"],
    secondary: { title: "Serving", flow: ["load-balancer", "model-server", "feature-store"] },
    notes: ["Point-in-time joins stop training rows from seeing values that came later."],
  },
  concepts: ["Feature stores", "Training/serving consistency"],
  reading: [{ title: "ML fundamentals learning path", description: "Review the feature layer.", href: `${SEC(1)}#feature-layer` }],
  components: ["event-stream", "worker", "feature-store", "training-job", "model-registry", "load-balancer", "model-server"],
  checks: [
    rule("Train from a feature store.", (c) => c.edge("feature-store", "training-job"), { category: "validity", label: "Offline features" }),
    configIs("feature-store", "sharedDefinitions", "Enabled", "Define each feature once, for both training and serving.", "Consistency", 20),
    rule("Serve features from the feature store's online tier.", (c) => onlineStore(c) && onlineLookups(c), { category: "Consistency", label: "Online features", points: 15 }),
    configIs("feature-store", "pointInTimeJoins", "Enabled", "Build training sets with point-in-time joins.", "Correctness", 15),
  ],
  reference: {
    config: ["Events -> feature pipeline -> feature store (shared definitions, point-in-time joins, Redis online tier).", "Training reads offline; model servers read online."],
    explanation: [
      "Two implementations of a feature always drift. One definition, served two ways, can't.",
      "The offline and online tiers are the same features at different latencies.",
    ],
    graph: {
      nodes: [
        n("events", "event-stream", 40, 300, { partitions: 6, replicationFactor: 3 }),
        n("pipe", "worker", 260, 300, { instances: 2 }),
        n("fs", "feature-store", 500, 300, { onlineStore: "Redis", freshness: "Hourly batch", pointInTimeJoins: "Enabled", sharedDefinitions: "Enabled" }),
        n("train", "training-job", 740, 380),
        n("registry", "model-registry", 980, 240),
        n("lb", "load-balancer", 260, 100, { healthChecks: "Enabled" }),
        n("serve", "model-server", 500, 100, { size: "Medium", instances: 2, featureLookup: "Online feature store" }),
      ],
      edges: w("events>pipe>fs>train>registry>serve", "lb>serve>fs"),
    },
  },
};

const notebookToProd: ProblemDef = {
  code: "ML0004",
  slug: "from-notebook-to-production",
  title: "From Notebook to Production",
  difficulty: "Medium",
  minutes: 20,
  description:
    "Ostrava's demand model lives in a data scientist's notebook. To ship a new version they email a model file to an engineer, who copies it onto the servers. Nobody knows which data trained the current model or whether it's working. Design the end-to-end path from versioned data to monitored predictions.",
  guide: {
    title: "End-to-end ML path",
    description: "Versioned data in, tracked training, staged promotion, monitored serving.",
    flow: ["dataset-store", "training-job", "model-registry", "model-server"],
    extra: [
      { title: "Tracking", flow: ["training-job", "experiment-tracker"] },
      { title: "Monitoring", flow: ["model-server", "telemetry-collector", "metrics-store"] },
    ],
    notes: ["Every arrow here replaces a manual step that used to go wrong."],
  },
  concepts: ["ML system lifecycle", "Production monitoring"],
  reading: [{ title: "ML fundamentals learning path", description: "Review the full lifecycle.", href: `${SEC(1)}#lifecycle` }],
  components: ["dataset-store", "training-job", "experiment-tracker", "model-registry", "load-balancer", "model-server", "telemetry-collector", "metrics-store"],
  checks: [
    rule("Train from immutable dataset snapshots.", (c) => immutableDatasets(c) && c.edge("dataset-store", "training-job"), { category: "Reproducibility", label: "Versioned data", points: 15 }),
    rule("Track every training run.", (c) => c.edge("training-job", "experiment-tracker"), { category: "Reproducibility", label: "Run tracking" }),
    rule("Promote models through a staged registry to the model servers.", (c) => c.path("training-job", "model-registry", "model-server") && c.is("model-registry", "promotion", "Staged (staging -> production)"), {
      category: "Release safety",
      label: "Staged promotion",
      points: 15,
    }),
    rule("Serve behind a load balancer.", (c) => c.path("load-balancer", "model-server"), { category: "validity", label: "Serving" }),
    rule("Monitor predictions with percentile metrics.", (c) => c.path("model-server", "telemetry-collector", "metrics-store") && c.is("metrics-store", "aggregation", "Percentiles (p50/p95/p99)"), {
      category: "Visibility",
      label: "Monitoring",
    }),
  ],
  reference: {
    config: [
      "Dataset store (immutable snapshots) -> training job -> experiment tracker and staged model registry -> model servers.",
      "Model servers report latency and prediction metrics to a percentile metrics store.",
    ],
    explanation: [
      "Each manual step (copying files, remembering data versions) becomes a recorded, repeatable one.",
      "Monitoring closes the loop: you find out a model is failing from a dashboard, not from customers.",
    ],
    graph: {
      nodes: [
        n("data", "dataset-store", 40, 240, { versioning: "Immutable snapshots" }),
        n("train", "training-job", 260, 240),
        n("tracker", "experiment-tracker", 260, 60, { logCodeVersion: "Enabled", logDataVersion: "Enabled", logHyperparameters: "Enabled" }),
        n("registry", "model-registry", 500, 240, { promotion: "Staged (staging -> production)", immutableVersions: "Enabled" }),
        n("lb", "load-balancer", 500, 420, { healthChecks: "Enabled" }),
        n("serve", "model-server", 740, 240, { size: "Medium", instances: 2 }),
        n("collector", "telemetry-collector", 980, 240),
        n("metrics", "metrics-store", 1220, 240, { aggregation: "Percentiles (p50/p95/p99)", retentionDays: 30 }),
      ],
      edges: w("data>train>registry>serve>collector>metrics", "train>tracker", "lb>serve"),
    },
  },
};

/* ---------------- Data Collection & Labeling ---------------- */

const lostClicks: ProblemDef = {
  code: "ML0005",
  slug: "lost-click-events",
  title: "Lost Click Events",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Nimbus's app servers insert every click straight into PostgreSQL to build the recommender's training data. At the evening peak of 40,000 events per second, inserts time out and about 8% of events are silently dropped, which skews the data toward quiet hours. Capture events durably without slowing the app, land them in the data lake, and keep three days available for replay.",
  guide: {
    title: "Event capture path",
    description: "App servers publish to a replicated stream; a consumer lands events in object storage.",
    flow: ["load-balancer", "application-server", "event-stream", "worker", "object-storage"],
    notes: ["Dropped events aren't random: they bias training data toward low-traffic periods."],
  },
  concepts: ["Event capture", "Replayable logs"],
  reading: [{ title: "Data collection learning path", description: "Review event capture.", href: `${SEC(2)}#events` }],
  components: ["load-balancer", "application-server", "event-stream", "worker", "object-storage", "postgresql"],
  checks: [
    rule("Publish click events from the app servers to an event stream.", (c) => c.edge("application-server", "event-stream"), { category: "validity", label: "Event stream" }),
    rule("Replicate the stream 3 ways across at least 12 partitions.", (c) => c.nodes("event-stream").some((s) => E.num(s.config.replicationFactor) >= 3 && E.num(s.config.partitions) >= 12), {
      category: "reliability",
      label: "Durable stream",
      points: 15,
    }),
    numberAtLeast("event-stream", "retentionHours", 72, "Keep at least 72 hours in the stream for replays.", "reliability", 10),
    rule("Land events in object storage with a stream consumer.", (c) => c.path("event-stream", "worker", "object-storage"), { category: "validity", label: "Data lake", points: 15 }),
    rule("Make the landing consumer idempotent so replays don't duplicate events.", idempotentWorkers, { category: "Correctness", label: "Idempotent landing" }),
  ],
  reference: {
    config: ["App servers -> event stream (24 partitions, RF 3, 72 h) -> idempotent landing workers -> object storage."],
    explanation: [
      "A replicated stream absorbs peaks that a transactional database can't, and the app gets an acknowledgment in milliseconds.",
      "Retention turns a consumer bug into a replay instead of a permanent hole in the data.",
    ],
    graph: {
      nodes: [
        n("lb", "load-balancer", 40, 200, { healthChecks: "Enabled" }),
        n("app", "application-server", 260, 200, { size: "Large", instances: 4 }),
        n("stream", "event-stream", 500, 200, { partitions: 24, replicationFactor: 3, retentionHours: 72 }),
        n("lander", "worker", 740, 200, { instances: 4, idempotent: "Enabled" }),
        n("lake", "object-storage", 980, 200),
      ],
      edges: w("lb>app>stream>lander>lake"),
    },
  },
};

const lateLabels: ProblemDef = {
  code: "ML0006",
  slug: "labels-arrive-weeks-later",
  title: "Labels Arrive Weeks Later",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Ridgeway's fraud model learns from chargebacks, which arrive up to 60 days after a purchase. The training pipeline joins today's features with whatever labels exist, so recent purchases look legitimate and the model learns that fraud is rarer than it is. Record what the model saw at decision time, join labels only after they've matured, and split training data by time.",
  guide: {
    title: "Label pipeline",
    description: "Log predictions with their features, then join matured labels on a schedule into time-split snapshots.",
    flow: ["model-server", "event-stream", "worker", "object-storage"],
    secondary: { title: "Label join", flow: ["job-scheduler", "worker", "dataset-store"] },
    notes: ["A purchase without a chargeback yet isn't legitimate. It's unlabeled."],
  },
  concepts: ["Delayed labels", "Decision-time feature logging"],
  reading: [{ title: "Data collection learning path", description: "Review label latency.", href: `${SEC(2)}#late-labels` }],
  components: ["load-balancer", "application-server", "model-server", "event-stream", "worker", "object-storage", "postgresql", "job-scheduler", "dataset-store"],
  checks: [
    rule("Log each prediction with its features at decision time.", (c) => c.edge("model-server", "event-stream"), { category: "Correctness", label: "Decision log", points: 15 }),
    rule("Land the prediction log in object storage.", (c) => c.path("event-stream", "worker", "object-storage"), { category: "validity", label: "Prediction log" }),
    rule("Join matured labels on a schedule with a durable job.", (c) => durableScheduler(c), { label: "Scheduled join" }),
    rule("Write training sets as immutable snapshots split by time.", (c) => c.nodes("dataset-store").some((d) => E.str(d.config.versioning) === "Immutable snapshots" && E.str(d.config.splitStrategy) === "By time"), {
      category: "Correctness",
      label: "Time split",
      points: 20,
    }),
  ],
  reference: {
    config: [
      "Fraud model server logs predictions and features -> event stream -> landing worker -> object storage.",
      "Daily scheduled join (labels from the payments database, 60-day maturity) -> dataset store (immutable, split by time).",
    ],
    explanation: [
      "Features recomputed later can include information that wasn't available at decision time; the decision log can't.",
      "Splitting by time and waiting for labels to mature makes offline evaluation reflect what production will see.",
    ],
    graph: {
      nodes: [
        n("lb", "load-balancer", 40, 120, { healthChecks: "Enabled" }),
        n("checkout", "application-server", 260, 120, { size: "Large", instances: 2 }),
        n("fraud", "model-server", 500, 120, { size: "Medium", instances: 2 }),
        n("plog", "event-stream", 740, 120, { partitions: 6, replicationFactor: 3 }),
        n("lander", "worker", 980, 120, { instances: 2, idempotent: "Enabled" }),
        n("lake", "object-storage", 1220, 120),
        n("labels", "postgresql", 980, 300),
        n("sched", "job-scheduler", 740, 440, { schedule: "0 4 * * *", durability: "Durable store" }),
        n("join", "worker", 1220, 300, { instances: 2, idempotent: "Enabled" }),
        n("ds", "dataset-store", 1460, 300, { versioning: "Immutable snapshots", splitStrategy: "By time" }),
      ],
      edges: w("lb>checkout>fraud>plog>lander>lake>join>ds", "labels>join", "sched>join", "checkout>labels"),
    },
  },
};

const ITEMS_PER_LABELER_WEEK = 40 * 40;
const labelDemand = (c: Ctx) => {
  const q = c.first("labeling-queue");
  const share = E.str(q?.config.activeLearning) === "Enabled" ? 0.4 : 1;
  const reviews = E.str(q?.config.reviewMode) === "Consensus (2 of 3)" ? 2.5 : 1;
  return 200000 * share * reviews;
};
const labelCapacity = (c: Ctx) => c.nodes("labeling-queue").reduce((s, q) => s + Math.max(0, E.num(q.config.labelers, 10)) * ITEMS_PER_LABELER_WEEK, 0);
const labelCost = (c: Ctx) => c.nodes("labeling-queue").reduce((s, q) => s + E.nodeCostUsd(q), 0);
const labelingBacklog: ProblemDef = {
  code: "ML0007",
  slug: "the-labeling-backlog",
  title: "The Labeling Backlog",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Kestrel Vision collects 200,000 new images a week that need labels. Each labeler completes about 40 items an hour over a 40-hour week and costs $400 a month on the platform. Single-reviewer labels have a 9% error rate that caps model quality. Keep up with the weekly volume, raise label quality, and stay within $60,000 a month.",
  guide: {
    title: "Labeling path",
    description: "Unlabeled images flow through a labeling queue into versioned datasets.",
    flow: ["object-storage", "labeling-queue", "dataset-store", "training-job"],
    notes: ["Consensus review averages about 2.5 labels per item.", "Active learning sends only the ~40% of images the model is unsure about."],
  },
  concepts: ["Labeling throughput", "Active learning", "Label quality"],
  reading: [{ title: "Data collection learning path", description: "Review human labeling.", href: `${SEC(2)}#labeling` }],
  components: ["object-storage", "labeling-queue", "dataset-store", "training-job"],
  checks: [
    rule("Route unlabeled images from storage through a labeling queue into the dataset store.", (c) => c.path("object-storage", "labeling-queue", "dataset-store"), { category: "validity", label: "Labeling path" }),
    configIs("labeling-queue", "reviewMode", "Consensus (2 of 3)", "Use consensus labeling so one labeler's mistake doesn't become ground truth.", "Quality", 15),
    configIs("labeling-queue", "activeLearning", "Enabled", "Send only the images the model is least sure about (active learning).", "cost", 10),
    rule("Give labelers enough capacity for the weekly demand.", (c) => labelCapacity(c) >= labelDemand(c), {
      category: "capacity",
      label: "Throughput",
      points: 20,
      pass: (c) => `Labelers handle ${fmt(labelCapacity(c))} labels a week against ${fmt(labelDemand(c))} needed.`,
      fail: (c) => `Labelers handle ${fmt(labelCapacity(c))} labels a week, but ${fmt(labelDemand(c))} are needed.`,
    }),
    rule("Keep labeling within $60,000 a month.", (c) => c.has("labeling-queue") && labelCost(c) <= 60000, {
      category: "cost",
      label: "Budget",
      points: 15,
      fail: (c) => `Labeling costs $${fmt(labelCost(c))} a month.`,
    }),
  ],
  reference: {
    config: ["Labeling queue: consensus (2 of 3), active learning, 130 labelers.", "Demand 200,000 x 40% x 2.5 = 200,000 labels/week; capacity 208,000; cost $52,000/month."],
    explanation: [
      "Consensus raises quality but multiplies work; active learning pays for it by labeling only informative images.",
      "Without active learning, consensus labeling would need over 300 labelers.",
    ],
    graph: {
      nodes: [
        n("store", "object-storage", 40, 200),
        n("lq", "labeling-queue", 280, 200, { reviewMode: "Consensus (2 of 3)", labelers: 130, itemsPerLabelerPerHour: 40, activeLearning: "Enabled" }),
        n("ds", "dataset-store", 520, 200, { versioning: "Immutable snapshots" }),
        n("train", "training-job", 760, 200),
      ],
      edges: w("store>lq>ds>train"),
    },
  },
};

const piiTraining: ProblemDef = {
  code: "ML0008",
  slug: "pii-in-the-training-data",
  title: "PII in the Training Data",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Tamsin's support-ticket classifier is trained on raw tickets, which contain email addresses, phone numbers and the occasional card number. Compliance has ruled that personal data must never reach the training store and that raw tickets can be kept for 30 days at most. Clean the data on its way in without losing the tickets' value.",
  guide: {
    title: "Ingestion path",
    description: "Every record passes a validator that redacts PII, checks the schema and drops duplicates before storage.",
    flow: ["application-server", "object-storage", "data-validator", "dataset-store"],
    notes: ["Redacting at ingestion is cheaper than finding PII in a trained model."],
  },
  concepts: ["PII filtering", "Data validation"],
  reading: [{ title: "Data collection learning path", description: "Review sensitive-data handling.", href: `${SEC(2)}#pii` }],
  components: ["application-server", "object-storage", "data-validator", "dataset-store", "training-job"],
  checks: [
    rule("Pass every record through a data validator before it reaches the dataset store.", (c) =>
      c.path("data-validator", "dataset-store") && c.nodes("dataset-store").every((d) => E.incoming(c.g, d.id).every((x) => x.type === "data-validator")), {
      category: "Security",
      label: "Validated ingest",
      points: 15,
    }),
    configIs("data-validator", "piiFilter", "Enabled", "Redact emails, phone numbers and card numbers.", "Security", 20),
    configIs("data-validator", "schemaChecks", "Enabled", "Reject records that don't match the expected schema.", "Quality", 10),
    configIs("data-validator", "dedupe", "Enabled", "Drop duplicate tickets.", "Quality", 10),
    rule("Delete raw, unredacted tickets within 30 days.", (c) => c.nodes("object-storage").some((o) => E.num(o.config.expireDays) > 0 && E.num(o.config.expireDays) <= 30), {
      category: "Compliance",
      label: "Raw retention",
    }),
  ],
  reference: {
    config: ["Support app -> raw object storage (30-day expiry) -> data validator (PII filter, schema checks, dedupe) -> dataset store -> training."],
    explanation: [
      "Models can memorize and repeat personal data. The only safe training set is one that never contained it.",
      "Short raw retention limits exposure while still allowing reprocessing if the validator changes.",
    ],
    graph: {
      nodes: [
        n("tickets", "application-server", 40, 200, { size: "Medium" }),
        n("raw", "object-storage", 260, 200, { expireDays: 30 }),
        n("validator", "data-validator", 500, 200, { piiFilter: "Enabled", schemaChecks: "Enabled", dedupe: "Enabled", maxNullPercent: 5 }),
        n("ds", "dataset-store", 740, 200, { versioning: "Immutable snapshots" }),
        n("train", "training-job", 980, 200),
      ],
      edges: w("tickets>raw>validator>ds>train"),
    },
  },
};

/* ---------------- Data Pipelines & Preprocessing ---------------- */

const PREP_RATE = 25000;
const prepRate = (c: Ctx) => c.nodes("worker").reduce((s, x) => s + E.workerThroughputPerSec(x, PREP_RATE), 0);
const missedWindow: ProblemDef = {
  code: "ML0009",
  slug: "the-pipeline-that-misses-its-window",
  title: "The Pipeline That Misses Its Window",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Every night Sorrel preprocesses 1.2 billion raw events before the 5 AM training run, inside a four-hour window. The single preprocessing worker finishes around 11 AM, so models train on yesterday's data. Each worker instance handles 25,000 events per second. Finish inside the window at 80% utilization or less, without a fleet bigger than eight workers.",
  guide: {
    title: "Nightly pipeline",
    description: "A durable scheduler starts preprocessing workers that read the lake and write training data.",
    flow: ["job-scheduler", "worker", "dataset-store"],
    secondary: { title: "Input", flow: ["object-storage", "worker"] },
    notes: ["4 hours = 14,400 seconds."],
  },
  concepts: ["Batch windows", "Pipeline sizing"],
  reading: [{ title: "Pipelines learning path", description: "Review batch windows.", href: `${SEC(3)}#windows` }],
  components: ["job-scheduler", "object-storage", "worker", "dataset-store"],
  checks: [
    rule("Start preprocessing from a durable scheduler.", (c) => durableScheduler(c), { category: "validity", label: "Scheduling" }),
    rule("Read raw events from object storage and write to the dataset store.", (c) => c.path("object-storage", "worker", "dataset-store"), { category: "validity", label: "Data path" }),
    rule("Process 1.2 billion events inside the 4-hour window at 80% or less.", (c) => prepRate(c) * 0.8 * 14400 >= 1.2e9, {
      category: "capacity",
      label: "Window",
      points: 25,
      pass: (c) => `Workers finish in ${(1.2e9 / prepRate(c) / 3600).toFixed(1)} hours.`,
      fail: (c) => (prepRate(c) > 0 ? `Workers need ${(1.2e9 / prepRate(c) / 3600).toFixed(1)} hours at full speed.` : "No preprocessing workers."),
    }),
    rule("Use no more than eight worker instances.", (c) => c.has("worker") && c.nodes("worker").reduce((s, x) => s + E.instancesOf(x), 0) <= 8, { category: "cost", label: "Fleet size" }),
  ],
  reference: {
    config: ["Scheduler (1 AM) -> 5 preprocessing workers (125,000 events/s) -> dataset store. 1.2B events finish in 2.7 hours (67%)."],
    explanation: [
      "A window is a throughput requirement: events / seconds available, plus headroom for a slow night.",
      "Five workers finish with room to spare; eight would just be paying for idle capacity.",
    ],
    graph: {
      nodes: [
        n("sched", "job-scheduler", 40, 80, { schedule: "0 1 * * *", durability: "Durable store" }),
        n("lake", "object-storage", 40, 260),
        n("prep", "worker", 300, 170, { instances: 5, idempotent: "Enabled" }),
        n("ds", "dataset-store", 560, 170, { versioning: "Immutable snapshots" }),
      ],
      edges: w("sched>prep>ds", "lake>prep"),
    },
  },
};

const staleFeatures: ProblemDef = {
  code: "ML0010",
  slug: "stale-features-at-lunchtime",
  title: "Stale Features at Lunchtime",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Morrow's food-delivery recommender computes features once a night. At lunchtime it keeps recommending restaurants that have just closed their kitchens or are 50 minutes behind on orders. Make the fast-changing features (open status, current wait time) fresh within seconds and serve them online.",
  guide: {
    title: "Streaming features",
    description: "Restaurant events stream through a feature pipeline into the online feature store.",
    flow: ["application-server", "event-stream", "worker", "feature-store"],
    secondary: { title: "Serving", flow: ["load-balancer", "model-server", "feature-store"] },
    notes: ["Freshness is a feature property: some change every second, some once a month."],
  },
  concepts: ["Feature freshness", "Streaming pipelines"],
  reading: [{ title: "Pipelines learning path", description: "Review freshness requirements.", href: `${SEC(3)}#freshness` }],
  components: ["application-server", "event-stream", "worker", "feature-store", "load-balancer", "model-server"],
  checks: [
    rule("Compute fast-changing features from an event stream.", (c) => c.path("event-stream", "worker", "feature-store"), { category: "Freshness", label: "Streaming path", points: 20 }),
    configIs("feature-store", "freshness", "Streaming", "Ingest streamed features continuously.", "Freshness", 15),
    rule("Serve features to the model from the online store.", (c) => onlineStore(c) && onlineLookups(c), { category: "Latency", label: "Online serving", points: 15 }),
  ],
  reference: {
    config: ["Restaurant service -> event stream -> streaming feature workers -> feature store (streaming, Redis online tier) <- model servers."],
    explanation: [
      "A nightly feature can't describe something that changes every few minutes. Streaming updates bring the feature as close to real time as the model needs.",
      "The online store makes the fresh value available to every prediction in milliseconds.",
    ],
    graph: {
      nodes: [
        n("restaurants", "application-server", 40, 300, { size: "Medium" }),
        n("events", "event-stream", 260, 300, { partitions: 12, replicationFactor: 3 }),
        n("stream", "worker", 500, 300, { instances: 3 }),
        n("fs", "feature-store", 740, 200, { onlineStore: "Redis", freshness: "Streaming", sharedDefinitions: "Enabled" }),
        n("lb", "load-balancer", 260, 100, { healthChecks: "Enabled" }),
        n("serve", "model-server", 500, 100, { size: "Medium", instances: 3, featureLookup: "Online feature store" }),
      ],
      edges: w("restaurants>events>stream>fs", "lb>serve>fs"),
    },
  },
};

const countedTwice: ProblemDef = {
  code: "ML0011",
  slug: "the-day-counted-twice",
  title: "The Day Counted Twice",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Wrenfield's nightly preprocessing failed halfway through and was retried. The retry appended the whole day again, so every user's purchase count for that day doubled and the next model learned that Tuesday shoppers spend twice as much. Make preprocessing safe to retry and the training data impossible to corrupt this way.",
  guide: {
    title: "Idempotent pipeline",
    description: "Retries rewrite the same output instead of adding to it, and each run produces a new immutable version.",
    flow: ["job-scheduler", "worker", "data-validator", "dataset-store"],
    secondary: { title: "Input", flow: ["object-storage", "worker"] },
    notes: ["A pipeline you can't safely re-run is a pipeline you can't safely operate."],
  },
  concepts: ["Idempotent preprocessing", "Immutable outputs"],
  reading: [{ title: "Pipelines learning path", description: "Review idempotent pipelines.", href: `${SEC(3)}#idempotency` }],
  components: ["job-scheduler", "object-storage", "worker", "data-validator", "dataset-store"],
  checks: [
    rule("Make preprocessing workers idempotent.", idempotentWorkers, { category: "Correctness", label: "Idempotent steps", points: 20 }),
    rule("Write each run as an immutable dataset snapshot instead of appending.", immutableDatasets, { category: "Correctness", label: "Immutable output", points: 15 }),
    rule("Drop duplicate records before they're stored.", (c) => c.nodes("data-validator").some((v) => E.str(v.config.dedupe) === "Enabled" && E.outgoing(c.g, v.id).some((x) => x.type === "dataset-store")), {
      category: "Quality",
      label: "Dedupe",
    }),
    rule("Run the pipeline from a durable scheduler that retries failed runs.", (c) => durableScheduler(c), { category: "reliability", label: "Scheduler" }),
  ],
  reference: {
    config: ["Scheduler -> idempotent preprocessing workers -> validator (dedupe, schema checks) -> dataset store (immutable snapshots)."],
    explanation: [
      "Retries are inevitable; appends make them dangerous. Overwrite-by-key or write-new-version makes them harmless.",
      "Immutable snapshots also mean a bad run can be thrown away without touching good data.",
    ],
    graph: {
      nodes: [
        n("sched", "job-scheduler", 40, 80, { schedule: "0 1 * * *", durability: "Durable store" }),
        n("lake", "object-storage", 40, 260),
        n("prep", "worker", 280, 170, { instances: 4, idempotent: "Enabled" }),
        n("validator", "data-validator", 520, 170, { dedupe: "Enabled", schemaChecks: "Enabled" }),
        n("ds", "dataset-store", 760, 170, { versioning: "Immutable snapshots" }),
      ],
      edges: w("sched>prep>validator>ds", "lake>prep"),
    },
  },
};

const feedsBoth = (c: Ctx) => c.nodes("worker").some((x) => E.incoming(c.g, x.id).some((i) => i.type === "job-scheduler") && E.incoming(c.g, x.id).some((i) => i.type === "message-queue"));
const backfill: ProblemDef = {
  code: "ML0012",
  slug: "backfill-without-breaking-today",
  title: "Backfill Without Breaking Today",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Halden changed the definition of its 'active user' feature and must recompute two years of history. Last time a backfill ran on the daily pipeline's workers, it overwrote current partitions with half-finished results and pushed the daily run eight hours late. Run the backfill alongside the daily pipeline without touching today's data or slowing it down.",
  guide: {
    title: "Two pipelines",
    description: "The daily pipeline and the backfill get separate worker pools and write separate dataset versions.",
    flow: ["job-scheduler", "worker", "dataset-store"],
    secondary: { title: "Backfill", flow: ["application-server", "message-queue", "worker", "dataset-store"] },
    notes: ["Switch consumers to the backfilled version only once it's complete and validated."],
  },
  concepts: ["Backfills", "Workload isolation"],
  reading: [{ title: "Pipelines learning path", description: "Review safe backfills.", href: `${SEC(3)}#backfills` }],
  components: ["job-scheduler", "application-server", "message-queue", "worker", "auto-scaling", "object-storage", "dataset-store"],
  checks: [
    rule("Run the daily pipeline and the backfill on separate worker pools.", (c) => c.path("job-scheduler", "worker") && c.path("message-queue", "worker") && !feedsBoth(c), {
      category: "Isolation",
      label: "Separate pools",
      points: 20,
    }),
    rule("Write the backfill as a new immutable dataset version, then switch.", immutableDatasets, { category: "Correctness", label: "New version", points: 15 }),
    rule("Make every pipeline worker idempotent.", idempotentWorkers, { category: "Correctness", label: "Idempotent" }),
    rule("Autoscale the backfill pool on backlog.", (c) =>
      c.nodes("auto-scaling").some((s) => E.str(s.config.metric) === "Queue depth / backlog" && c.nodes("worker").some((x) => E.linkedEitherWay(c.g, s.id, x.id) && E.incoming(c.g, x.id).some((i) => i.type === "message-queue"))), {
      category: "capacity",
      label: "Backfill scaling",
    }),
  ],
  reference: {
    config: [
      "Daily: scheduler -> daily workers (4, idempotent) -> dataset store.",
      "Backfill: controller -> partition queue -> backfill workers (8 to 40, autoscaled on backlog) -> new immutable dataset version.",
    ],
    explanation: [
      "Separate pools mean the backfill can use as much capacity as it wants without delaying the daily run.",
      "Writing a new version keeps current data untouched until the backfill is complete and checked.",
    ],
    graph: {
      nodes: [
        n("sched", "job-scheduler", 40, 80, { schedule: "0 1 * * *", durability: "Durable store" }),
        n("daily", "worker", 300, 80, { instances: 4, idempotent: "Enabled" }),
        n("lake", "object-storage", 40, 240),
        n("ctl", "application-server", 40, 400, { size: "Small" }),
        n("bq", "message-queue", 300, 400, { retry: "Enabled", maxRetries: 5, dlqEnabled: "Enabled" }),
        n("bf", "worker", 560, 400, { instances: 8, idempotent: "Enabled" }),
        n("as", "auto-scaling", 560, 560, { metric: "Queue depth / backlog", min: 8, max: 40 }),
        n("ds", "dataset-store", 820, 240, { versioning: "Immutable snapshots" }),
      ],
      edges: w("sched>daily>ds", "lake>daily", "ctl>bq>bf>ds", "lake>bf", "as>bf"),
    },
  },
};

/* ---------------- Feature Engineering & Feature Stores ---------------- */

const skew: ProblemDef = {
  code: "ML0013",
  slug: "training-serving-skew",
  title: "Training/Serving Skew",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Brackwater's ranking model scores 0.91 AUC offline but only 0.74 in production. An investigation finds two causes: serving computes 'items viewed in last hour' with a different time zone, and training joins features as of today rather than as of each impression. Remove both sources of skew.",
  guide: {
    title: "Consistent features",
    description: "Training and serving read the same feature definitions; training rows see only what was known at the time.",
    flow: ["feature-store", "training-job", "model-registry", "model-server"],
    secondary: { title: "Serving", flow: ["load-balancer", "model-server", "feature-store"] },
    notes: ["Skew is the gap between what the model learned from and what it sees."],
  },
  concepts: ["Training/serving skew", "Point-in-time correctness"],
  reading: [{ title: "Feature stores learning path", description: "Review skew and its causes.", href: `${SEC(4)}#skew` }],
  components: ["event-stream", "worker", "feature-store", "training-job", "model-registry", "load-balancer", "model-server"],
  checks: [
    configIs("feature-store", "sharedDefinitions", "Enabled", "Use one shared definition per feature for training and serving.", "Consistency", 20),
    configIs("feature-store", "pointInTimeJoins", "Enabled", "Join features as of each training example's timestamp.", "Correctness", 15),
    rule("Serve features from the online feature store, not recomputed in the model server.", (c) => onlineStore(c) && onlineLookups(c), { category: "Consistency", label: "Online lookups", points: 15 }),
    rule("Train from the feature store.", (c) => c.edge("feature-store", "training-job"), { category: "validity", label: "Offline reads" }),
  ],
  reference: {
    config: ["Feature store with shared definitions, point-in-time joins and a Redis online tier.", "Training reads offline; model servers look up online features."],
    explanation: [
      "Shared definitions remove implementation drift; point-in-time joins remove leakage from the future.",
      "With both fixed, offline metrics become an honest forecast of online behavior.",
    ],
    graph: {
      nodes: [
        n("events", "event-stream", 40, 320, { partitions: 6, replicationFactor: 3 }),
        n("pipe", "worker", 260, 320, { instances: 2 }),
        n("fs", "feature-store", 500, 320, { onlineStore: "Redis", freshness: "Hourly batch", pointInTimeJoins: "Enabled", sharedDefinitions: "Enabled" }),
        n("train", "training-job", 740, 420),
        n("registry", "model-registry", 980, 260),
        n("lb", "load-balancer", 260, 100, { healthChecks: "Enabled" }),
        n("serve", "model-server", 500, 100, { size: "Medium", instances: 2, featureLookup: "Online feature store" }),
      ],
      edges: w("events>pipe>fs>train>registry>serve", "lb>serve>fs"),
    },
  },
};

const onlineSizing: ProblemDef = {
  code: "ML0014",
  slug: "sizing-the-online-store",
  title: "Sizing the Online Store",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Cobaltline serves 4,000 predictions per second, and each one looks up about 12 features, so 48,000 lookups per second hit the online store. The working set is 120 GB. Today the online cache is 64 GB, so hit rates collapse and p99 lookup latency reaches 80 ms. Size the online tier with 25% headroom and keep model servers at 70% CPU or less.",
  guide: {
    title: "Online prediction path",
    description: "Model servers look up features in the feature store's online tier for every request.",
    flow: ["load-balancer", "model-server", "feature-store"],
    notes: ["120 GB working set plus 25% headroom is 150 GB."],
  },
  concepts: ["Online store sizing", "Lookup latency"],
  reading: [{ title: "Feature stores learning path", description: "Review online store sizing.", href: `${SEC(4)}#online-sizing` }],
  components: ["load-balancer", "model-server", "feature-store"],
  checks: [
    rule("Look up online features from model servers behind a load balancer.", (c) => c.path("load-balancer", "model-server", "feature-store") && onlineLookups(c), { category: "validity", label: "Lookup path" }),
    rule("Use Redis or DynamoDB as the online store.", onlineStore, { category: "Latency", label: "Online tier" }),
    numberAtLeast("feature-store", "onlineCacheGb", 150, "Size the online store for the 120 GB working set plus 25% headroom (150 GB).", "capacity", 20),
    rule("Serve 4,000 predictions per second at 70% CPU or less.", (c) => modelRps(c) * 0.7 >= 4000, {
      category: "capacity",
      label: "Model capacity",
      points: 15,
      fail: (c) => `Model servers provide ${fmt(modelRps(c))} RPS; 4,000 at 70% needs ${fmt(5715)}.`,
    }),
  ],
  reference: {
    config: ["Model servers: Large x8 (6,400 RPS, 63%).", "Feature store online tier: Redis, 160 GB."],
    explanation: [
      "When the working set doesn't fit, every miss falls back to a slower store and tail latency explodes.",
      "Headroom absorbs growth and key skew without a resize under pressure.",
    ],
    graph: {
      nodes: [
        n("lb", "load-balancer", 40, 200, { healthChecks: "Enabled" }),
        n("serve", "model-server", 300, 200, { size: "Large", instances: 8, featureLookup: "Online feature store" }),
        n("fs", "feature-store", 560, 200, { onlineStore: "Redis", onlineCacheGb: 160, sharedDefinitions: "Enabled", pointInTimeJoins: "Enabled" }),
      ],
      edges: w("lb>serve>fs"),
    },
  },
};

const freshnessTiers: ProblemDef = {
  code: "ML0015",
  slug: "freshness-tiers",
  title: "Freshness Tiers",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Sundale's recommender uses three kinds of features: session clicks that change every second, purchase counts that change hourly, and demographics that change monthly. Last quarter the team moved everything to streaming and the pipeline bill tripled. Compute each feature at the freshness it needs, and serve them all from one place.",
  guide: {
    title: "Two pipelines, one store",
    description: "Stream the fast features, batch the slow ones, and serve both from the same online store.",
    flow: ["event-stream", "worker", "feature-store"],
    extra: [
      { title: "Batch features", flow: ["job-scheduler", "worker", "feature-store"] },
      { title: "Serving", flow: ["load-balancer", "model-server", "feature-store"] },
    ],
    notes: ["Streaming a feature that changes monthly costs a lot and buys nothing."],
  },
  concepts: ["Freshness tiers", "Pipeline cost"],
  reading: [{ title: "Feature stores learning path", description: "Review freshness trade-offs.", href: `${SEC(4)}#freshness-tiers` }],
  components: ["application-server", "event-stream", "worker", "job-scheduler", "object-storage", "feature-store", "load-balancer", "model-server"],
  checks: [
    rule("Stream session features from an event stream into the feature store.", (c) => c.path("event-stream", "worker", "feature-store"), { category: "Freshness", label: "Streaming tier", points: 20 }),
    rule("Compute slow-changing features in a scheduled batch job.", (c) => c.path("job-scheduler", "worker", "feature-store") || c.path("job-scheduler", "batch-scoring-job", "feature-store"), {
      category: "cost",
      label: "Batch tier",
      points: 15,
    }),
    rule("Serve every feature from the online store.", (c) => onlineStore(c) && onlineLookups(c), { category: "Latency", label: "One serving layer" }),
    configIs("feature-store", "sharedDefinitions", "Enabled", "Register both tiers' features under shared definitions.", "Consistency", 10),
  ],
  reference: {
    config: [
      "Session events -> streaming workers -> feature store; hourly scheduler -> batch workers (reading the lake) -> feature store.",
      "Feature store (streaming ingestion, Redis online tier, shared definitions) serves model servers.",
    ],
    explanation: [
      "Freshness should be bought per feature: streaming where seconds matter, batch where hours or days are fine.",
      "Model servers don't care how a feature was computed. They read every tier from the same store.",
    ],
    graph: {
      nodes: [
        n("app", "application-server", 40, 120, { size: "Medium" }),
        n("events", "event-stream", 260, 120, { partitions: 12, replicationFactor: 3 }),
        n("stream", "worker", 500, 120, { instances: 2 }),
        n("sched", "job-scheduler", 260, 300, { schedule: "0 * * * *", durability: "Durable store" }),
        n("lake", "object-storage", 260, 440),
        n("batch", "worker", 500, 360, { instances: 2, idempotent: "Enabled" }),
        n("fs", "feature-store", 740, 240, { onlineStore: "Redis", freshness: "Streaming", sharedDefinitions: "Enabled" }),
        n("lb", "load-balancer", 740, 440, { healthChecks: "Enabled" }),
        n("serve", "model-server", 980, 440, { size: "Medium", instances: 2, featureLookup: "Online feature store" }),
      ],
      edges: w("app>events>stream>fs", "sched>batch>fs", "lake>batch", "lb>serve>fs"),
    },
  },
};

const sharedFeatures: ProblemDef = {
  code: "ML0016",
  slug: "every-team-builds-the-same-features",
  title: "Every Team Builds the Same Features",
  difficulty: "Medium",
  minutes: 18,
  description:
    "At Fairhaven, the search, ads and recommendations teams each compute 'user purchases in the last 30 days', in three different ways, on three pipelines, with three online caches. Numbers disagree across products and infrastructure costs keep growing. Consolidate into one feature platform that every team trains and serves from.",
  guide: {
    title: "Shared feature platform",
    description: "One validated pipeline into one feature store, read by every team's training jobs and models.",
    flow: ["object-storage", "worker", "data-validator", "feature-store"],
    extra: [
      { title: "Training", flow: ["feature-store", "training-job"] },
      { title: "Serving", flow: ["api-gateway", "model-server", "feature-store"] },
    ],
    notes: ["A shared feature only helps if every consumer can trust it: validate it once, centrally."],
  },
  concepts: ["Feature reuse", "Shared definitions"],
  reading: [{ title: "Feature stores learning path", description: "Review feature sharing.", href: `${SEC(4)}#reuse` }],
  components: ["object-storage", "worker", "data-validator", "feature-store", "training-job", "api-gateway", "model-server"],
  checks: [
    configIs("feature-store", "sharedDefinitions", "Enabled", "Publish features under shared definitions every team can discover.", "Reuse", 20),
    rule("Have at least two teams' training jobs read from the same feature store.", (c) => c.nodes("feature-store").some((f) => E.outgoing(c.g, f.id).filter((x) => x.type === "training-job").length >= 2), {
      category: "Reuse",
      label: "Shared training",
      points: 15,
    }),
    rule("Have at least two models serve from the same online store.", (c) => onlineStore(c) && c.nodes("feature-store").some((f) => E.incoming(c.g, f.id).filter((x) => x.type === "model-server").length >= 2), {
      category: "Reuse",
      label: "Shared serving",
    }),
    configIs("feature-store", "pointInTimeJoins", "Enabled", "Support point-in-time joins for every team's training sets.", "Correctness", 10),
    rule("Validate feature pipelines with schema checks before publishing.", (c) => c.nodes("data-validator").some((v) => E.str(v.config.schemaChecks) === "Enabled" && E.outgoing(c.g, v.id).some((x) => x.type === "feature-store")), {
      category: "Quality",
      label: "Validation",
    }),
  ],
  reference: {
    config: [
      "Lake -> feature pipeline -> validator (schema checks) -> one feature store (shared definitions, point-in-time joins, Redis online tier).",
      "Search and ads training jobs read offline; both teams' model servers read online.",
    ],
    explanation: [
      "One definition gives every product the same answer and pays for one pipeline instead of three.",
      "Central validation makes reuse safe: a broken feature is caught once, before anyone trains on it.",
    ],
    graph: {
      nodes: [
        n("lake", "object-storage", 40, 240),
        n("pipe", "worker", 260, 240, { instances: 3, idempotent: "Enabled" }),
        n("validator", "data-validator", 480, 240, { schemaChecks: "Enabled", maxNullPercent: 2 }),
        n("fs", "feature-store", 720, 240, { onlineStore: "Redis", freshness: "Hourly batch", pointInTimeJoins: "Enabled", sharedDefinitions: "Enabled" }),
        n("trainA", "training-job", 960, 120),
        n("trainB", "training-job", 960, 360),
        n("gw", "api-gateway", 480, 460),
        n("serveA", "model-server", 720, 460, { size: "Medium", instances: 2, featureLookup: "Online feature store" }),
        n("serveB", "model-server", 720, 600, { size: "Medium", instances: 2, featureLookup: "Online feature store" }),
      ],
      edges: w("lake>pipe>validator>fs>trainA", "fs>trainB", "gw>serveA>fs", "gw>serveB>fs"),
    },
  },
};

export const ML_DATA: ProblemDef[] = [
  oneServer,
  batchOrOnline,
  twoPlaces,
  notebookToProd,
  lostClicks,
  lateLabels,
  labelingBacklog,
  piiTraining,
  missedWindow,
  staleFeatures,
  countedTwice,
  backfill,
  skew,
  onlineSizing,
  freshnessTiers,
  sharedFeatures,
];
