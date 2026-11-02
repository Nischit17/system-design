import type { Guide } from "./types";

export const MODEL_REGISTRY_GUIDE: Guide = {
  sectionId: "ml-ai-system-design-section-8",
  kicker: "Section 01 · Foundation",
  title: "Model Registry & Versioning",
  intro:
    "The registry decides which model is live, everywhere. This guide covers the registry as the single source of truth, versions and aliases, staged promotion, instant rollback, and standards that let many teams share one registry.",
  byTheEnd: "You can run model releases through a registry with immutable versions, staging and approval, and roll back a bad model in one step.",
  chapters: [
    {
      id: "source-of-truth",
      kicker: "No more latest.pkl",
      title: "The registry as source of truth",
      navTitle: "Source of Truth",
      summary: "Servers load what the registry says, nothing else.",
      intro: ["When model servers load whatever file is called latest.pkl on a shared drive, anyone saving a file changes production. A registry makes the live version an explicit, controlled decision; servers load only registered versions."],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Training", tone: "info" },
            { label: "Registry", sub: "Immutable versions", tone: "accent" },
            { label: "Model servers", sub: "Load by alias", tone: "success" },
          ],
          caption: "No side doors: servers never read model files from shared storage directly.",
        },
      ],
    },
    {
      id: "versions",
      kicker: "Names that mean something",
      title: "Versions, aliases and stages",
      navTitle: "Versions & Aliases",
      summary: "Immutable versions, movable aliases.",
      intro: ["Version 42 must always be the same model, so versions are immutable. Aliases such as 'production' and 'staging' are pointers that move between versions; servers load by alias, so promotion and rollback are pointer updates."],
      blocks: [
        {
          type: "terms",
          items: [
            ["Version", "An immutable registered model, e.g. fraud-model v42."],
            ["Alias", "A movable name such as production that points at a version."],
            ["Stage", "Where a version is in its lifecycle: staging, production, archived."],
          ],
        },
      ],
    },
    {
      id: "staging",
      kicker: "Test before users do",
      title: "Staged promotion",
      navTitle: "Staged Promotion",
      summary: "Every candidate goes to staging first, then needs approval.",
      intro: ["Promoting straight from training to production lets a model that crashes on one rare input type take down a feature. A staging environment receives every candidate first, with mirrored or synthetic traffic, and production promotion requires an approval."],
      blocks: [
        { type: "warn", text: "Keep staging off the public load balancer. Staging is for finding problems before real users can." },
      ],
    },
    {
      id: "rollback",
      kicker: "Undo in seconds",
      title: "Instant rollback",
      navTitle: "Rollback",
      summary: "Point the alias back; let releases undo themselves.",
      intro: ["Rebuilding an old image to roll back takes hours. With immutable versions and a rollback alias, going back is one pointer change. Releasing behind a traffic router with automatic rollback means most bad releases undo themselves."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Rebuild to roll back", tone: "danger", points: ["Find the old artifact", "Rebuild and redeploy", "Hours of exposure"] },
            { title: "Alias rollback", tone: "success", points: ["Point production at v41", "Servers reload", "Seconds"] },
          ],
        },
      ],
    },
    {
      id: "standards",
      kicker: "Many teams, one registry",
      title: "Registry standards at scale",
      navTitle: "Registry Standards",
      summary: "Same promotion rules for every model.",
      intro: ["With dozens of models across teams, the value of a registry comes from uniform rules: everyone gets staged promotion, immutable versions, rollback aliases, approval and audit by default, and one place to answer 'what's live?'."],
      blocks: [
        { type: "list", items: ["Staged promotion for every model.", "Immutable versions and rollback aliases.", "Approval gates for production.", "Audit log of every promotion.", "Lineage links to experiment runs."] },
      ],
    },
  ],
};

export const BATCH_INFERENCE_GUIDE: Guide = {
  sectionId: "ml-ai-system-design-section-9",
  kicker: "Section 02 · Foundation",
  title: "Batch Inference",
  intro:
    "Scoring millions of records on a schedule is a capacity problem with a deadline. This guide covers when batch fits, sizing the fleet for a window, partitioning the work, scoring only what changed, publishing atomically, and validating outputs.",
  byTheEnd: "You can size a scoring job to finish inside its window, make it resilient to partial failures, cut its cost with incremental scoring, and publish results without exposing half-written data.",
  chapters: [
    {
      id: "when-batch",
      kicker: "Precompute when you can",
      title: "When batch inference fits",
      navTitle: "When Batch Fits",
      summary: "Predictions needed later, inputs that change slowly.",
      intro: ["Batch inference fits when nobody is waiting for the prediction and inputs change slowly relative to the schedule: nightly churn scores, weekly recommendations, risk scores for a morning review queue."],
      blocks: [
        { type: "key", text: "Batch predictions are just rows to look up later, which makes serving them as cheap and fast as a database read." },
      ],
    },
    {
      id: "sizing",
      kicker: "Finish by 6 AM",
      title: "Sizing the scoring fleet",
      navTitle: "Sizing the Fleet",
      summary: "Records divided by window seconds, with headroom.",
      intro: ["Scoring 50 million users in a three-hour window needs about 4,600 users per second. At 1,000 per instance and 80% target utilization, that's six instances."],
      blocks: [
        { type: "formula", lines: ["required rate = records / window seconds", "instances = required rate / (rate per instance x target utilization)"] },
        {
          type: "table",
          head: ["Instances", "Hours for 50M users", "Fits 3 h?"],
          rows: [
            ["1", "13.9", "No"],
            ["4", "3.5", "No"],
            ["6", "2.3", "Yes"],
          ],
        },
      ],
    },
    {
      id: "partitioning",
      kicker: "Small pieces fail cheaply",
      title: "Partitioning the work",
      navTitle: "Partitioning",
      summary: "A queue of partitions, retried individually.",
      intro: ["A single process scanning the whole table restarts from zero when it crashes at 90%. Splitting the input into partitions on a queue lets many instances work in parallel, and a failure costs one partition, retried on its own."],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Planner", sub: "Creates partitions", tone: "info" },
            { label: "Queue", sub: "Retries, DLQ", tone: "warning" },
            { label: "Scoring instances", sub: "In parallel", tone: "success" },
          ],
          caption: "Partitions that keep failing go to a dead-letter queue for inspection.",
        },
      ],
    },
    {
      id: "incremental",
      kicker: "Only what changed",
      title: "Incremental scoring",
      navTitle: "Incremental Scoring",
      summary: "A change feed tells the job what to rescore.",
      intro: ["If only 3% of users have new activity each day, rescoring all 50 million recomputes 97% identical answers. A change feed from the source data lists who changed, and the job rescores only them, often on a single instance."],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "Full rescore", value: 50, max: 50, tone: "danger", note: "6 instances" },
            { label: "Changed users only", value: 1.5, max: 50, tone: "success", note: "1 instance" },
          ],
          unit: "M users scored",
          caption: "Same freshness for the users that changed, a fraction of the compute.",
        },
      ],
    },
    {
      id: "publishing",
      kicker: "All or nothing",
      title: "Atomic publishing",
      navTitle: "Atomic Publishing",
      summary: "Write a new version, validate it, then swap.",
      intro: ["Overwriting the scores table row by row exposes a mix of old and new scores for hours, and a crash leaves the mix in production. Write a complete new version, validate it, and switch readers to it in one step; keep the previous version for rollback."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Overwrite in place", tone: "danger", points: ["Readers see a mix", "Crashes leave partial data", "No easy rollback"] },
            { title: "Version, then swap", tone: "success", points: ["Readers see whole versions", "Partial runs discarded", "Previous version kept"] },
          ],
        },
      ],
    },
    {
      id: "output-validation",
      kicker: "Check before you publish",
      title: "Validating outputs",
      navTitle: "Output Validation",
      summary: "Catch a broken model before anyone reads its scores.",
      intro: ["A model bug that writes null for every user should never reach readers. Check the new version before the swap: schema, null rate, score distribution compared with the previous run."],
      blocks: [
        { type: "list", items: ["Schema matches what readers expect.", "Null rate below a strict threshold (e.g. 1%).", "Score distribution close to the previous version.", "Row count within an expected range."] },
      ],
    },
  ],
};

export const ONLINE_SERVING_GUIDE: Guide = {
  sectionId: "ml-ai-system-design-section-10",
  kicker: "Section 03 · Foundation",
  title: "Online Inference & Model Serving",
  intro:
    "Online models answer while a user waits. This guide covers the serving stack, capacity and failure headroom, cold starts and warm pools, online feature lookups, latency budgets, and fallbacks that keep answers coming when the model can't.",
  byTheEnd: "You can size a serving fleet for peak and failure, keep scale-out fast despite slow model loading, and fit the whole request path inside a latency budget with a safe fallback.",
  chapters: [
    {
      id: "serving-stack",
      kicker: "The request path",
      title: "The serving stack",
      navTitle: "Serving Stack",
      summary: "Load balancer, model servers, online features, fallbacks.",
      intro: ["A typical online prediction passes through a gateway or app service, a load-balanced model server that loads its version from the registry, and an online feature store. Each hop spends part of the latency budget."],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "App / gateway", tone: "info" },
            { label: "Load balancer", tone: "warning" },
            { label: "Model servers", sub: "Version from registry", tone: "accent" },
            { label: "Online features", tone: "success" },
          ],
          caption: "Every hop needs a timeout; the model server needs a fallback.",
        },
      ],
    },
    {
      id: "capacity",
      kicker: "Peak plus failure",
      title: "Serving capacity",
      navTitle: "Serving Capacity",
      summary: "Size for peak at a target, then survive losing a group.",
      intro: ["Serving 5,000 predictions per second at 70% CPU needs about 7,100 predictions per second of capacity. Spread it over several groups so losing the largest one still leaves enough to serve at 90% or less."],
      blocks: [
        { type: "formula", lines: ["capacity needed = peak / target utilization", "survivor capacity = total - largest group"] },
        {
          type: "table",
          head: ["Layout", "Normal CPU", "After losing a group"],
          rows: [
            ["2 groups x 5 Large", "63%", "125% (fails)"],
            ["3 groups x 4 Large", "52%", "78% (passes)"],
          ],
        },
      ],
    },
    {
      id: "warm-pools",
      kicker: "Models load slowly",
      title: "Cold starts and warm pools",
      navTitle: "Warm Pools",
      summary: "Keep instances with the model preloaded ready to join.",
      intro: ["Loading a multi-gigabyte model can take minutes, so autoscaling reacts on time but capacity arrives late. A warm pool keeps instances with the model already in memory, ready to join the fleet in seconds, at far less than the cost of running them."],
      blocks: [
        { type: "formula", lines: ["ready within 60 s = (always-on + warm instances) x per-instance capacity"] },
      ],
    },
    {
      id: "online-features",
      kicker: "Millisecond inputs",
      title: "Online feature lookups",
      navTitle: "Online Features",
      summary: "Never query a warehouse on the request path.",
      intro: ["A data warehouse is built for scans, not millions of single-row lookups; querying it per prediction gives p99 latencies near a second and a bill that grows with traffic. Materialize features into an online store that answers in a millisecond or two."],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "Warehouse query per request", value: 900, max: 950, tone: "danger" },
            { label: "Online store lookup", value: 5, max: 950, tone: "success" },
          ],
          unit: " ms p99",
          caption: "Same features, different store.",
        },
      ],
    },
    {
      id: "latency-budgets",
      kicker: "Spend milliseconds on purpose",
      title: "Latency budgets",
      navTitle: "Latency Budgets",
      summary: "The budget is a sum; every hop must earn its share.",
      intro: ["An ad decision with a 50 ms budget might spend 5 ms in the gateway, 10 ms in the ad service, 5 ms fetching online features and 22 ms on inference with a Large model server. A warehouse lookup or a smaller, slower model breaks the budget on its own."],
      blocks: [
        {
          type: "table",
          head: ["Hop", "Budget"],
          rows: [
            ["Gateway", "5 ms"],
            ["Ad service", "10 ms"],
            ["Online feature lookup", "5 ms"],
            ["Inference (Large)", "22 ms"],
            ["Total", "42 ms of 50"],
          ],
        },
      ],
    },
    {
      id: "fallbacks",
      kicker: "Always answer",
      title: "Timeouts and fallbacks",
      navTitle: "Fallbacks",
      summary: "A slightly worse answer beats an error.",
      intro: ["When the model is slow or down, the product still needs a decision. A strict timeout bounds the wait, and a fallback (a cached prediction, a simple rule, a popular default) answers inside the budget."],
      blocks: [
        { type: "key", text: "Track the fallback rate as a first-class metric. A rising fallback rate is an incident even when error rates look fine." },
      ],
    },
  ],
};
