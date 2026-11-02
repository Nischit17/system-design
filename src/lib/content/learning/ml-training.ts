import type { Guide } from "./types";

export const TRAINING_INFRA_GUIDE: Guide = {
  sectionId: "ml-ai-system-design-section-5",
  kicker: "Section 01 · Foundation",
  title: "Training Infrastructure",
  intro:
    "Training is a throughput problem: samples per second against a deadline and a budget. This guide covers the arithmetic of training time, data-parallel scaling, keeping GPUs fed, sharing a cluster fairly, checkpointing long runs, and what GPUs really cost.",
  byTheEnd: "You can size a training job to a deadline, find whether GPUs or input are the bottleneck, share a cluster without one team hogging it, and make long runs survive failures.",
  chapters: [
    {
      id: "throughput-math",
      kicker: "Samples per second",
      title: "Training time from first principles",
      navTitle: "Training Time Math",
      summary: "Total samples divided by throughput.",
      intro: ["50 million images for 30 epochs is 1.5 billion samples. Divide by the samples per second your hardware sustains and you have the training time; fix the deadline and you have the throughput you need."],
      blocks: [
        { type: "formula", lines: ["total samples = dataset size x epochs", "training time = total samples / samples per second", "required throughput = total samples / deadline seconds"] },
        {
          type: "table",
          head: ["GPU", "Samples/s (labs)", "Monthly cost"],
          rows: [
            ["T4", "120", "$260"],
            ["A100", "600", "$1,900"],
            ["H100", "1,400", "$3,300"],
          ],
        },
      ],
    },
    {
      id: "data-parallel",
      kicker: "More GPUs, same model",
      title: "Data-parallel training",
      navTitle: "Data-Parallel Training",
      summary: "Split each batch across GPUs, average the gradients.",
      intro: [
        "In data parallelism every GPU holds a copy of the model and processes a slice of each batch; gradients are averaged before each update. Throughput grows almost linearly with GPU count, minus communication overhead, around 90% efficiency in the labs.",
      ],
      blocks: [
        { type: "formula", lines: ["throughput ≈ GPUs x samples per GPU x scaling efficiency (~0.9)"] },
        {
          type: "table",
          head: ["Setup", "Samples/s", "Time for 1.5B samples"],
          rows: [
            ["1 x A100", "600", "about 29 days"],
            ["16 x H100, data parallel", "20,160", "about 21 hours"],
          ],
        },
        { type: "key", text: "Single-node training tops out at the GPUs one machine holds (often 8). Beyond that, distributed data parallelism is required." },
      ],
    },
    {
      id: "input-pipelines",
      kicker: "Feed the GPUs",
      title: "Input pipelines",
      navTitle: "Input Pipelines",
      summary: "Throughput is set by the slowest stage: storage, decode or GPU.",
      intro: [
        "Sixteen A100s can process about 8,600 samples per second, but if the data loader streams JPEGs from object storage at 3,500 per second, the GPUs sit idle 60% of the time. Preprocess and shard data ahead of time onto fast storage, and give the loader enough decode workers.",
      ],
      blocks: [
        { type: "formula", lines: ["effective throughput = min(storage rate, loader rate, GPU rate)"] },
        {
          type: "bars",
          items: [
            { label: "GPU capacity", value: 8640, max: 10000, tone: "info" },
            { label: "Object storage stream", value: 3500, max: 10000, tone: "danger", note: "GPUs at 40%" },
            { label: "Provisioned filesystem", value: 10000, max: 10000, tone: "success", note: "GPUs saturated" },
          ],
          unit: " samples/s",
          caption: "Fix the slowest stage first.",
        },
      ],
    },
    {
      id: "fair-share",
      kicker: "One cluster, many teams",
      title: "Sharing a cluster fairly",
      navTitle: "Fair-Share Scheduling",
      summary: "Quotas, preemption and per-team caps.",
      intro: [
        "First come, first served lets whoever submits a 48-GPU job on Monday hold the cluster all week. Fair-share scheduling gives each team a guaranteed slice, lends idle capacity out, and preempts borrowed capacity when its owner needs it back.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "First come, first served", tone: "danger", points: ["Big jobs block everyone", "No guarantees per team", "Idle capacity wasted between jobs"] },
            { title: "Fair-share quotas", tone: "success", points: ["Guaranteed slice per team", "Idle capacity borrowed", "Preemption reclaims it"] },
          ],
        },
      ],
    },
    {
      id: "checkpoints",
      kicker: "Long runs fail",
      title: "Checkpointing",
      navTitle: "Checkpointing",
      summary: "A failure costs only the time since the last checkpoint.",
      intro: [
        "A 72-hour run on dozens of GPUs will probably see a hardware failure. Without checkpoints it restarts from zero. Saving model and optimizer state every 30-60 minutes to durable storage, with a scheduler that resumes automatically, turns a failure into a short pause.",
      ],
      blocks: [
        { type: "formula", lines: ["expected loss per failure ≈ checkpoint interval / 2"] },
        { type: "list", items: ["Checkpoint to versioned object storage.", "Resume automatically from the latest checkpoint.", "Checkpoint more often on preemptible capacity."] },
      ],
    },
    {
      id: "gpu-cost",
      kicker: "What a run costs",
      title: "GPU economics",
      navTitle: "GPU Economics",
      summary: "Cost per run, not cost per GPU.",
      intro: ["Faster GPUs cost more per hour but can cost less per run. Compare GPU-hours times price for the whole job, and remember that idle GPUs waiting on input are the most expensive thing in the room."],
      blocks: [
        { type: "formula", lines: ["run cost = GPUs x hours x hourly price", "hourly price ≈ monthly cost / 730"] },
      ],
    },
  ],
};

export const EXPERIMENT_TRACKING_GUIDE: Guide = {
  sectionId: "ml-ai-system-design-section-6",
  kicker: "Section 02 · Foundation",
  title: "Experiment Tracking & Reproducibility",
  intro:
    "If you can't say what produced a model, you can't debug it, audit it or reproduce it. This guide covers tracking experiments, versioning data, lineage from model back to code, reproducible runs, and governance for regulated models.",
  byTheEnd: "You can make any model traceable to its exact data, code, parameters and environment, reproduce a run later, and satisfy an auditor's questions.",
  chapters: [
    {
      id: "tracking",
      kicker: "Write it down",
      title: "Why track experiments",
      navTitle: "Experiment Tracking",
      summary: "Every run recorded, comparable and findable.",
      intro: ["Teams run hundreds of experiments. Without tracking, the best result lives in someone's notebook output. An experiment tracker records each run's inputs, metrics and artifacts so results can be compared and repeated."],
      blocks: [
        {
          type: "table",
          head: ["Record", "Why"],
          rows: [
            ["Code version", "Know exactly what ran"],
            ["Data version", "Know exactly what it learned from"],
            ["Hyperparameters and seeds", "Repeat the run"],
            ["Environment", "Library versions change results"],
            ["Metrics and artifacts", "Compare and promote"],
          ],
        },
      ],
    },
    {
      id: "data-versions",
      kicker: "Data changes too",
      title: "Data versioning",
      navTitle: "Data Versions",
      summary: "Immutable snapshots instead of tables overwritten weekly.",
      intro: ["A training table overwritten every Sunday destroys the evidence of what last month's model learned from. Immutable snapshots keep every version; each run records the snapshot it used."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Overwrite in place", tone: "danger", points: ["Cheapest storage", "History lost", "Runs can't be reproduced"] },
            { title: "Immutable snapshots", tone: "success", points: ["Every version kept", "Runs point at a snapshot", "Old data expired by policy"] },
          ],
        },
      ],
    },
    {
      id: "lineage",
      kicker: "Model to source",
      title: "Lineage",
      navTitle: "Lineage",
      summary: "From a production model back to everything that made it.",
      intro: ["When a production model misbehaves, lineage answers 'what changed?' in minutes: the registry version links to the run, the run links to code, data, parameters and environment. One missing link breaks the chain."],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Production model", tone: "success" },
            { label: "Registry version", sub: "Immutable", tone: "accent" },
            { label: "Tracked run", tone: "warning" },
            { label: "Code, data, params, env", tone: "info" },
          ],
          caption: "Each arrow is a recorded reference, not a memory.",
        },
      ],
    },
    {
      id: "reproducibility",
      kicker: "Same inputs, same model",
      title: "Reproducible runs",
      navTitle: "Reproducibility",
      summary: "Pin data, split, code, configuration and environment.",
      intro: [
        "A run reproduced three weeks later that scores four points lower usually has a mundane cause: an upgraded library, a train/validation split recomputed randomly, or a setting that lived only in a notebook. Reproducibility means pinning every input.",
      ],
      blocks: [
        {
          type: "list",
          items: [
            "Store the split with the snapshot (by entity or time), not recomputed per run.",
            "Log every hyperparameter, including random seeds.",
            "Record library versions and hardware.",
            "Train from code at a recorded commit, never uncommitted notebooks.",
          ],
        },
      ],
    },
    {
      id: "governance",
      kicker: "Regulated models",
      title: "Governance and audit",
      navTitle: "Governance",
      summary: "Who approved which version, when, and on what evidence.",
      intro: ["Credit, insurance and health models face auditors who ask which model made a decision, what produced it, and who approved it. Governance makes those answers records: staged promotion, approval gates, immutable versions and an audit log kept for years."],
      blocks: [
        {
          type: "table",
          head: ["Auditor's question", "Answered by"],
          rows: [
            ["Which model made this decision?", "Immutable registry version"],
            ["What produced it?", "Tracked run and lineage"],
            ["Who approved it, when?", "Approval gate and audit log"],
          ],
        },
      ],
    },
  ],
};

export const MODEL_EVALUATION_GUIDE: Guide = {
  sectionId: "ml-ai-system-design-section-7",
  kicker: "Section 03 · Foundation",
  title: "Model Evaluation & Validation",
  intro:
    "Offline metrics only predict production behaviour if the evaluation reflects production. This guide covers choosing metrics, evaluating per segment, preventing leakage, automated deployment gates, champion/challenger tests, and monitoring after launch.",
  byTheEnd: "You can build an evaluation that catches regressions before release, test models safely on live traffic, and trust that offline numbers mean something.",
  chapters: [
    {
      id: "metrics",
      kicker: "Measure the right thing",
      title: "Choosing evaluation metrics",
      navTitle: "Evaluation Metrics",
      summary: "Metrics that match the decision the model supports.",
      intro: ["Accuracy hides class imbalance; AUC hides threshold choices; a single number hides segments. Pick metrics tied to the decision: precision at the operating threshold for fraud blocks, recall for safety screens, ranking metrics for search."],
      blocks: [
        {
          type: "table",
          head: ["Use case", "Useful metric"],
          rows: [
            ["Fraud blocking", "Precision and recall at the chosen threshold"],
            ["Ranking and search", "NDCG, click-through on top results"],
            ["Forecasting", "Error on the horizon that matters"],
          ],
        },
      ],
    },
    {
      id: "segments",
      kicker: "Great on average",
      title: "Segment-level evaluation",
      navTitle: "Segment Evaluation",
      summary: "An average can improve while important segments get worse.",
      intro: [
        "A recommender that improves overall click-through by 3% can be 18% worse for new users, who are 15% of traffic and the most likely to churn. Evaluate per segment and gate on the worst important segment, not just the average.",
      ],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "Overall", value: 3, max: 20, tone: "success", note: "better" },
            { label: "Returning users", value: 6, max: 20, tone: "success", note: "better" },
            { label: "New users", value: 18, max: 20, tone: "danger", note: "worse" },
          ],
          unit: "% change",
          caption: "Same model, same holdout set, sliced differently.",
        },
      ],
    },
    {
      id: "leakage",
      kicker: "Too good to be true",
      title: "Data leakage",
      navTitle: "Data Leakage",
      summary: "Random splits and future data inflate offline scores.",
      intro: [
        "A churn model at 0.95 AUC offline and 0.70 online almost always leaks. Random row splits put the same customer in training and validation; features joined as of today let validation rows see the future. Split by time or by entity and use point-in-time features.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Random row split", tone: "danger", points: ["Same entity in train and test", "Future information leaks", "Offline score inflated"] },
            { title: "Time or entity split", tone: "success", points: ["Validation mimics deployment", "Only past data in features", "Offline score is honest"] },
          ],
        },
      ],
    },
    {
      id: "gates",
      kicker: "Stop bad models automatically",
      title: "Deployment gates",
      navTitle: "Deployment Gates",
      summary: "Automated checks, staged promotion and human approval.",
      intro: ["A model that predicted zero for every input reached production because promotion meant copying a file. Gates make release a pipeline: an automated evaluation in CI, staged promotion, approval for production, and an alias that can point back to the previous version instantly."],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Training", tone: "info" },
            { label: "Evaluation gate", sub: "Per-segment checks", tone: "warning" },
            { label: "Staging", tone: "accent" },
            { label: "Production", sub: "Rollback alias", tone: "success" },
          ],
          caption: "A gate that a person can forget to run isn't a gate.",
        },
      ],
    },
    {
      id: "champion-challenger",
      kicker: "Decide on real traffic",
      title: "Champion vs. challenger",
      navTitle: "Champion/Challenger",
      summary: "Send a small slice to the new model and compare.",
      intro: ["Offline wins predict; online tests decide. Route a small share of traffic to the challenger, compare it with the champion on the same metrics over the same period, and pull it automatically if it does worse."],
      blocks: [
        { type: "list", items: ["Start the challenger at 5-10% of traffic.", "Compare business metrics and latency percentiles side by side.", "Roll back automatically on regression.", "Run long enough to see weekly patterns."] },
      ],
    },
    {
      id: "post-launch",
      kicker: "It keeps changing",
      title: "Monitoring after launch",
      navTitle: "Post-Launch Monitoring",
      summary: "Drift detection and outcome tracking.",
      intro: ["Evaluation doesn't end at launch. Track input drift and prediction distributions daily, and compare predictions with real outcomes as labels arrive; schedule retraining when performance decays."],
      blocks: [
        { type: "key", text: "Alert on a shift in the prediction distribution: it's often the first visible sign of a broken feature upstream." },
      ],
    },
  ],
};
