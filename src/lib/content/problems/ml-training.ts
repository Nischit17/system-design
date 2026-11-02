import type { ProblemDef } from "../types";
import { configIs, fmt, node as n, numberAtLeast, numberAtMost, rule, wire as w } from "../builders";
import type { Ctx } from "@/lib/sim/evaluate";
import * as E from "@/lib/sim/engine";
import { GPU_TABLE } from "@/lib/sim/tables";

const SEC = (n: number) => `/tracks/ml-training-foundations/sections/ml-ai-system-design-section-${n}`;

type GraphNode = ReturnType<Ctx["nodes"]>[number];
const immutableDatasets = (c: Ctx) => c.nodes("dataset-store").some((d) => E.str(d.config.versioning) === "Immutable snapshots");
const tracks = (c: Ctx, ...keys: string[]) => c.nodes("experiment-tracker").some((t) => keys.every((k) => E.str(t.config[k]) === "Enabled"));
const trackerLinkedToRegistry = (c: Ctx) => c.nodes("experiment-tracker").some((t) => c.nodes("model-registry").some((r) => E.linkedEitherWay(c.g, t.id, r.id)));

/** Samples per second a training job can process on its GPUs. Single-node jobs top out at 8 GPUs. */
const gpuThroughput = (t: GraphNode) => {
  const gpu = GPU_TABLE[E.str(t.config.gpuType, "A100")] ?? GPU_TABLE.A100;
  const count = Math.max(1, E.num(t.config.gpuCount, 1));
  const parallel = E.str(t.config.strategy) === "Data parallel";
  const usable = parallel ? count : Math.min(count, 8);
  return gpu.samplesPerSec * usable * (parallel && usable > 1 ? 0.9 : 1);
};
const fastest = (c: Ctx) => c.nodes("training-job").reduce((m, t) => Math.max(m, gpuThroughput(t)), 0);

/* ---------------- Training Infrastructure ---------------- */

const SAMPLES = 1.5e9;
const NEEDED_RATE = SAMPLES / 86400;
const oneGpu: ProblemDef = {
  code: "ML0017",
  slug: "one-gpu-isnt-enough",
  title: "One GPU Isn't Enough",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Ashby Labs trains a vision model on 50 million images for 30 epochs, which is 1.5 billion samples. On a single A100 that takes about a month, and the product team needs a new model every day. Scale training so a full run finishes within 24 hours and a GPU failure partway through doesn't restart it.",
  guide: {
    title: "Training path",
    description: "A data-parallel job reads versioned data, checkpoints regularly and publishes to the registry.",
    flow: ["dataset-store", "training-job", "model-registry"],
    secondary: { title: "Checkpoints", flow: ["training-job", "object-storage"] },
    notes: ["Per GPU: T4 120, A100 600, H100 1,400 samples/s.", "Data-parallel scaling is about 90% efficient; a single node holds at most 8 GPUs."],
  },
  concepts: ["Data-parallel training", "Throughput planning"],
  reading: [{ title: "Training infrastructure learning path", description: "Review distributed training.", href: `${SEC(5)}#data-parallel` }],
  components: ["dataset-store", "training-job", "object-storage", "model-registry"],
  checks: [
    rule("Train from the dataset store.", (c) => c.edge("dataset-store", "training-job"), { category: "validity", label: "Training data" }),
    configIs("training-job", "strategy", "Data parallel", "Use data-parallel training across GPUs.", "Scaling", 20),
    rule("Reach 17,400 samples per second so 30 epochs finish within 24 hours.", (c) => fastest(c) >= NEEDED_RATE, {
      category: "capacity",
      label: "Throughput",
      points: 20,
      pass: (c) => `${fmt(fastest(c))} samples/s: a run takes ${(SAMPLES / fastest(c) / 3600).toFixed(1)} hours.`,
      fail: (c) => (fastest(c) > 0 ? `${fmt(fastest(c))} samples/s: a run takes ${(SAMPLES / fastest(c) / 3600).toFixed(0)} hours.` : "There's no training job."),
    }),
    numberAtMost("training-job", "checkpointMinutes", 60, "Checkpoint at least hourly so a failed GPU doesn't restart the run.", "reliability", 10),
    rule("Write checkpoints to object storage.", (c) => c.edge("training-job", "object-storage"), { category: "reliability", label: "Checkpoint store" }),
  ],
  reference: {
    config: ["Training job: 16 x H100, data parallel (20,160 samples/s, 20.7 hours per run), checkpoint every 30 minutes to object storage."],
    explanation: [
      "Data parallelism splits each batch across GPUs, so throughput grows almost linearly with GPU count.",
      "Longer runs on more GPUs fail more often; checkpoints make a failure cost minutes instead of the whole run.",
    ],
    graph: {
      nodes: [
        n("data", "dataset-store", 40, 200, { versioning: "Immutable snapshots" }),
        n("train", "training-job", 300, 200, { gpuType: "H100", gpuCount: 16, strategy: "Data parallel", checkpointMinutes: 30 }),
        n("ckpt", "object-storage", 560, 320),
        n("registry", "model-registry", 560, 100),
      ],
      edges: w("data>train>registry", "train>ckpt"),
    },
  },
};

const GPU_DEMAND = 16 * 600 * 0.9;
const storageSupply = (c: Ctx, t: GraphNode) =>
  E.incoming(c.g, t.id).reduce((best, src) => {
    if (src.type === "shared-filesystem")
      return Math.max(best, E.str(src.config.throughputMode) === "Provisioned" ? E.num(src.config.provisionedIops) / 2 : 5000);
    if (src.type === "object-storage" || src.type === "dataset-store") return Math.max(best, 3500);
    return best;
  }, 0);
const inputRate = (c: Ctx) => c.nodes("training-job").reduce((m, t) => Math.max(m, Math.min(storageSupply(c, t), E.num(t.config.dataLoaderThroughputSamplesPerSec, 2000))), 0);
const waitingOnData: ProblemDef = {
  code: "ML0018",
  slug: "gpus-waiting-on-data",
  title: "GPUs Waiting on Data",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Brightmoor pays for 16 A100s that sit at 35% utilization. The GPUs could process about 8,600 samples per second, but training streams JPEGs from object storage at 3,500 per second and decodes them on the fly. Feed the GPUs fast enough to keep them busy.",
  guide: {
    title: "Input pipeline",
    description: "Preprocess and shard data ahead of time onto a provisioned filesystem; size data loaders to match the GPUs.",
    flow: ["object-storage", "worker", "shared-filesystem", "training-job"],
    notes: ["Object storage delivers about 3,500 samples/s to one job; a bursting filesystem about 5,000.", "A provisioned filesystem delivers one sample per 2 provisioned IOPS."],
  },
  concepts: ["Input bottlenecks", "GPU utilization"],
  reading: [{ title: "Training infrastructure learning path", description: "Review input pipelines.", href: `${SEC(5)}#input-pipelines` }],
  components: ["object-storage", "worker", "shared-filesystem", "training-job"],
  checks: [
    rule("Read training data from a shared filesystem.", (c) => c.edge("shared-filesystem", "training-job"), { category: "validity", label: "Fast storage" }),
    configIs("shared-filesystem", "throughputMode", "Provisioned", "Provision filesystem throughput instead of relying on burst credits.", "capacity", 15),
    rule("Feed the GPUs at least 8,640 samples per second through storage and data loaders.", (c) => inputRate(c) >= GPU_DEMAND, {
      category: "capacity",
      label: "Input rate",
      points: 25,
      pass: (c) => `Input delivers ${fmt(inputRate(c))} samples/s; GPUs stay fully busy.`,
      fail: (c) => `Input delivers ${fmt(inputRate(c))} samples/s, so GPUs run at ${Math.round(Math.min(1, inputRate(c) / GPU_DEMAND) * 100)}%.`,
    }),
    rule("Preprocess and shard the dataset ahead of time.", (c) => c.path("object-storage", "worker", "shared-filesystem"), { label: "Offline preprocessing" }),
  ],
  reference: {
    config: ["Lake -> preprocessing workers -> shared filesystem (provisioned, 20,000 IOPS = 10,000 samples/s) -> training job (16 x A100, loaders at 10,000 samples/s)."],
    explanation: [
      "A GPU waiting on input is a very expensive idle CPU. Throughput is set by the slowest stage, not the fastest.",
      "Decoding once, offline, and reading pre-sharded files turns random network reads into sequential local ones.",
    ],
    graph: {
      nodes: [
        n("lake", "object-storage", 40, 200),
        n("prep", "worker", 280, 200, { instances: 4, idempotent: "Enabled" }),
        n("fs", "shared-filesystem", 520, 200, { throughputMode: "Provisioned", provisionedIops: 20000 }),
        n("train", "training-job", 760, 200, { gpuType: "A100", gpuCount: 16, strategy: "Data parallel", dataLoaderThroughputSamplesPerSec: 10000, checkpointMinutes: 30 }),
      ],
      edges: w("lake>prep>fs>train"),
    },
  },
};

const trainingJobs = (c: Ctx) => c.nodes("training-job");
const fairShare: ProblemDef = {
  code: "ML0019",
  slug: "fair-share-on-a-shared-cluster",
  title: "Fair Share on a Shared Cluster",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Five teams at Corvid share a 64-GPU cluster scheduled first come, first served. Last week one team submitted a 48-GPU job on Monday morning and everyone else waited until Thursday. Share the cluster fairly, let urgent work preempt big jobs, and make sure preempted jobs lose very little progress.",
  guide: {
    title: "Shared training cluster",
    description: "A scheduler admits jobs under per-team quotas; jobs checkpoint often so preemption is cheap.",
    flow: ["job-scheduler", "training-job", "object-storage"],
    secondary: { title: "Data", flow: ["dataset-store", "training-job"] },
    notes: ["Preemption only works if stopping a job is cheap."],
  },
  concepts: ["Multi-tenant scheduling", "Preemption and checkpoints"],
  reading: [{ title: "Training infrastructure learning path", description: "Review cluster sharing.", href: `${SEC(5)}#fair-share` }],
  components: ["job-scheduler", "training-job", "dataset-store", "object-storage"],
  checks: [
    rule("Submit training jobs through a scheduler.", (c) => c.path("job-scheduler", "training-job"), { category: "validity", label: "Scheduler" }),
    rule("Run every training job under fair-share quotas.", (c) => trainingJobs(c).length >= 2 && c.all("training-job", "scheduling", "Fair-share quotas"), {
      category: "Isolation",
      label: "Fair share",
      points: 25,
    }),
    rule("Checkpoint every 30 minutes or less so a preempted job loses little work.", (c) => trainingJobs(c).length > 0 && trainingJobs(c).every((t) => E.num(t.config.checkpointMinutes) > 0 && E.num(t.config.checkpointMinutes) <= 30), {
      category: "reliability",
      label: "Cheap preemption",
      points: 15,
    }),
    rule("Cap each team's concurrent jobs in the scheduler.", (c) => c.nodes("job-scheduler").some((j) => E.num(j.config.concurrencyLimit) > 0 && E.num(j.config.concurrencyLimit) <= 20), {
      category: "Isolation",
      label: "Team caps",
    }),
  ],
  reference: {
    config: ["Scheduler (durable, 8 concurrent jobs per team) -> training jobs on fair-share quotas, each checkpointing every 20 minutes to object storage."],
    explanation: [
      "First come, first served lets whoever submits first hold the cluster. Fair share gives each team a guaranteed slice and lends idle capacity out.",
      "Frequent checkpoints make preemption a pause instead of a loss.",
    ],
    graph: {
      nodes: [
        n("sched", "job-scheduler", 40, 220, { durability: "Durable store", concurrencyLimit: 8 }),
        n("data", "dataset-store", 300, 40),
        ...["a", "b", "c"].map((t, i) => n(`job-${t}`, "training-job", 300, 160 + i * 120, { gpuType: "A100", gpuCount: 8, strategy: "Data parallel", checkpointMinutes: 20, scheduling: "Fair-share quotas" })),
        n("ckpt", "object-storage", 560, 280),
      ],
      edges: w("sched>job-a>ckpt", "sched>job-b>ckpt", "sched>job-c>ckpt", "data>job-a", "data>job-b", "data>job-c"),
    },
  },
};

const hour70: ProblemDef = {
  code: "ML0020",
  slug: "the-crash-at-hour-70",
  title: "The Crash at Hour 70",
  difficulty: "Easy",
  minutes: 12,
  description:
    "Ellery's 72-hour training run crashed at hour 70 when a node failed. There were no checkpoints, so the team restarted from zero and missed a launch. Make long runs survive failures and pick up close to where they left off, automatically.",
  guide: {
    title: "Resumable training",
    description: "Checkpoint often to durable storage; a durable scheduler restarts failed runs from the latest checkpoint.",
    flow: ["job-scheduler", "training-job", "object-storage"],
    notes: ["The cost of a failure is the time since the last checkpoint."],
  },
  concepts: ["Checkpointing", "Automatic resumption"],
  reading: [{ title: "Training infrastructure learning path", description: "Review checkpointing.", href: `${SEC(5)}#checkpoints` }],
  components: ["job-scheduler", "training-job", "dataset-store", "object-storage"],
  checks: [
    numberAtMost("training-job", "checkpointMinutes", 60, "Checkpoint at least every 60 minutes.", "reliability", 25),
    rule("Write checkpoints to object storage.", (c) => c.edge("training-job", "object-storage"), { category: "validity", label: "Checkpoint store" }),
    rule("Resume failed runs automatically from a durable scheduler.", (c) => c.nodes("job-scheduler").some((j) => E.str(j.config.durability) === "Durable store" && E.outgoing(c.g, j.id).some((x) => x.type === "training-job")), {
      category: "reliability",
      label: "Auto-resume",
      points: 15,
    }),
    configIs("object-storage", "versioning", "Enabled", "Version checkpoints so a corrupt write never replaces the last good one.", "reliability", 10),
  ],
  reference: {
    config: ["Durable scheduler -> training job (checkpoint every 30 minutes) -> versioned object storage."],
    explanation: ["With 30-minute checkpoints a node failure costs at most 30 minutes, not 70 hours.", "Versioning protects against the worst case: a crash in the middle of writing a checkpoint."],
    graph: {
      nodes: [
        n("sched", "job-scheduler", 40, 120, { durability: "Durable store" }),
        n("data", "dataset-store", 40, 300),
        n("train", "training-job", 300, 200, { gpuType: "A100", gpuCount: 8, strategy: "Data parallel", checkpointMinutes: 30 }),
        n("ckpt", "object-storage", 560, 200, { versioning: "Enabled" }),
      ],
      edges: w("sched>train>ckpt", "data>train"),
    },
  },
};

/* ---------------- Experiment Tracking & Reproducibility ---------------- */

const whichData: ProblemDef = {
  code: "ML0021",
  slug: "which-data-trained-this-model",
  title: "Which Data Trained This Model?",
  difficulty: "Easy",
  minutes: 12,
  description:
    "Galloway's training table is overwritten every Sunday. When last month's model started misbehaving, nobody could say which data it was trained on, and the data no longer existed anyway. Make every model traceable to the exact data it learned from.",
  guide: {
    title: "Traceable training",
    description: "Training reads immutable snapshots, and each run records the snapshot it used.",
    flow: ["dataset-store", "training-job", "experiment-tracker"],
    notes: ["Overwrite in place destroys the evidence."],
  },
  concepts: ["Data versioning", "Run tracking"],
  reading: [{ title: "Reproducibility learning path", description: "Review data versioning.", href: `${SEC(6)}#data-versions` }],
  components: ["dataset-store", "training-job", "experiment-tracker", "model-registry"],
  checks: [
    rule("Train from immutable dataset snapshots.", (c) => immutableDatasets(c) && c.edge("dataset-store", "training-job"), { category: "Reproducibility", label: "Snapshots", points: 25 }),
    rule("Log every run to an experiment tracker.", (c) => c.edge("training-job", "experiment-tracker"), { category: "validity", label: "Tracking" }),
    configIs("experiment-tracker", "logDataVersion", "Enabled", "Record the dataset snapshot each run used.", "Reproducibility", 15),
    configIs("experiment-tracker", "logCodeVersion", "Enabled", "Record the code version each run used.", "Reproducibility", 10),
  ],
  reference: {
    config: ["Dataset store (immutable snapshots) -> training job -> experiment tracker (data and code versions) and model registry."],
    explanation: ["Immutable snapshots keep the evidence; the tracker records which piece of evidence each model used.", "Together they answer 'what trained this?' in seconds."],
    graph: {
      nodes: [
        n("ds", "dataset-store", 40, 200, { versioning: "Immutable snapshots" }),
        n("train", "training-job", 300, 200),
        n("tracker", "experiment-tracker", 560, 100, { logCodeVersion: "Enabled", logDataVersion: "Enabled" }),
        n("registry", "model-registry", 560, 300),
      ],
      edges: w("ds>train>tracker", "train>registry"),
    },
  },
};

const lineage: ProblemDef = {
  code: "ML0022",
  slug: "lineage-from-model-to-code",
  title: "Lineage From Model to Code",
  difficulty: "Medium",
  minutes: 15,
  description:
    "A pricing model at Hartwell started quoting oddly low prices. To debug it, engineers need to go from the production model to the exact code, data, hyperparameters and environment that produced it, but the registry only stores model files. Build lineage from every registered model back to how it was made.",
  guide: {
    title: "Lineage path",
    description: "Training logs everything to the tracker; the registry links each version to its run.",
    flow: ["dataset-store", "training-job", "experiment-tracker", "model-registry", "model-server"],
    notes: ["Lineage is only useful if it's complete: one missing input breaks the chain."],
  },
  concepts: ["Model lineage", "Immutable model versions"],
  reading: [{ title: "Reproducibility learning path", description: "Review lineage.", href: `${SEC(6)}#lineage` }],
  components: ["dataset-store", "training-job", "experiment-tracker", "model-registry", "model-server"],
  checks: [
    rule("Link the tracker and the registry so every model version points to its run.", (c) => c.path("training-job", "experiment-tracker") && trackerLinkedToRegistry(c), { category: "validity", label: "Linked lineage" }),
    configIs("experiment-tracker", "logCodeVersion", "Enabled", "Log the code version.", "Lineage", 10),
    configIs("experiment-tracker", "logDataVersion", "Enabled", "Log the data version.", "Lineage", 10),
    configIs("experiment-tracker", "logHyperparameters", "Enabled", "Log hyperparameters.", "Lineage", 10),
    configIs("experiment-tracker", "logEnvironment", "Enabled", "Log the software environment.", "Lineage", 10),
    configIs("model-registry", "immutableVersions", "Enabled", "Make registered versions immutable.", "Lineage", 10),
  ],
  reference: {
    config: ["Training job -> experiment tracker (code, data, hyperparameters, environment) -> model registry (immutable versions) -> model servers."],
    explanation: ["Each logged input answers one 'what changed?' question during an incident.", "Immutable versions guarantee the model you're tracing is the one that was serving."],
    graph: {
      nodes: [
        n("ds", "dataset-store", 40, 200, { versioning: "Immutable snapshots" }),
        n("train", "training-job", 260, 200),
        n("tracker", "experiment-tracker", 500, 200, { logCodeVersion: "Enabled", logDataVersion: "Enabled", logHyperparameters: "Enabled", logEnvironment: "Enabled" }),
        n("registry", "model-registry", 740, 200, { immutableVersions: "Enabled" }),
        n("serve", "model-server", 980, 200, { size: "Medium", instances: 2 }),
      ],
      edges: w("ds>train>tracker>registry>serve"),
    },
  },
};

const myMachine: ProblemDef = {
  code: "ML0023",
  slug: "it-worked-on-my-machine",
  title: "It Worked on My Machine",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Three weeks after a successful experiment, a Kinloch engineer reran it and got 4 points lower accuracy. A library had been upgraded, the random train/validation split came out differently, and the learning-rate schedule had only ever been set in a notebook. Make any run reproducible by anyone, later.",
  guide: {
    title: "Reproducible runs",
    description: "Freeze the data and its split, and record the environment and every hyperparameter.",
    flow: ["dataset-store", "training-job", "experiment-tracker"],
    notes: ["A split stored with the snapshot can't come out differently next time."],
  },
  concepts: ["Reproducibility", "Deterministic splits"],
  reading: [{ title: "Reproducibility learning path", description: "Review reproducible training.", href: `${SEC(6)}#reproducibility` }],
  components: ["dataset-store", "training-job", "experiment-tracker"],
  checks: [
    rule("Log every run to an experiment tracker.", (c) => c.edge("training-job", "experiment-tracker"), { category: "validity", label: "Tracking" }),
    configIs("experiment-tracker", "logEnvironment", "Enabled", "Record library versions and hardware.", "Reproducibility", 15),
    configIs("experiment-tracker", "logHyperparameters", "Enabled", "Record every hyperparameter, including seeds.", "Reproducibility", 10),
    rule("Store a deterministic split with the snapshot (by entity or by time).", (c) => c.nodes("dataset-store").some((d) => ["By entity", "By time"].includes(E.str(d.config.splitStrategy))), {
      category: "Reproducibility",
      label: "Stable split",
      points: 15,
    }),
    rule("Train from immutable snapshots.", immutableDatasets, { category: "Reproducibility", label: "Snapshots", points: 15 }),
  ],
  reference: {
    config: ["Dataset store (immutable snapshots, split by entity) -> training job -> tracker (environment, hyperparameters, code, data)."],
    explanation: ["Reproducibility means pinning every input: data, split, code, configuration and environment.", "Miss one and 'rerun it' becomes 'run something similar'."],
    graph: {
      nodes: [
        n("ds", "dataset-store", 40, 200, { versioning: "Immutable snapshots", splitStrategy: "By entity" }),
        n("train", "training-job", 300, 200),
        n("tracker", "experiment-tracker", 560, 200, { logCodeVersion: "Enabled", logDataVersion: "Enabled", logHyperparameters: "Enabled", logEnvironment: "Enabled" }),
      ],
      edges: w("ds>train>tracker"),
    },
  },
};

const auditReady: ProblemDef = {
  code: "ML0024",
  slug: "audit-ready-credit-models",
  title: "Audit-Ready Credit Models",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Thornwick's credit-limit models are now regulated. For any decision, auditors can ask which model version made it, what data and code produced that model, who approved it and when. Today none of that is recorded. Build a model lifecycle that can answer those questions years later.",
  guide: {
    title: "Governed lifecycle",
    description: "Tracked training feeds a gated registry; every promotion is approved and permanently logged.",
    flow: ["dataset-store", "training-job", "experiment-tracker", "model-registry", "model-server"],
    secondary: { title: "Audit trail", flow: ["model-registry", "audit-log"] },
    notes: ["Regulators care about who decided, not just what was deployed."],
  },
  concepts: ["Model governance", "Approval gates"],
  reading: [{ title: "Reproducibility learning path", description: "Review governance requirements.", href: `${SEC(6)}#governance` }],
  components: ["dataset-store", "training-job", "experiment-tracker", "model-registry", "audit-log", "model-server"],
  checks: [
    rule("Link the experiment tracker to the registry.", (c) => c.path("training-job", "experiment-tracker") && trackerLinkedToRegistry(c), { category: "validity", label: "Lineage" }),
    rule("Record code and data versions for every run.", (c) => tracks(c, "logCodeVersion", "logDataVersion"), { category: "Lineage", label: "Run records" }),
    configIs("model-registry", "approvalGate", "Enabled", "Require an approval before any model reaches production.", "Governance", 15),
    configIs("model-registry", "immutableVersions", "Enabled", "Make registered versions immutable.", "Governance", 10),
    configIs("model-registry", "promotion", "Staged (staging -> production)", "Promote through staging before production.", "Governance", 10),
    rule("Log every promotion in an immutable audit log.", (c) => c.nodes("audit-log").some((a) => E.str(a.config.immutable) === "Enabled" && c.nodes("model-registry").some((r) => E.linkedEitherWay(c.g, a.id, r.id))), {
      category: "Compliance",
      label: "Audit trail",
      points: 15,
    }),
  ],
  reference: {
    config: [
      "Training -> tracker (code, data, hyperparameters, environment) -> registry (staged, immutable, approval gate) -> model servers.",
      "Registry writes every promotion and approval to an immutable audit log kept 7 years.",
    ],
    explanation: ["Each audit question maps to a record: version (registry), inputs (tracker), decision (approval) and time (audit log).", "Immutability is what makes those records evidence rather than notes."],
    graph: {
      nodes: [
        n("ds", "dataset-store", 40, 200, { versioning: "Immutable snapshots" }),
        n("train", "training-job", 260, 200),
        n("tracker", "experiment-tracker", 500, 200, { logCodeVersion: "Enabled", logDataVersion: "Enabled", logHyperparameters: "Enabled", logEnvironment: "Enabled" }),
        n("registry", "model-registry", 740, 200, { promotion: "Staged (staging -> production)", immutableVersions: "Enabled", approvalGate: "Enabled", rollbackAlias: "Enabled" }),
        n("audit", "audit-log", 740, 380, { immutable: "Enabled", retentionDays: 2555 }),
        n("serve", "model-server", 980, 200, { size: "Medium", instances: 2 }),
      ],
      edges: w("ds>train>tracker>registry>serve", "registry>audit"),
    },
  },
};

/* ---------------- Model Evaluation & Validation ---------------- */

const evalGate = (c: Ctx) => c.path("training-job", "eval-harness", "model-registry");
const segmentRegression: ProblemDef = {
  code: "ML0025",
  slug: "great-on-average-bad-for-new-users",
  title: "Great on Average, Bad for New Users",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Lindqvist's new recommender improved overall click-through by 3% and shipped. It turned out to be 18% worse for new users, who are 15% of traffic and the ones most likely to churn. Evaluate per segment and stop a model from shipping if it regresses any important segment.",
  guide: {
    title: "Evaluation gate",
    description: "Every candidate passes through an evaluation harness with segment-level gates before registration.",
    flow: ["dataset-store", "training-job", "eval-harness", "model-registry"],
    notes: ["An average can improve while every minority segment gets worse."],
  },
  concepts: ["Segment-level evaluation", "Regression gates"],
  reading: [{ title: "Evaluation learning path", description: "Review sliced metrics.", href: `${SEC(7)}#segments` }],
  components: ["dataset-store", "training-job", "eval-harness", "model-registry", "model-server"],
  checks: [
    rule("Evaluate every candidate in an evaluation harness before it's registered.", evalGate, { category: "validity", label: "Evaluation step", points: 15 }),
    numberAtLeast("eval-harness", "goldenSetSize", 5000, "Hold out at least 5,000 labeled examples so each segment has enough data.", "Quality", 10),
    rule("Block a model that regresses any segment by more than 2%.", (c) => c.nodes("eval-harness").some((h) => E.num(h.config.regressionGatePercent) > 0 && E.num(h.config.regressionGatePercent) <= 2), {
      category: "Release safety",
      label: "Segment gate",
      points: 15,
    }),
    configIs("eval-harness", "ciGate", "Enabled", "Run the gate automatically before promotion.", "Release safety", 15),
  ],
  reference: {
    config: ["Training -> evaluation harness (20,000-example holdout, 1% per-segment regression gate, CI gate) -> registry -> serving."],
    explanation: ["Gating on every segment turns 'better on average' into 'better, or at least not worse, for everyone that matters'.", "Automating the gate means it runs even on busy release days."],
    graph: {
      nodes: [
        n("ds", "dataset-store", 40, 200, { versioning: "Immutable snapshots", splitStrategy: "By entity" }),
        n("train", "training-job", 260, 200),
        n("eval", "eval-harness", 500, 200, { goldenSetSize: 20000, judge: "Exact match", regressionGatePercent: 1, ciGate: "Enabled" }),
        n("registry", "model-registry", 740, 200, { promotion: "Staged (staging -> production)" }),
        n("serve", "model-server", 980, 200, { size: "Medium", instances: 2 }),
      ],
      edges: w("ds>train>eval>registry>serve"),
    },
  },
};

const deploymentGates: ProblemDef = {
  code: "ML0026",
  slug: "deployment-gates",
  title: "Deployment Gates",
  difficulty: "Medium",
  minutes: 15,
  description:
    "A Pembury model that predicted zero for every input reached production because promotion meant copying a file to a bucket. It took three hours to notice and two more to restore the previous model. Put gates between a trained model and production, and make going back instant.",
  guide: {
    title: "Gated promotion",
    description: "Automated evaluation, staged promotion with approval, and a rollback alias.",
    flow: ["training-job", "eval-harness", "model-registry", "model-server"],
    notes: ["A gate that a person can forget to run isn't a gate."],
  },
  concepts: ["Deployment gates", "Rollback"],
  reading: [{ title: "Evaluation learning path", description: "Review release gates.", href: `${SEC(7)}#gates` }],
  components: ["dataset-store", "training-job", "eval-harness", "model-registry", "model-server", "load-balancer"],
  checks: [
    rule("Gate every candidate with an automated evaluation before registration.", (c) => evalGate(c) && c.is("eval-harness", "ciGate", "Enabled"), { category: "Release safety", label: "CI evaluation", points: 15 }),
    configIs("model-registry", "promotion", "Staged (staging -> production)", "Promote through staging before production.", "Release safety", 15),
    configIs("model-registry", "approvalGate", "Enabled", "Require an approval for production promotion.", "Release safety", 10),
    configIs("model-registry", "rollbackAlias", "Enabled", "Serve production through an alias that can point back to the previous version instantly.", "reliability", 15),
  ],
  reference: {
    config: ["Training -> evaluation harness (CI gate) -> registry (staged promotion, approval, rollback alias) -> model servers."],
    explanation: ["Automated checks catch obviously broken models; staging and approval catch subtler ones.", "A rollback alias turns recovery from a redeploy into a pointer change."],
    graph: {
      nodes: [
        n("ds", "dataset-store", 40, 200, { versioning: "Immutable snapshots" }),
        n("train", "training-job", 260, 200),
        n("eval", "eval-harness", 500, 200, { goldenSetSize: 10000, judge: "Exact match", regressionGatePercent: 1, ciGate: "Enabled" }),
        n("registry", "model-registry", 740, 200, { promotion: "Staged (staging -> production)", immutableVersions: "Enabled", rollbackAlias: "Enabled", approvalGate: "Enabled" }),
        n("lb", "load-balancer", 740, 380, { healthChecks: "Enabled" }),
        n("serve", "model-server", 980, 280, { size: "Medium", instances: 2 }),
      ],
      edges: w("ds>train>eval>registry>serve", "lb>serve"),
    },
  },
};

const routedModels = (c: Ctx) => c.nodes("traffic-router").some((r) => E.outgoing(c.g, r.id).filter((x) => x.type === "model-server").length >= 2);
const championChallenger: ProblemDef = {
  code: "ML0027",
  slug: "champion-vs-challenger",
  title: "Champion vs. Challenger",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Quayside's new ranking model beats the current one offline, but offline wins have fooled the team before. Test it on real traffic: send a small share of requests to the challenger, compare both models side by side, and pull it automatically if it does worse.",
  guide: {
    title: "Online comparison",
    description: "A traffic router splits requests; both models report the same metrics.",
    flow: ["load-balancer", "traffic-router", "model-server"],
    extra: [
      { title: "Metrics", flow: ["model-server", "telemetry-collector", "metrics-store"] },
      { title: "Versions", flow: ["model-registry", "model-server"] },
    ],
    notes: ["Compare like with like: same traffic slice, same metrics, same time window."],
  },
  concepts: ["Champion/challenger testing", "Online evaluation"],
  reading: [{ title: "Evaluation learning path", description: "Review online experiments.", href: `${SEC(7)}#champion-challenger` }],
  components: ["load-balancer", "traffic-router", "model-server", "model-registry", "telemetry-collector", "metrics-store"],
  checks: [
    rule("Split live traffic between champion and challenger with a traffic router.", routedModels, { category: "validity", label: "Two models" }),
    rule("Send 10% or less of traffic to the challenger.", (c) => c.is("traffic-router", "strategy", "Canary") && c.nodes("traffic-router").some((r) => E.num(r.config.canaryPercent) > 0 && E.num(r.config.canaryPercent) <= 10), {
      category: "Release safety",
      label: "Small slice",
      points: 15,
    }),
    configIs("traffic-router", "autoRollback", "Enabled", "Pull the challenger automatically if it regresses.", "Release safety", 15),
    rule("Report percentile metrics from both models.", (c) => c.has("model-server", 2) && c.every("model-server", "telemetry-collector") && c.path("telemetry-collector", "metrics-store") && c.is("metrics-store", "aggregation", "Percentiles (p50/p95/p99)"), {
      category: "Visibility",
      label: "Side-by-side metrics",
    }),
    configIs("model-registry", "rollbackAlias", "Enabled", "Keep a rollback alias for the champion.", "reliability", 10),
  ],
  reference: {
    config: ["Load balancer -> traffic router (canary 5%, auto rollback) -> champion (Large x4) and challenger (Large x1).", "Both report to a percentile metrics store; the registry serves both versions with a rollback alias."],
    explanation: ["Offline metrics predict; online tests decide. A small canary bounds the cost of being wrong.", "Automatic rollback ends a bad test in minutes, not after someone checks a dashboard."],
    graph: {
      nodes: [
        n("lb", "load-balancer", 40, 220, { healthChecks: "Enabled" }),
        n("router", "traffic-router", 260, 220, { strategy: "Canary", canaryPercent: 5, autoRollback: "Enabled" }),
        n("champ", "model-server", 500, 120, { size: "Large", instances: 4 }),
        n("chall", "model-server", 500, 320, { size: "Large", instances: 1 }),
        n("registry", "model-registry", 500, -20, { promotion: "Staged (staging -> production)", rollbackAlias: "Enabled" }),
        n("collector", "telemetry-collector", 740, 220),
        n("metrics", "metrics-store", 980, 220, { aggregation: "Percentiles (p50/p95/p99)", retentionDays: 30 }),
      ],
      edges: w("lb>router>champ>collector>metrics", "router>chall>collector", "registry>champ", "registry>chall"),
    },
  },
};

const leakySplit: ProblemDef = {
  code: "ML0028",
  slug: "the-leak-in-the-split",
  title: "The Leak in the Split",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Vesper's churn model scores 0.95 AUC offline and 0.70 in production. The training set was split by random rows, so the same customer appears in both training and validation, and features were joined as of today, so validation rows can see the future. Rebuild the evaluation so offline numbers are honest.",
  guide: {
    title: "Leakage-free training sets",
    description: "Build snapshots with point-in-time features and split them by time.",
    flow: ["feature-store", "worker", "dataset-store", "training-job"],
    notes: ["If the validation set could never have existed at prediction time, its score is fiction."],
  },
  concepts: ["Data leakage", "Time-based splits"],
  reading: [{ title: "Evaluation learning path", description: "Review leakage.", href: `${SEC(7)}#leakage` }],
  components: ["feature-store", "worker", "dataset-store", "training-job", "eval-harness"],
  checks: [
    rule("Split by time (or by customer), never by random rows.", (c) => c.nodes("dataset-store").some((d) => ["By time", "By entity"].includes(E.str(d.config.splitStrategy))), {
      category: "Correctness",
      label: "Honest split",
      points: 25,
    }),
    configIs("feature-store", "pointInTimeJoins", "Enabled", "Join features as of each example's timestamp.", "Correctness", 15),
    rule("Build training snapshots from the feature store.", (c) => c.path("feature-store", "worker", "dataset-store") || c.edge("feature-store", "dataset-store"), { category: "validity", label: "Snapshot builder" }),
    rule("Freeze each training set as an immutable snapshot.", immutableDatasets, { category: "Reproducibility", label: "Snapshots" }),
  ],
  reference: {
    config: ["Feature store (point-in-time joins) -> snapshot builder -> dataset store (immutable, split by time) -> training -> evaluation."],
    explanation: ["Random row splits leak a customer's own history into validation; time splits mimic deployment, where the model only sees the past.", "Point-in-time joins make each row's features exactly what was known then."],
    graph: {
      nodes: [
        n("fs", "feature-store", 40, 200, { onlineStore: "Redis", pointInTimeJoins: "Enabled", sharedDefinitions: "Enabled" }),
        n("builder", "worker", 260, 200, { instances: 2, idempotent: "Enabled" }),
        n("ds", "dataset-store", 500, 200, { versioning: "Immutable snapshots", splitStrategy: "By time" }),
        n("train", "training-job", 740, 200),
        n("eval", "eval-harness", 980, 200, { goldenSetSize: 10000, judge: "Exact match", ciGate: "Enabled", regressionGatePercent: 2 }),
      ],
      edges: w("fs>builder>ds>train>eval"),
    },
  },
};

export const ML_TRAINING: ProblemDef[] = [
  oneGpu,
  waitingOnData,
  fairShare,
  hour70,
  whichData,
  lineage,
  myMachine,
  auditReady,
  segmentRegression,
  deploymentGates,
  championChallenger,
  leakySplit,
];
