import type { ProblemDef } from "../types";
import { configIs, fmt, node as n, numberAtMost, rule, wire as w } from "../builders";
import type { Ctx } from "@/lib/sim/evaluate";
import * as E from "@/lib/sim/engine";

const SEC = (n: number) => `/tracks/ml-serving-foundations/sections/ml-ai-system-design-section-${n}`;

const registryIs = (c: Ctx, key: string, value = "Enabled") => c.nodes("model-registry").some((r) => E.str(r.config[key]) === value);
const queueSafety = (c: Ctx) => c.nodes("message-queue").some((q) => E.str(q.config.retry) === "Enabled" && E.str(q.config.dlqEnabled) === "Enabled" && E.num(q.config.maxRetries) > 0);
const scoringInstances = (c: Ctx) => c.nodes("batch-scoring-job").reduce((s, b) => s + E.instancesOf(b), 0);
const durableTrigger = (c: Ctx) =>
  c.nodes("job-scheduler").some((j) => E.str(j.config.durability) === "Durable store" && E.outgoing(c.g, j.id).some((x) => x.type === "batch-scoring-job"));
/** Model servers reachable from the entry point, and what's left after the largest group fails. */
const modelTier = (c: Ctx) => E.resolveTopology(c.g, "model-server").servers;
const modelRps = (c: Ctx) => modelTier(c).reduce((s, m) => s + E.serverCapacityRps(m), 0);
const survivorRps = (c: Ctx) => {
  const caps = modelTier(c).map((m) => E.serverCapacityRps(m));
  return caps.length < 2 ? 0 : caps.reduce((a, b) => a + b, 0) - Math.max(...caps);
};

/* ---------------- Model Registry & Versioning ---------------- */

const sharedDrive: ProblemDef = {
  code: "ML0029",
  slug: "models-on-a-shared-drive",
  title: "Models on a Shared Drive",
  difficulty: "Easy",
  minutes: 12,
  description:
    "Tarnwood's model servers load whatever file is called latest.pkl on a shared drive. Last week a data scientist overwrote it with an experiment, and production quietly started serving it. Make a registry the single source of truth for which model version is live.",
  guide: {
    title: "Registry-backed serving",
    description: "Training publishes versions to the registry; model servers load only from the registry.",
    flow: ["training-job", "model-registry", "model-server"],
    secondary: { title: "Requests", flow: ["load-balancer", "model-server"] },
    notes: ["'latest' is a moving target; a version number isn't."],
  },
  concepts: ["Model registry", "Immutable versions"],
  reading: [{ title: "Model registry learning path", description: "Review the registry's role.", href: `${SEC(8)}#source-of-truth` }],
  components: ["training-job", "model-registry", "model-server", "load-balancer", "shared-filesystem", "object-storage"],
  checks: [
    rule("Publish trained models to a model registry.", (c) => c.edge("training-job", "model-registry"), { category: "validity", label: "Publishing" }),
    rule("Load models into the servers from the registry.", (c) => c.edge("model-registry", "model-server"), { label: "Loading", points: 15 }),
    configIs("model-registry", "immutableVersions", "Enabled", "Make every registered version immutable.", "Correctness", 20),
    rule("Stop model servers from loading model files from shared storage.", (c) => c.has("model-server") && !c.nodes("model-server").some((m) => [...E.incoming(c.g, m.id), ...E.outgoing(c.g, m.id)].some((x) => x.type === "shared-filesystem" || x.type === "object-storage")), {
      label: "No side doors",
    }),
  ],
  reference: {
    config: ["Training -> model registry (immutable versions) -> model servers (Medium x2) behind a load balancer."],
    explanation: ["A registry decides exactly which version is live; nobody can change it by saving a file.", "Immutable versions mean 'version 42' always refers to the same model."],
    graph: {
      nodes: [
        n("train", "training-job", 40, 200),
        n("registry", "model-registry", 300, 200, { immutableVersions: "Enabled" }),
        n("lb", "load-balancer", 300, 380, { healthChecks: "Enabled" }),
        n("serve", "model-server", 560, 280, { size: "Medium", instances: 2 }),
      ],
      edges: w("train>registry>serve", "lb>serve"),
    },
  },
};

const servedByRegistry = (c: Ctx) => c.nodes("model-server").filter((m) => E.incoming(c.g, m.id).some((x) => x.type === "model-registry"));
const reachableFromLb = (c: Ctx, id: string) => c.nodes("load-balancer").some((l) => E.reachable(c.g, l.id).has(id));
const stagingFirst: ProblemDef = {
  code: "ML0030",
  slug: "staging-before-production",
  title: "Staging Before Production",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Ulverton promotes models straight from training to production. A model that crashed on one rare input type took down search for an hour. Add a staging environment that receives every candidate first, and require an approval before anything reaches production.",
  guide: {
    title: "Staged promotion",
    description: "The registry deploys candidates to staging, and promotes to production only after approval.",
    flow: ["training-job", "model-registry", "model-server"],
    secondary: { title: "Production traffic", flow: ["load-balancer", "model-server"] },
    notes: ["Staging gets mirrored or synthetic traffic, never real users."],
  },
  concepts: ["Staged promotion", "Approval gates"],
  reading: [{ title: "Model registry learning path", description: "Review promotion stages.", href: `${SEC(8)}#staging` }],
  components: ["training-job", "model-registry", "model-server", "load-balancer"],
  checks: [
    configIs("model-registry", "promotion", "Staged (staging -> production)", "Promote models through staging before production.", "Release safety", 20),
    configIs("model-registry", "approvalGate", "Enabled", "Require an approval before production.", "Release safety", 10),
    rule("Deploy from the registry to separate staging and production model servers.", (c) => servedByRegistry(c).length >= 2, { category: "validity", label: "Two environments", points: 15 }),
    rule("Keep staging off the public load balancer.", (c) => servedByRegistry(c).some((m) => reachableFromLb(c, m.id)) && servedByRegistry(c).some((m) => !reachableFromLb(c, m.id)), {
      category: "Isolation",
      label: "Private staging",
    }),
  ],
  reference: {
    config: ["Training -> registry (staged promotion, approval gate) -> staging model server (private) and production model servers (behind the load balancer)."],
    explanation: ["Staging catches crashes and integration problems before users see them.", "An approval gate gives a person the final say over what reaches production."],
    graph: {
      nodes: [
        n("train", "training-job", 40, 220),
        n("registry", "model-registry", 280, 220, { promotion: "Staged (staging -> production)", approvalGate: "Enabled", immutableVersions: "Enabled" }),
        n("staging", "model-server", 540, 80, { size: "Small" }),
        n("lb", "load-balancer", 280, 400, { healthChecks: "Enabled" }),
        n("prod", "model-server", 540, 320, { size: "Medium", instances: 3 }),
      ],
      edges: w("train>registry>staging", "registry>prod", "lb>prod"),
    },
  },
};

const oneClick: ProblemDef = {
  code: "ML0031",
  slug: "roll-back-in-one-click",
  title: "Roll Back in One Click",
  difficulty: "Medium",
  minutes: 15,
  description:
    "When Vantor's new fraud model started blocking good customers, rolling back took three hours: find the old artifact, rebuild the image, redeploy. Make rolling back a model a one-step operation, and let bad releases undo themselves.",
  guide: {
    title: "Instant rollback",
    description: "Serve through a registry alias, keep every version, and release behind a router that can roll back automatically.",
    flow: ["model-registry", "model-server"],
    secondary: { title: "Release traffic", flow: ["load-balancer", "traffic-router", "model-server"] },
    notes: ["Rolling back should be a pointer change, not a rebuild."],
  },
  concepts: ["Rollback aliases", "Automated rollback"],
  reading: [{ title: "Model registry learning path", description: "Review rollback.", href: `${SEC(8)}#rollback` }],
  components: ["training-job", "model-registry", "model-server", "load-balancer", "traffic-router"],
  checks: [
    configIs("model-registry", "rollbackAlias", "Enabled", "Serve production through an alias that can point back to the previous version.", "reliability", 25),
    configIs("model-registry", "immutableVersions", "Enabled", "Keep every version immutable so the previous one is always intact.", "reliability", 15),
    rule("Load models from the registry.", (c) => c.edge("model-registry", "model-server"), { category: "validity", label: "Registry loading" }),
    configIs("traffic-router", "autoRollback", "Enabled", "Roll back automatically when the new model's errors spike.", "Release safety", 10),
  ],
  reference: {
    config: ["Registry (immutable versions, rollback alias, staged) -> stable and canary model servers.", "Load balancer -> traffic router (canary 10%, auto rollback)."],
    explanation: ["With an alias and intact versions, rollback is one pointer update.", "Auto rollback ends most bad releases before anyone gets paged."],
    graph: {
      nodes: [
        n("train", "training-job", 40, 60),
        n("registry", "model-registry", 280, 60, { promotion: "Staged (staging -> production)", immutableVersions: "Enabled", rollbackAlias: "Enabled" }),
        n("lb", "load-balancer", 40, 300, { healthChecks: "Enabled" }),
        n("router", "traffic-router", 280, 300, { strategy: "Canary", canaryPercent: 10, autoRollback: "Enabled" }),
        n("stable", "model-server", 540, 200, { size: "Medium", instances: 3 }),
        n("canary", "model-server", 540, 400, { size: "Medium", instances: 1 }),
      ],
      edges: w("train>registry>stable", "registry>canary", "lb>router>stable", "router>canary"),
    },
  },
};

const manyModels: ProblemDef = {
  code: "ML0032",
  slug: "many-models-one-registry",
  title: "Many Models, One Registry",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Whitmore now runs 40 models across five teams, each with its own way of storing, promoting and rolling back models. An outage last month took a day to diagnose because nobody knew which version of which model was live. Put every team on one registry with the same rules.",
  guide: {
    title: "Central registry",
    description: "Every team's training publishes to one governed registry that serves every model.",
    flow: ["training-job", "experiment-tracker", "model-registry", "model-server"],
    secondary: { title: "Audit", flow: ["model-registry", "audit-log"] },
    notes: ["Shared rules matter more than shared storage."],
  },
  concepts: ["Model governance at scale", "Standardized promotion"],
  reading: [{ title: "Model registry learning path", description: "Review registry standards.", href: `${SEC(8)}#standards` }],
  components: ["training-job", "experiment-tracker", "model-registry", "audit-log", "model-server"],
  checks: [
    rule("Publish at least three teams' models to the same registry.", (c) => c.nodes("model-registry").some((r) => E.incoming(c.g, r.id).filter((x) => x.type === "training-job").length >= 3), {
      category: "Reuse",
      label: "One registry",
      points: 15,
    }),
    configIs("model-registry", "promotion", "Staged (staging -> production)", "Use staged promotion for every model.", "Governance", 10),
    configIs("model-registry", "immutableVersions", "Enabled", "Make every version immutable.", "Governance", 10),
    configIs("model-registry", "rollbackAlias", "Enabled", "Give every model a rollback alias.", "Governance", 10),
    configIs("model-registry", "approvalGate", "Enabled", "Require approval for production.", "Governance", 10),
    rule("Log registry changes in an immutable audit log.", (c) => c.nodes("audit-log").some((a) => E.str(a.config.immutable) === "Enabled" && c.nodes("model-registry").some((r) => E.linkedEitherWay(c.g, a.id, r.id))), {
      category: "Compliance",
      label: "Audit",
    }),
    rule("Link runs to versions through an experiment tracker.", (c) => c.nodes("experiment-tracker").some((t) => c.nodes("model-registry").some((r) => E.linkedEitherWay(c.g, t.id, r.id))), { label: "Lineage" }),
  ],
  reference: {
    config: ["Three teams' training jobs -> shared experiment tracker -> one registry (staged, immutable, rollback alias, approval) -> model servers.", "Registry changes go to an immutable audit log."],
    explanation: ["One registry gives a single answer to 'what's live?' for every model.", "Uniform rules mean every team gets safe promotion and rollback by default."],
    graph: {
      nodes: [
        ...["a", "b", "c"].map((t, i) => n(`train-${t}`, "training-job", 40, 80 + i * 140)),
        n("tracker", "experiment-tracker", 280, 220, { logCodeVersion: "Enabled", logDataVersion: "Enabled" }),
        n("registry", "model-registry", 520, 220, { promotion: "Staged (staging -> production)", immutableVersions: "Enabled", rollbackAlias: "Enabled", approvalGate: "Enabled" }),
        n("audit", "audit-log", 520, 400, { immutable: "Enabled" }),
        n("serve-a", "model-server", 780, 140, { size: "Medium", instances: 2 }),
        n("serve-b", "model-server", 780, 300, { size: "Medium", instances: 2 }),
      ],
      edges: w("train-a>registry", "train-b>registry", "train-c>registry", "train-a>tracker", "train-b>tracker", "train-c>tracker", "tracker>registry", "registry>serve-a", "registry>serve-b", "registry>audit"),
    },
  },
};

/* ---------------- Batch Inference ---------------- */

const SCORE_RATE = 1000;
const WINDOW_S = 3 * 3600;
const fullRescore: ProblemDef = {
  code: "ML0033",
  slug: "score-50-million-users-by-6-am",
  title: "Score 50 Million Users by 6 AM",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Every night Yarrowby rescores all 50 million users for the next day's campaigns, in a three-hour window that closes at 6 AM. Each scoring instance handles 1,000 users per second. Today one instance runs for 14 hours. Finish inside the window at 80% utilization or less, using no more than ten instances.",
  guide: {
    title: "Nightly scoring",
    description: "A durable scheduler starts the scoring fleet, which reads features and writes scores to a serving store.",
    flow: ["job-scheduler", "batch-scoring-job", "dynamodb"],
    secondary: { title: "Features", flow: ["feature-store", "batch-scoring-job"] },
    notes: ["3 hours = 10,800 seconds."],
  },
  concepts: ["Batch scoring capacity", "Scoring windows"],
  reading: [{ title: "Batch inference learning path", description: "Review fleet sizing.", href: `${SEC(9)}#sizing` }],
  components: ["job-scheduler", "feature-store", "dataset-store", "batch-scoring-job", "dynamodb"],
  checks: [
    rule("Start scoring from a durable scheduler.", durableTrigger, { category: "validity", label: "Scheduling" }),
    rule("Read features from the feature store or dataset store.", (c) => c.nodes("batch-scoring-job").some((b) => E.incoming(c.g, b.id).some((x) => x.type === "feature-store" || x.type === "dataset-store")), {
      category: "validity",
      label: "Inputs",
    }),
    rule("Write scores to a serving store.", (c) => c.nodes("batch-scoring-job").some((b) => E.outgoing(c.g, b.id).some((x) => x.category === "database")), { category: "validity", label: "Outputs" }),
    rule("Score 50 million users within 3 hours at 80% or less.", (c) => scoringInstances(c) * SCORE_RATE * 0.8 * WINDOW_S >= 50e6, {
      category: "capacity",
      label: "Window",
      points: 25,
      fail: (c) => `${scoringInstances(c)} instance(s) need ${(50e6 / Math.max(1, scoringInstances(c) * SCORE_RATE) / 3600).toFixed(1)} hours at full speed.`,
    }),
    rule("Use no more than ten scoring instances.", (c) => c.has("batch-scoring-job") && scoringInstances(c) <= 10, { category: "cost", label: "Fleet size" }),
  ],
  reference: {
    config: ["Scheduler (2 AM) -> 6 scoring instances (6,000 users/s) reading the feature store -> scores in DynamoDB. 50M users take 2.3 hours (77%)."],
    explanation: ["Batch windows are throughput problems: users divided by seconds, plus headroom for a slow night.", "Six instances fit; more would mostly add cost."],
    graph: {
      nodes: [
        n("sched", "job-scheduler", 40, 80, { schedule: "0 2 * * *", durability: "Durable store" }),
        n("fs", "feature-store", 40, 280, { onlineStore: "Redis" }),
        n("batch", "batch-scoring-job", 300, 180, { instances: 6 }),
        n("scores", "dynamodb", 560, 180, { size: "Medium" }),
      ],
      edges: w("sched>batch>scores", "fs>batch"),
    },
  },
};

const partitioned: ProblemDef = {
  code: "ML0034",
  slug: "partition-the-work",
  title: "Partition the Work",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Zennor's scoring job reads the whole customer table in one pass. Last night it crashed at 90% complete and restarted from the beginning, missing the deadline by four hours. Split the work so failures cost a single partition, run partitions in parallel, and never publish a half-finished result.",
  guide: {
    title: "Partitioned scoring",
    description: "A planner enqueues partitions; scoring instances pull them, retry failures and publish a new version at the end.",
    flow: ["job-scheduler", "worker", "message-queue", "batch-scoring-job", "object-storage"],
    notes: ["A failed partition should cost minutes, not the night."],
  },
  concepts: ["Work partitioning", "Atomic publishing"],
  reading: [{ title: "Batch inference learning path", description: "Review partitioned jobs.", href: `${SEC(9)}#partitioning` }],
  components: ["job-scheduler", "worker", "message-queue", "batch-scoring-job", "object-storage"],
  checks: [
    rule("Split the input into partitions on a queue that scoring instances pull from.", (c) => c.path("message-queue", "batch-scoring-job"), { category: "Partitioning", label: "Work queue", points: 20 }),
    rule("Retry failed partitions and dead-letter the ones that keep failing.", queueSafety, { category: "reliability", label: "Retries" }),
    rule("Run at least four scoring instances in parallel.", (c) => scoringInstances(c) >= 4, { category: "capacity", label: "Parallelism" }),
    configIs("batch-scoring-job", "publish", "Write new version, then swap", "Write results as a new version and swap only when every partition is done.", "Correctness", 15),
  ],
  reference: {
    config: ["Scheduler -> partition planner -> queue (5 retries, DLQ) -> 8 scoring instances -> new version in object storage, swapped at the end."],
    explanation: ["Partitions turn one long fragile job into many short retryable ones that run in parallel.", "Publishing a new version means readers see the old scores or the new ones, never a mix."],
    graph: {
      nodes: [
        n("sched", "job-scheduler", 40, 200, { schedule: "0 1 * * *", durability: "Durable store" }),
        n("planner", "worker", 260, 200, { instances: 1, idempotent: "Enabled" }),
        n("q", "message-queue", 480, 200, { retry: "Enabled", maxRetries: 5, dlqEnabled: "Enabled" }),
        n("batch", "batch-scoring-job", 700, 200, { instances: 8, publish: "Write new version, then swap" }),
        n("out", "object-storage", 920, 200, { versioning: "Enabled" }),
      ],
      edges: w("sched>planner>q>batch>out"),
    },
  },
};

const CHANGED = 1.5e6;
const toScore = (c: Ctx) => (c.is("batch-scoring-job", "scope", "Changed records only") ? CHANGED : 50e6);
const incremental: ProblemDef = {
  code: "ML0035",
  slug: "rescoring-everything-every-night",
  title: "Rescoring Everything Every Night",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Abbotsford rescores all 50 million users every night, but only about 3% of users (1.5 million) have any new activity in a day. Everyone else gets the same score as yesterday at full price. Score only what changed, still finish inside the three-hour window, and do it with two instances or fewer.",
  guide: {
    title: "Incremental scoring",
    description: "A change feed tells the scoring job which users to rescore.",
    flow: ["postgresql", "event-stream", "batch-scoring-job", "dynamodb"],
    secondary: { title: "Trigger", flow: ["job-scheduler", "batch-scoring-job"] },
    notes: ["Each scoring instance handles 1,000 users per second."],
  },
  concepts: ["Incremental scoring", "Change feeds"],
  reading: [{ title: "Batch inference learning path", description: "Review incremental jobs.", href: `${SEC(9)}#incremental` }],
  components: ["postgresql", "event-stream", "job-scheduler", "feature-store", "batch-scoring-job", "dynamodb"],
  checks: [
    configIs("batch-scoring-job", "scope", "Changed records only", "Rescore only users whose data changed.", "cost", 25),
    rule("Feed the job a change log of updated users.", (c) => c.edge("event-stream", "batch-scoring-job"), { category: "validity", label: "Change feed", points: 15 }),
    rule("Use two scoring instances or fewer.", (c) => c.has("batch-scoring-job") && scoringInstances(c) <= 2, { category: "cost", label: "Fleet size" }),
    rule("Finish within the 3-hour window at 80% or less.", (c) => scoringInstances(c) * SCORE_RATE * 0.8 * WINDOW_S >= toScore(c), {
      category: "capacity",
      label: "Window",
      fail: (c) => `Scoring ${fmt(toScore(c))} users takes ${(toScore(c) / Math.max(1, scoringInstances(c) * SCORE_RATE) / 3600).toFixed(1)} hours.`,
    }),
  ],
  reference: {
    config: ["Activity database -> change stream -> scoring job (changed records only, 1 instance) -> DynamoDB. 1.5M users take 25 minutes (31% of the window at 80%)."],
    explanation: ["When most inputs don't change, most outputs don't either. Incremental jobs pay only for real change.", "The change feed is the contract that tells the job what's new."],
    graph: {
      nodes: [
        n("db", "postgresql", 40, 280),
        n("changes", "event-stream", 280, 280, { partitions: 6, replicationFactor: 3 }),
        n("sched", "job-scheduler", 280, 80, { schedule: "0 2 * * *", durability: "Durable store" }),
        n("fs", "feature-store", 280, 440, { onlineStore: "Redis" }),
        n("batch", "batch-scoring-job", 520, 260, { instances: 1, scope: "Changed records only", publish: "Write new version, then swap" }),
        n("scores", "dynamodb", 760, 260),
      ],
      edges: w("db>changes>batch>scores", "sched>batch", "fs>batch"),
    },
  },
};

const halfWritten: ProblemDef = {
  code: "ML0036",
  slug: "half-written-scores",
  title: "Half-Written Scores",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Bramwell's scoring job overwrites the scores table row by row. Between 2 and 4 AM half the users have new scores and half old, and when the job crashed last week it left that mix in production for a day. A bad model once wrote nulls for everyone. Publish scores atomically, validate them first, and keep the previous version for rollback.",
  guide: {
    title: "Atomic publishing",
    description: "Write a complete new version, validate it, then switch readers over in one step.",
    flow: ["job-scheduler", "batch-scoring-job", "data-validator", "dataset-store"],
    secondary: { title: "Readers", flow: ["load-balancer", "application-server", "dataset-store"] },
    notes: ["Readers should only ever see a whole version."],
  },
  concepts: ["Atomic publishing", "Output validation"],
  reading: [{ title: "Batch inference learning path", description: "Review publishing patterns.", href: `${SEC(9)}#publishing` }],
  components: ["job-scheduler", "batch-scoring-job", "data-validator", "dataset-store", "object-storage", "load-balancer", "application-server"],
  checks: [
    configIs("batch-scoring-job", "publish", "Write new version, then swap", "Write a complete new version, then swap.", "Correctness", 25),
    rule("Validate scores before they're published.", (c) =>
      c.path("batch-scoring-job", "data-validator") &&
      c.nodes("data-validator").some((v) => E.str(v.config.schemaChecks) === "Enabled" && E.num(v.config.maxNullPercent, 100) <= 1), {
      category: "Quality",
      label: "Validation",
      points: 15,
    }),
    rule("Keep previous versions so a bad publish can be rolled back.", (c) =>
      c.nodes("dataset-store").some((d) => E.str(d.config.versioning) === "Immutable snapshots") || c.nodes("object-storage").some((o) => E.str(o.config.versioning) === "Enabled"), {
      category: "reliability",
      label: "Versions",
    }),
    rule("Serve scores to the app from the published store.", (c) => c.nodes("application-server").some((a) => E.outgoing(c.g, a.id).some((x) => x.type === "dataset-store" || x.type === "object-storage" || x.type === "dynamodb")), {
      category: "validity",
      label: "Readers",
    }),
  ],
  reference: {
    config: ["Scheduler -> scoring job (new version, then swap) -> validator (schema checks, at most 1% nulls) -> dataset store (immutable snapshots) <- app."],
    explanation: ["In-place overwrites expose every intermediate state. Version-and-swap exposes only finished ones.", "Validation before the swap stops a broken model's output from ever being read."],
    graph: {
      nodes: [
        n("sched", "job-scheduler", 40, 120, { schedule: "0 2 * * *", durability: "Durable store" }),
        n("batch", "batch-scoring-job", 280, 120, { instances: 6, publish: "Write new version, then swap" }),
        n("validator", "data-validator", 520, 120, { schemaChecks: "Enabled", maxNullPercent: 1 }),
        n("scores", "dataset-store", 760, 200, { versioning: "Immutable snapshots" }),
        n("lb", "load-balancer", 280, 320, { healthChecks: "Enabled" }),
        n("app", "application-server", 520, 320, { size: "Medium", instances: 2 }),
      ],
      edges: w("sched>batch>validator>scores", "lb>app>scores"),
    },
  },
};

/* ---------------- Online Inference & Model Serving ---------------- */

const modelServers = ["m1", "m2", "m3"];
const fiveThousand: ProblemDef = {
  code: "ML0037",
  slug: "serving-5000-predictions-per-second",
  title: "Serving 5,000 Predictions per Second",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Calder's pricing model must answer 5,000 predictions per second at peak. Keep model servers at 70% CPU or less, and keep answering at 90% or less if the largest group of servers fails. Each Large model server handles about 800 predictions per second.",
  guide: {
    title: "Serving tier",
    description: "A health-checked load balancer in front of several model server groups.",
    flow: ["load-balancer", "model-server"],
    notes: ["The failure test removes the largest model server group."],
  },
  concepts: ["Serving capacity", "Failure headroom"],
  reading: [{ title: "Online inference learning path", description: "Review serving capacity.", href: `${SEC(10)}#capacity` }],
  components: ["load-balancer", "model-server", "model-registry"],
  checks: [
    rule("Serve predictions from model servers behind a load balancer.", (c) => c.path("load-balancer", "model-server"), { category: "validity", label: "Serving path" }),
    rule("Serve 5,000 predictions per second at 70% CPU or less.", (c) => modelRps(c) * 0.7 >= 5000, {
      category: "capacity",
      label: "Capacity",
      points: 25,
      pass: (c) => `Model servers provide ${fmt(modelRps(c))} RPS (${Math.round((5000 / modelRps(c)) * 100)}% at peak).`,
      fail: (c) => `Model servers provide ${fmt(modelRps(c))} RPS; 5,000 at 70% needs 7,143.`,
    }),
    configIs("load-balancer", "healthChecks", "Enabled", "Turn on health checks so failed servers stop receiving traffic.", "reliability", 10),
    rule("Keep serving at 90% CPU or less after losing the largest server group.", (c) => survivorRps(c) * 0.9 >= 5000, {
      category: "reliability",
      label: "Server loss",
      points: 15,
      fail: (c) => `After losing the largest group, ${fmt(survivorRps(c))} RPS remain for 5,000 RPS.`,
    }),
  ],
  reference: {
    config: ["Load balancer (health checks) -> three groups of 4 Large model servers (9,600 RPS, 52%). Losing one leaves 6,400 RPS (78%)."],
    explanation: ["Size for the peak with headroom, then check the degraded case: the failure you plan for is the one that doesn't page you.", "Several smaller groups waste less spare capacity than two large ones."],
    graph: {
      nodes: [
        n("lb", "load-balancer", 40, 200, { healthChecks: "Enabled" }),
        ...modelServers.map((id, i) => n(id, "model-server", 300, 70 + i * 130, { size: "Large", instances: 4 })),
        n("registry", "model-registry", 560, 200, { immutableVersions: "Enabled" }),
      ],
      edges: [...modelServers.map((id) => ({ source: "lb", target: id })), ...modelServers.map((id) => ({ source: "registry", target: id }))],
    },
  },
};

const scalerOn = (c: Ctx, id: string) => c.nodes("auto-scaling").find((s) => E.linkedEitherWay(c.g, s.id, id));
const perInstance = (m: ReturnType<Ctx["nodes"]>[number]) => E.serverCapacityRps({ ...m, config: { ...m.config, instances: 1 } });
const readyIn60s = (c: Ctx) =>
  modelTier(c).reduce((sum, m) => {
    const s = scalerOn(c, m.id);
    const warm = s ? Math.min(E.num(s.config.warmPool), Math.max(0, E.num(s.config.max, 1) - E.instancesOf(m))) : 0;
    return sum + perInstance(m) * (E.instancesOf(m) + warm);
  }, 0);
const coldStarts: ProblemDef = {
  code: "ML0038",
  slug: "cold-starts-at-the-morning-peak",
  title: "Cold Starts at the Morning Peak",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Dunmore's model servers take three minutes to load a 6 GB model. Traffic jumps from 800 to 3,000 predictions per second within a minute every morning, and by the time new servers are ready the commuters have gone. Have capacity for the peak within 60 seconds, without running the peak fleet all night.",
  guide: {
    title: "Fast scale-out",
    description: "A small always-on fleet plus warm instances that already have the model loaded.",
    flow: ["load-balancer", "model-server"],
    secondary: { title: "Scaling policy", flow: ["auto-scaling", "model-server"] },
    notes: ["Each Large model server handles about 800 predictions per second.", "Warm-pool instances have the model loaded and join in seconds."],
  },
  concepts: ["Model cold starts", "Warm pools"],
  reading: [{ title: "Online inference learning path", description: "Review warm pools.", href: `${SEC(10)}#warm-pools` }],
  components: ["load-balancer", "model-server", "auto-scaling"],
  checks: [
    rule("Attach an autoscaling policy to the model servers.", (c) => modelTier(c).some((m) => !!scalerOn(c, m.id)), { category: "validity", label: "Scaling policy" }),
    rule("Have capacity for 3,000 predictions per second at 80% CPU within 60 seconds.", (c) => readyIn60s(c) * 0.8 >= 3000, {
      category: "capacity",
      label: "Ready in 60 s",
      points: 25,
      fail: (c) => `Only ${fmt(readyIn60s(c))} RPS can be serving within 60 seconds; models take 3 minutes to load.`,
    }),
    rule("Keep warm instances with the model preloaded.", (c) => modelTier(c).some((m) => E.num(scalerOn(c, m.id)?.config.warmPool) > 0), { category: "Scaling speed", label: "Warm pool", points: 15 }),
    rule("Keep the always-on fleet small: 800 predictions per second should run at 45% CPU or more.", (c) => modelRps(c) > 0 && 800 / modelRps(c) >= 0.45, { category: "cost", label: "Baseline size" }),
  ],
  reference: {
    config: ["Model servers: Large, 2 always on (800 RPS at 50%).", "Auto Scaling: min 2, max 8, warm pool 3. Within 60 s: 5 x 800 = 4,000 RPS (75% at 3,000)."],
    explanation: ["Model loading makes cold starts slower than for typical services; scaling decisions arrive on time but capacity doesn't.", "Warm instances keep the model in memory, so joining the fleet takes seconds."],
    graph: {
      nodes: [
        n("lb", "load-balancer", 40, 200, { healthChecks: "Enabled" }),
        n("serve", "model-server", 300, 200, { size: "Large", instances: 2, coldStartSeconds: 180 }),
        n("as", "auto-scaling", 300, 40, { metric: "Request concurrency", min: 2, max: 8, warmPool: 3, scaleOutCooldownSec: 30 }),
      ],
      edges: w("lb>serve", "as>serve"),
    },
  },
};

const warehouseLookups: ProblemDef = {
  code: "ML0039",
  slug: "features-fetched-from-the-warehouse",
  title: "Features Fetched From the Warehouse",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Elsworth's recommendation API queries the data warehouse for features on every request. p99 latency is 900 ms and the warehouse bill climbs with traffic. Serve features from an online store, keep predictions inside 100 ms, and return a sensible default when the model can't answer in time.",
  guide: {
    title: "Online serving path",
    description: "Features are materialized into an online store; model servers look them up in milliseconds.",
    flow: ["load-balancer", "model-server", "feature-store"],
    secondary: { title: "Materialization", flow: ["object-storage", "worker", "feature-store"] },
    notes: ["A warehouse is built for scans, not millions of single-row lookups."],
  },
  concepts: ["Online feature lookup", "Fallbacks"],
  reading: [{ title: "Online inference learning path", description: "Review online features.", href: `${SEC(10)}#online-features` }],
  components: ["load-balancer", "model-server", "feature-store", "object-storage", "worker"],
  checks: [
    configIs("model-server", "featureLookup", "Online feature store", "Look up features in the online feature store, not the warehouse.", "Latency", 25, { all: true }),
    rule("Back the feature store with an online tier (Redis or DynamoDB).", (c) => c.edge("model-server", "feature-store") && c.nodes("feature-store").some((f) => E.str(f.config.onlineStore, "None") !== "None"), {
      category: "Latency",
      label: "Online tier",
      points: 15,
    }),
    numberAtMost("model-server", "timeoutMs", 100, "Time out predictions after 100 ms or less.", "Latency", 10),
    configIs("model-server", "fallback", "Cached / default prediction", "Return a cached or default prediction when the model times out.", "reliability", 15),
  ],
  reference: {
    config: ["Lake -> materialization workers -> feature store (Redis online tier).", "Model servers: online feature lookups, 80 ms timeout, default-prediction fallback."],
    explanation: ["Online stores answer single-key lookups in a millisecond or two; warehouses take hundreds.", "A fallback turns a slow model into a slightly worse answer instead of an error."],
    graph: {
      nodes: [
        n("lb", "load-balancer", 40, 120, { healthChecks: "Enabled" }),
        n("serve", "model-server", 300, 120, { size: "Large", instances: 3, featureLookup: "Online feature store", timeoutMs: 80, fallback: "Cached / default prediction" }),
        n("fs", "feature-store", 560, 220, { onlineStore: "Redis", freshness: "Hourly batch", sharedDefinitions: "Enabled" }),
        n("lake", "object-storage", 40, 320),
        n("pipe", "worker", 300, 320, { instances: 2 }),
      ],
      edges: w("lb>serve>fs", "lake>pipe>fs"),
    },
  },
};

const INFERENCE_MS: Record<string, number> = { Small: 40, Medium: 30, Large: 22, XL: 18, "2XL": 15 };
/** Estimated request latency: gateway, app, feature lookup and inference. */
const requestMs = (c: Ctx) => {
  const m = c.first("model-server");
  if (!m) return Infinity;
  const gateway = c.has("api-gateway") ? 5 : 0;
  const app = c.edge("application-server", "model-server") ? 10 : 0;
  const features = E.str(m.config.featureLookup) === "Online feature store" && c.edge("model-server", "feature-store") ? 5 : 400;
  return gateway + app + features + (INFERENCE_MS[E.str(m.config.size, "Medium")] ?? 30);
};
const budget50: ProblemDef = {
  code: "ML0040",
  slug: "the-50-ms-budget",
  title: "The 50 ms Budget",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Fenwick's ad server must decide which ad to show within 50 ms end to end, at 2,000 requests per second. The request passes the gateway (5 ms) and the ad service (10 ms), then the model needs features and an inference. Fit the whole path inside the budget, at 70% CPU or less, and always return something in time.",
  guide: {
    title: "Latency budget",
    description: "Spend the 50 ms deliberately: online features, a model size that infers fast enough, a strict timeout and a fallback.",
    flow: ["api-gateway", "application-server", "model-server", "feature-store"],
    notes: ["Inference: Small 40 ms, Medium 30, Large 22, XL 18, 2XL 15.", "Online feature lookup is about 5 ms; a warehouse query about 400 ms."],
  },
  concepts: ["Latency budgets", "Timeouts and fallbacks"],
  reading: [{ title: "Online inference learning path", description: "Review latency budgets.", href: `${SEC(10)}#latency-budgets` }],
  components: ["api-gateway", "application-server", "model-server", "feature-store"],
  checks: [
    rule("Call the model from the ad service behind an API gateway.", (c) => c.path("api-gateway", "application-server", "model-server"), { category: "validity", label: "Request path" }),
    rule("Fit the request path inside 50 ms.", (c) => requestMs(c) <= 50, {
      category: "Latency",
      label: "Budget",
      points: 25,
      pass: (c) => `Estimated latency is ${requestMs(c)} ms.`,
      fail: (c) => (Number.isFinite(requestMs(c)) ? `Estimated latency is ${requestMs(c)} ms against a 50 ms budget.` : "There's no model server."),
    }),
    numberAtMost("model-server", "timeoutMs", 40, "Time out the model call after 40 ms or less.", "Latency", 10),
    configIs("model-server", "fallback", "Cached / default prediction", "Fall back to a default ad when the model times out.", "reliability", 15),
    rule("Serve 2,000 requests per second at 70% model-server CPU or less.", (c) => c.nodes("model-server").reduce((s, m) => s + E.serverCapacityRps(m), 0) * 0.7 >= 2000, {
      category: "capacity",
      label: "Capacity",
    }),
  ],
  reference: {
    config: ["Gateway (5 ms) -> ad service (10 ms) -> Large model servers x4 (22 ms inference, 35 ms timeout, default fallback) -> online features (5 ms). Total about 42 ms."],
    explanation: ["A latency budget is a sum, so every hop has to earn its milliseconds.", "The timeout plus fallback guarantees an answer inside the budget even when the model is slow."],
    graph: {
      nodes: [
        n("gw", "api-gateway", 40, 200),
        n("ads", "application-server", 260, 200, { size: "Large", instances: 3 }),
        n("serve", "model-server", 500, 200, { size: "Large", instances: 4, featureLookup: "Online feature store", timeoutMs: 35, fallback: "Cached / default prediction" }),
        n("fs", "feature-store", 740, 200, { onlineStore: "Redis", sharedDefinitions: "Enabled" }),
      ],
      edges: w("gw>ads>serve>fs"),
    },
  },
};

export const ML_SERVING: ProblemDef[] = [
  sharedDrive,
  stagingFirst,
  oneClick,
  manyModels,
  fullRescore,
  partitioned,
  incremental,
  halfWritten,
  fiveThousand,
  coldStarts,
  warehouseLookups,
  budget50,
];
