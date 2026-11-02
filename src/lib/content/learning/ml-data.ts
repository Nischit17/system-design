import type { Guide } from "./types";

export const ML_FUNDAMENTALS_GUIDE: Guide = {
  sectionId: "ml-ai-system-design-section-1",
  kicker: "Section 01 · Foundation",
  title: "ML System Architecture Fundamentals",
  intro:
    "A model is a small part of a machine learning system. This guide covers the boundary between training and serving, models as versioned artifacts, choosing batch or online prediction, the feature layer that keeps both sides consistent, and the lifecycle that takes a model from a notebook to monitored production.",
  byTheEnd: "You can draw the core architecture of an ML system, pick the prediction style a use case needs, and explain how a model gets from training to production safely.",
  chapters: [
    {
      id: "boundary",
      kicker: "Two different workloads",
      title: "The training/serving boundary",
      navTitle: "Training vs. Serving",
      summary: "Training is batch and heavy; serving is latency-sensitive.",
      intro: [
        "Training reads lots of historical data and saturates CPUs or GPUs for hours. Serving answers individual requests in milliseconds and needs predictable headroom every second. Running both on the same machines means every training run hurts prediction latency.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Training", tone: "info", points: ["Batch, hours of compute", "Reads historical datasets", "Produces a model artifact"] },
            { title: "Serving", tone: "success", points: ["Online, milliseconds per request", "Reads fresh features", "Loads a published artifact"] },
          ],
        },
        {
          type: "flow",
          steps: [
            { label: "Dataset store", tone: "info" },
            { label: "Training job", tone: "warning" },
            { label: "Model registry", tone: "accent" },
            { label: "Model servers", tone: "success" },
          ],
          caption: "The registry is the only connection between the two sides.",
        },
      ],
    },
    {
      id: "artifacts",
      kicker: "Models are build outputs",
      title: "Models as artifacts",
      navTitle: "Model Artifacts",
      summary: "Version models like releases, not files on a drive.",
      intro: ["A trained model is a build artifact: weights plus the code and configuration needed to run them. Treat it like a software release, with an immutable version, a record of how it was built and a controlled path to production."],
      blocks: [
        {
          type: "terms",
          items: [
            ["Artifact", "The serialized model plus metadata needed to load it."],
            ["Model registry", "The catalog of model versions and which one is live where."],
            ["Promotion", "Moving a version from staging to production."],
          ],
        },
      ],
    },
    {
      id: "batch-vs-online",
      kicker: "When predictions are needed",
      title: "Batch vs. online prediction",
      navTitle: "Batch vs. Online",
      summary: "Precompute what can wait; score live only what must be live.",
      intro: [
        "Weekly recommendation emails can be computed in bulk overnight and stored as rows to look up. A fraud check at checkout must use what's happening right now, within the checkout's latency budget. Pick the style per use case, not per company.",
      ],
      blocks: [
        {
          type: "table",
          head: ["", "Batch", "Online"],
          rows: [
            ["When", "On a schedule", "Per request"],
            ["Latency", "Hours are fine", "Milliseconds"],
            ["Input freshness", "As of the last run", "Right now"],
            ["Cost profile", "Cheap bulk compute", "Always-on serving fleet"],
            ["Examples", "Email recommendations, churn scores", "Fraud checks, search ranking"],
          ],
        },
        { type: "key", text: "Online models need a timeout and a safe fallback answer. When the model is slow, the user still needs a decision." },
      ],
    },
    {
      id: "feature-layer",
      kicker: "One definition, two speeds",
      title: "The feature layer",
      navTitle: "The Feature Layer",
      summary: "Training and serving must compute features the same way.",
      intro: [
        "If data scientists compute features in SQL for training and engineers reimplement them in another language for serving, the two drift apart and the model sees different inputs in production than it learned from. A feature store defines each feature once and serves it offline for training and online for serving.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Pipelines", tone: "info" },
            { label: "Feature store", sub: "Shared definitions", tone: "accent" },
            { label: "Training + serving", sub: "Offline and online", tone: "success" },
          ],
          caption: "Same definitions, served at two latencies.",
        },
      ],
    },
    {
      id: "lifecycle",
      kicker: "Notebook to production",
      title: "The ML lifecycle",
      navTitle: "The ML Lifecycle",
      summary: "Versioned data, tracked training, staged promotion, monitoring.",
      intro: ["Every manual step in shipping a model (emailing a file, remembering which data was used, copying weights onto servers) is a place things go wrong. The lifecycle replaces each with a recorded, repeatable step."],
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            "Train from immutable dataset snapshots.",
            "Track every run: code, data, parameters, environment.",
            "Register the model and promote it through staging.",
            "Serve it behind a load balancer with timeouts and fallbacks.",
            "Monitor latency, prediction distributions and outcomes.",
          ],
        },
      ],
    },
    {
      id: "monitoring",
      kicker: "Models decay",
      title: "Monitoring models in production",
      navTitle: "Monitoring Models",
      summary: "Data drifts, so watch inputs and outputs, not just latency.",
      intro: ["A model that was accurate at launch degrades as the world changes. Monitor the serving system (latency, errors), the inputs (feature distributions, missing values) and the outputs (prediction distributions, and real outcomes once labels arrive)."],
      blocks: [
        {
          type: "table",
          head: ["Watch", "Signals"],
          rows: [
            ["System", "p99 latency, error rate, fallback rate"],
            ["Inputs", "Feature drift, null rates, schema violations"],
            ["Outputs", "Score distribution, positive rate"],
            ["Outcomes", "Accuracy against labels as they arrive"],
          ],
        },
      ],
    },
  ],
};

export const ML_DATA_COLLECTION_GUIDE: Guide = {
  sectionId: "ml-ai-system-design-section-2",
  kicker: "Section 02 · Foundation",
  title: "Data Collection & Labeling",
  intro:
    "Models learn from the data you manage to collect and the labels you can trust. This guide covers capturing events without losing them, labels that arrive late, scaling human labeling, label quality, and keeping personal data out of training sets.",
  byTheEnd: "You can design event capture that doesn't skew your data, build training sets with mature labels, size a labeling operation, and filter sensitive data before it's stored.",
  chapters: [
    {
      id: "events",
      kicker: "Don't lose the evidence",
      title: "Capturing events",
      navTitle: "Event Capture",
      summary: "Publish to a replicated stream; land events with idempotent consumers.",
      intro: [
        "Writing every click straight into a transactional database works until peak traffic, when inserts time out and events are silently dropped. Dropped events aren't random: they cluster in busy periods, so training data becomes biased toward quiet hours.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "App servers", tone: "info" },
            { label: "Event stream", sub: "Replicated, 72 h retention", tone: "warning" },
            { label: "Landing workers", sub: "Idempotent", tone: "accent" },
            { label: "Data lake", tone: "success" },
          ],
          caption: "Retention turns a consumer bug into a replay instead of a hole in the data.",
        },
      ],
    },
    {
      id: "schemas",
      kicker: "Data you can use later",
      title: "Designing event schemas",
      navTitle: "Event Schemas",
      summary: "Log what the model will need, with ids and timestamps.",
      intro: ["Events are only useful for training if they carry what you'll need to join them later: stable ids, event time (not just processing time), and the context the decision was made in."],
      blocks: [
        {
          type: "list",
          items: [
            "Stable entity ids: user, item, session, request.",
            "Event time from the source, plus ingestion time.",
            "A schema version so consumers can evolve safely.",
            "The context shown to the user, such as the ranked list they saw.",
          ],
        },
      ],
    },
    {
      id: "late-labels",
      kicker: "The truth arrives later",
      title: "Delayed labels",
      navTitle: "Delayed Labels",
      summary: "Wait for labels to mature, and log features at decision time.",
      intro: [
        "Fraud labels come from chargebacks, which can arrive 60 days after the purchase. Joining today's features with whatever labels exist marks recent fraud as legitimate. Two fixes: log the features the model actually saw at decision time, and only join labels once they've had time to mature.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Naive join", tone: "danger", points: ["Recent rows have no label yet", "Treated as negatives", "Model learns fraud is rare"] },
            { title: "Matured, time-split", tone: "success", points: ["Join after the label window", "Features as logged at decision time", "Split training data by time"] },
          ],
        },
      ],
    },
    {
      id: "labeling",
      kicker: "Humans in the loop",
      title: "Labeling throughput",
      navTitle: "Labeling Throughput",
      summary: "Labelers, items per hour, and what active learning saves.",
      intro: [
        "Human labeling is a capacity problem like any other: items per week against labelers times their throughput. Consensus review raises quality but multiplies work; active learning sends only the items the model is unsure about, cutting volume.",
      ],
      blocks: [
        { type: "formula", lines: ["labels needed per week = items x share sent (active learning) x labels per item (consensus)", "labeler capacity = labelers x items per hour x hours per week"] },
        {
          type: "table",
          head: ["Setup", "Labels/week for 200k items", "Labelers at 1,600/week"],
          rows: [
            ["Single review, everything", "200,000", "125"],
            ["Consensus (x2.5), everything", "500,000", "313"],
            ["Consensus + active learning (40%)", "200,000", "125"],
          ],
        },
      ],
    },
    {
      id: "label-quality",
      kicker: "Labels can be wrong",
      title: "Label quality",
      navTitle: "Label Quality",
      summary: "Consensus, agreement metrics and gold questions.",
      intro: ["A 9% label error rate caps how good a model can get, because it learns the errors too. Measure label quality, don't assume it."],
      blocks: [
        {
          type: "list",
          items: [
            "Consensus: two or three labelers per item, majority wins.",
            "Inter-annotator agreement to spot ambiguous guidelines.",
            "Gold questions with known answers to track each labeler.",
            "Clear guidelines with examples of hard cases.",
          ],
        },
      ],
    },
    {
      id: "pii",
      kicker: "Keep it out",
      title: "Filtering personal data",
      navTitle: "PII Filtering",
      summary: "Redact before storage; models can memorize what they see.",
      intro: [
        "Support tickets contain emails, phone numbers and card numbers. Models can memorize and repeat training data, so the only safe training set is one that never contained personal data. Validate every record on its way in: redact PII, check the schema, drop duplicates.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Raw data", sub: "Short retention", tone: "warning" },
            { label: "Validator", sub: "Redact, check, dedupe", tone: "accent" },
            { label: "Dataset store", sub: "Clean only", tone: "success" },
          ],
          caption: "Raw data expires quickly; only validated data is kept for training.",
        },
      ],
    },
  ],
};

export const ML_PIPELINES_GUIDE: Guide = {
  sectionId: "ml-ai-system-design-section-3",
  kicker: "Section 03 · Foundation",
  title: "Data Pipelines & Preprocessing",
  intro:
    "Pipelines turn raw events into training data and features. This guide covers how pipelines are built, sizing them to finish inside a batch window, choosing freshness, making steps safe to retry, running backfills without breaking today's data, and validating data as it flows.",
  byTheEnd: "You can size a pipeline against its deadline, decide which data must stream, and design preprocessing that can be retried and backfilled without corrupting anything.",
  chapters: [
    {
      id: "anatomy",
      kicker: "Inputs to outputs",
      title: "Anatomy of a data pipeline",
      navTitle: "Pipeline Anatomy",
      summary: "Extract, transform, validate, publish.",
      intro: ["Most ML pipelines follow the same shape: read raw data, transform it, validate the result, and publish a new version for training or serving. Each step should be restartable."],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Raw data", tone: "info" },
            { label: "Transform", tone: "warning" },
            { label: "Validate", tone: "accent" },
            { label: "Publish version", tone: "success" },
          ],
          caption: "A scheduler with durable state runs the steps and retries failures.",
        },
      ],
    },
    {
      id: "windows",
      kicker: "Finish before the deadline",
      title: "Batch windows",
      navTitle: "Batch Windows",
      summary: "Throughput is events divided by the seconds you have.",
      intro: ["If 1.2 billion events must be preprocessed between 1 AM and 5 AM, the pipeline needs about 83,000 events per second, plus headroom for a slow night."],
      blocks: [
        { type: "formula", lines: ["required rate = events / window seconds", "workers = required rate / (rate per worker x target utilization)"] },
        {
          type: "table",
          head: ["Workers (25,000 events/s each)", "Hours for 1.2B events", "Fits a 4 h window?"],
          rows: [
            ["1", "13.3", "No"],
            ["4", "3.3", "Barely, no headroom"],
            ["5", "2.7", "Yes, 67% of the window"],
          ],
        },
      ],
    },
    {
      id: "freshness",
      kicker: "How old is too old",
      title: "Freshness",
      navTitle: "Freshness",
      summary: "Stream what changes in minutes; batch the rest.",
      intro: ["A nightly feature can't describe something that changes every few minutes, like whether a restaurant is open. Streaming pipelines compute those features continuously; slower-changing data stays in cheaper batch jobs."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Batch", tone: "info", points: ["Hourly or daily", "Cheap and simple", "Fine for slow-changing data"] },
            { title: "Streaming", tone: "accent", points: ["Seconds to minutes", "Always-on consumers", "For fast-changing signals"] },
          ],
        },
      ],
    },
    {
      id: "idempotency",
      kicker: "Safe to run twice",
      title: "Idempotent preprocessing",
      navTitle: "Idempotent Steps",
      summary: "Retries must rewrite, not append.",
      intro: [
        "A pipeline that fails halfway and retries by appending the whole day again doubles that day's data, and the next model learns from the duplicate. Idempotent steps overwrite by key or write a new immutable version, so a retry produces the same result as a single run.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Append on retry", tone: "danger", points: ["Partial runs leave duplicates", "Counts silently inflate", "Hard to detect later"] },
            { title: "Write a new version", tone: "success", points: ["Retries replace partial output", "Bad runs are thrown away", "Consumers switch atomically"] },
          ],
        },
      ],
    },
    {
      id: "backfills",
      kicker: "Rewriting history safely",
      title: "Backfills",
      navTitle: "Backfills",
      summary: "Separate pools, separate versions, then switch.",
      intro: [
        "Recomputing two years of features with a new definition is a large job that must not touch today's data or slow the daily run. Give the backfill its own worker pool (autoscaled on its backlog) and its own output version, and switch consumers only after it's complete and validated.",
      ],
      blocks: [
        { type: "list", ordered: true, items: ["Write the backfill to a new dataset version.", "Run it on a separate, autoscaled worker pool.", "Validate the new version against the old.", "Switch consumers in one step."] },
      ],
    },
    {
      id: "validation",
      kicker: "Catch bad data early",
      title: "Validating data as it flows",
      navTitle: "Data Validation",
      summary: "Schema, ranges, nulls and duplicates, checked at every step.",
      intro: ["A bad upstream change can quietly corrupt a training set. Check data at each step and stop the pipeline before publishing if checks fail."],
      blocks: [
        {
          type: "table",
          head: ["Check", "Catches"],
          rows: [
            ["Schema", "Missing or renamed columns, type changes"],
            ["Null rate", "Broken joins or upstream outages"],
            ["Ranges and distributions", "Unit changes, outliers"],
            ["Duplicates", "Retries that appended"],
          ],
        },
      ],
    },
  ],
};

export const FEATURE_STORE_GUIDE: Guide = {
  sectionId: "ml-ai-system-design-section-4",
  kicker: "Section 04 · Foundation",
  title: "Feature Engineering & Feature Stores",
  intro:
    "Features are where most ML bugs hide. This guide covers training/serving skew, point-in-time correctness, sizing the online store, freshness tiers, and sharing features across teams without everyone rebuilding the same thing.",
  byTheEnd: "You can remove the common causes of skew, size an online feature store for a latency target, and design a feature platform several teams can share.",
  chapters: [
    {
      id: "feature-stores",
      kicker: "Offline and online",
      title: "What a feature store does",
      navTitle: "What a Feature Store Does",
      summary: "One set of definitions, served for training and for serving.",
      intro: ["A feature store holds feature definitions and their values. The offline store serves large historical joins for training; the online store serves the latest values for each entity in milliseconds."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Offline store", tone: "info", points: ["Full history", "Point-in-time joins", "Read by training jobs"] },
            { title: "Online store", tone: "accent", points: ["Latest value per entity", "Millisecond lookups", "Read by model servers"] },
          ],
        },
      ],
    },
    {
      id: "skew",
      kicker: "Offline 0.91, online 0.74",
      title: "Training/serving skew",
      navTitle: "Training/Serving Skew",
      summary: "The model sees different inputs in production than in training.",
      intro: [
        "Skew comes from two implementations of the same feature (different time zones, rounding, defaults) or from training data that includes information unavailable at prediction time. Shared definitions remove the first; point-in-time joins remove the second.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Cause", "Fix"],
          rows: [
            ["Feature computed twice, differently", "One shared definition in the feature store"],
            ["Training joined with today's values", "Point-in-time joins"],
            ["Serving reads stale or missing values", "Online store with freshness monitoring"],
          ],
        },
      ],
    },
    {
      id: "point-in-time",
      kicker: "No peeking at the future",
      title: "Point-in-time correctness",
      navTitle: "Point-in-Time Joins",
      summary: "Join each example with features as they were at that moment.",
      intro: ["For an impression at 10:00, 'items viewed in the last hour' must be computed from 9:00 to 10:00, not from whatever the value is today. Point-in-time joins look up each feature's value as of each example's timestamp."],
      blocks: [
        { type: "key", text: "Leakage makes offline metrics look wonderful and production disappointing. If an offline result seems too good, check the joins first." },
      ],
    },
    {
      id: "online-sizing",
      kicker: "Fit the working set",
      title: "Sizing the online store",
      navTitle: "Online Store Sizing",
      summary: "Lookups per second, working set and headroom.",
      intro: [
        "Every prediction reads several features, so lookups are predictions times features per prediction. When the working set doesn't fit in the online store's memory, lookups fall back to slower storage and tail latency explodes.",
      ],
      blocks: [
        { type: "formula", lines: ["lookups/s = predictions/s x features per prediction", "online memory = working set x 1.25 headroom"] },
        {
          type: "table",
          head: ["Input", "Value"],
          rows: [
            ["Predictions per second", "4,000"],
            ["Features per prediction", "12"],
            ["Lookups per second", "48,000"],
            ["Working set", "120 GB"],
            ["Online store with headroom", "150 GB"],
          ],
        },
      ],
    },
    {
      id: "freshness-tiers",
      kicker: "Pay for freshness per feature",
      title: "Freshness tiers",
      navTitle: "Freshness Tiers",
      summary: "Stream session features, batch the slow ones, serve them together.",
      intro: ["Session clicks change every second, purchase counts hourly, demographics monthly. Streaming everything triples pipeline cost for no benefit. Stream the fast features, batch the slow ones, and serve all of them from the same online store."],
      blocks: [
        {
          type: "table",
          head: ["Feature", "Changes", "Pipeline"],
          rows: [
            ["Items viewed this session", "Seconds", "Streaming"],
            ["Purchases in last 30 days", "Hourly", "Hourly batch"],
            ["Account age, region", "Rarely", "Daily batch"],
          ],
        },
      ],
    },
    {
      id: "reuse",
      kicker: "Build once",
      title: "Sharing features across teams",
      navTitle: "Feature Reuse",
      summary: "One definition, one pipeline, many consumers.",
      intro: ["When three teams compute 'purchases in the last 30 days' three ways, products disagree and costs triple. A shared platform publishes validated features under shared definitions that every team's training jobs and model servers read."],
      blocks: [
        { type: "list", items: ["Discoverable definitions with owners.", "Validation before publishing.", "Point-in-time joins for everyone's training sets.", "One online store serving all teams."] },
      ],
    },
  ],
};
