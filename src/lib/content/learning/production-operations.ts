import type { Guide } from "./types";

export const AUTOSCALING_GUIDE: Guide = {
  sectionId: "advanced-software-system-architecture-section-7",
  kicker: "Section 01 · Advanced",
  title: "Autoscaling & Capacity Management",
  intro:
    "Autoscaling promises capacity that follows demand. In practice it scales on the wrong signal, arrives too late, or scales straight into a dependency's limit. This guide covers choosing signals, warm pools, downstream-aware scaling, and planning capacity for peaks you can see coming.",
  byTheEnd: "You can configure an autoscaler that reacts to the right signal fast enough, protect dependencies from scale-out, and build a capacity plan that survives losing a zone at peak.",
  chapters: [
    {
      id: "how-it-works",
      kicker: "The control loop",
      title: "How autoscaling works",
      navTitle: "How Autoscaling Works",
      summary: "Measure, compare with a target, add or remove instances.",
      intro: [
        "A target-tracking autoscaler watches a metric, compares it with a target (say 70% CPU), and changes the instance count to bring the metric back to target, within a minimum and maximum, with cooldowns so it doesn't flap.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Metric", sub: "CPU, concurrency, backlog", tone: "info" },
            { label: "Policy", sub: "Target, min, max", tone: "warning" },
            { label: "Fleet", sub: "Adds or removes instances", tone: "success" },
          ],
          caption: "Each part can be wrong: the metric, the target, the limits, or the speed.",
        },
        {
          type: "terms",
          items: [
            ["Minimum", "The always-on fleet; it must cover traffic while new instances boot."],
            ["Maximum", "The ceiling; it caps cost and protects dependencies."],
            ["Cooldown", "Time between scaling actions, to avoid oscillation."],
          ],
        },
      ],
    },
    {
      id: "signals",
      kicker: "Measure the right thing",
      title: "Choosing a scaling signal",
      navTitle: "Scaling Signals",
      summary: "CPU only tracks load for CPU-bound work.",
      intro: [
        "Thumbnail workers that spend most of their time waiting on storage can be completely busy at 30% CPU. A CPU policy never fires while the queue grows for hours. Scale on the signal users actually feel.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Workload", "Good signal", "Why"],
          rows: [
            ["CPU-bound web tier", "CPU utilization", "CPU tracks requests closely"],
            ["I/O-bound API", "Request concurrency", "Work in flight shows saturation"],
            ["Queue workers", "Backlog per worker or oldest message age", "Directly measures waiting work"],
          ],
        },
        { type: "key", text: "Ask what a user would complain about first: slow pages, long waits, stale results. Scale on the metric closest to that." },
      ],
    },
    {
      id: "warm-pools",
      kicker: "Speed of scale-out",
      title: "Scale-out lag and warm pools",
      navTitle: "Warm Pools",
      summary: "Capacity that takes four minutes to boot misses a one-minute spike.",
      intro: [
        "Autoscaling decides quickly but delivers slowly: new instances need to boot, load code and warm caches. When traffic jumps within a minute, a four-minute boot means four minutes of errors. Warm pools keep pre-initialized instances ready to join in seconds.",
      ],
      blocks: [
        { type: "formula", lines: ["capacity within 60 s = (always-on instances + warm instances) x capacity per instance"] },
        {
          type: "bars",
          items: [
            { label: "Cold scale-out only", value: 800, max: 3200, tone: "danger", note: "1 instance until boot completes" },
            { label: "1 always on + 3 warm", value: 3200, max: 3200, tone: "success", note: "ready in seconds" },
          ],
          unit: " RPS ready",
          caption: "A push campaign takes traffic from 500 to 2,000 RPS within a minute.",
        },
        { type: "warn", text: "Raising the minimum also covers the spike, but you pay for it all day. Warm pools cost far less than running the instances in the fleet." },
      ],
    },
    {
      id: "downstream",
      kicker: "Don't scale into a wall",
      title: "Downstream-aware scaling",
      navTitle: "Downstream-Aware Scaling",
      summary: "Every new instance adds load and connections somewhere else.",
      intro: [
        "Scaling the app tier from 10 to 30 instances triples its database connections. If the database allows 500 and each instance opens 50, scale-out itself causes the outage. Cap the maximum against downstream limits, pool connections, and stop scaling when a dependency is saturated.",
      ],
      blocks: [
        { type: "formula", lines: ["max instances x connections per instance <= database connection limit (without a pooler)"] },
        {
          type: "compare",
          items: [
            { title: "Naive scale-out", tone: "danger", points: ["30 instances x 50 connections", "1,500 against a 500 limit", "New servers make things worse"] },
            { title: "Downstream-aware", tone: "success", points: ["Transaction-mode pooler caps DB connections", "Scaling pauses when the DB saturates", "Max sized for DB capacity"] },
          ],
        },
      ],
    },
    {
      id: "capacity-plans",
      kicker: "Peaks you can see coming",
      title: "Capacity plans for known peaks",
      navTitle: "Capacity Plans",
      summary: "Forecast, add headroom, then survive losing a zone.",
      intro: [
        "Black Friday, a launch or a big match are known in advance, so plan capacity explicitly instead of trusting the autoscaler. Size for the forecast at your target utilization, then check the plan still works with a whole availability zone gone.",
      ],
      blocks: [
        { type: "formula", lines: ["per-zone capacity x (zones - 1) x target utilization >= forecast peak"] },
        {
          type: "table",
          head: ["Plan", "Normal CPU", "One zone lost", "Verdict"],
          rows: [
            ["1 group of 8 Large, one zone", "91%", "Total outage", "Fails"],
            ["3 zones x 5 Large", "48%", "73%", "Passes"],
          ],
          caption: "Forecast of 5,800 RPS at a 75% target. Three zones cost only 50% spare capacity; two would need 100%.",
        },
      ],
    },
    {
      id: "scale-in",
      kicker: "Shrinking safely",
      title: "Scaling in",
      navTitle: "Scaling In",
      summary: "Drain connections, scale in slowly, avoid flapping.",
      intro: ["Removing instances is where autoscaling causes surprises: dropped requests, lost in-flight work, oscillation. Drain each instance before terminating it and scale in more cautiously than you scale out."],
      blocks: [
        { type: "list", items: ["Enable connection draining on the load balancer.", "Use longer cooldowns for scale-in than scale-out.", "Make sure workers finish or return in-flight jobs to the queue."] },
      ],
    },
  ],
};

export const OBSERVABILITY_GUIDE: Guide = {
  sectionId: "advanced-software-system-architecture-section-8",
  kicker: "Section 02 · Advanced",
  title: "Observability & Production Diagnostics",
  intro:
    "You can't fix what you can't see, and averages hide most of what matters. This guide covers metrics, logs and traces, percentiles, what to measure, tracing across services, queue health, alerting on symptoms, and the pipeline that carries all of it.",
  byTheEnd: "You can instrument a system so incidents are detected by alerts rather than customers, located with traces and explained with logs, without the telemetry bill getting out of hand.",
  chapters: [
    {
      id: "three-signals",
      kicker: "Three kinds of evidence",
      title: "Metrics, logs and traces",
      navTitle: "Metrics, Logs & Traces",
      summary: "Each signal answers a different question.",
      intro: ["Metrics tell you that something is wrong, traces tell you where, and logs tell you why. A good setup uses all three and links them, for example with a shared trace id."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Metrics", tone: "info", points: ["Cheap numeric time series", "Dashboards and alerts", "Answer: is it broken?"] },
            { title: "Traces", tone: "accent", points: ["One request across services", "Timing per hop", "Answer: where?"] },
            { title: "Logs", tone: "warning", points: ["Detailed events", "Context and errors", "Answer: why?"] },
          ],
        },
      ],
    },
    {
      id: "percentiles",
      kicker: "Averages lie",
      title: "Percentiles, not averages",
      navTitle: "Percentiles",
      summary: "The tail is what your unluckiest users experience.",
      intro: [
        "An average of 120 ms is consistent with 5% of requests taking four seconds. Percentiles describe the distribution: p50 is the typical request, p95 and p99 are the slow tail that users remember and that usually signals a problem first.",
      ],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "Average", value: 120, max: 4200, tone: "success" },
            { label: "p50", value: 95, max: 4200, tone: "success" },
            { label: "p95", value: 4100, max: 4200, tone: "danger" },
            { label: "p99", value: 4200, max: 4200, tone: "danger" },
          ],
          unit: " ms",
          caption: "Same traffic. The average says everything is fine.",
        },
        { type: "key", text: "Record latency as histograms so percentiles can be computed across servers. Averaging per-server p99s doesn't give a fleet p99." },
      ],
    },
    {
      id: "what-to-measure",
      kicker: "Start with the golden signals",
      title: "What to measure",
      navTitle: "What to Measure",
      summary: "Latency, traffic, errors and saturation, per service.",
      intro: ["Four signals cover most of what matters for any service. Add saturation measures for each resource that can run out."],
      blocks: [
        {
          type: "table",
          head: ["Signal", "Example metric"],
          rows: [
            ["Latency", "p50/p95/p99 request duration, split by success and error"],
            ["Traffic", "Requests per second per endpoint"],
            ["Errors", "Error rate, by type"],
            ["Saturation", "CPU, memory, connection pool use, queue age"],
          ],
        },
      ],
    },
    {
      id: "tracing",
      kicker: "Following one request",
      title: "Distributed tracing",
      navTitle: "Distributed Tracing",
      summary: "Spans across services, and sampling that keeps the interesting ones.",
      intro: [
        "A trace follows one request through every service as a tree of spans, each with timing. Because tracing everything is expensive, systems sample. Head sampling decides at the start, before anyone knows whether the request will fail. Tail sampling decides after the trace completes, so it can keep every error and slow request.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Head sampling (1%)", tone: "danger", points: ["Decided before the outcome", "Rare failures almost never kept", "Cheap and simple"] },
            { title: "Tail sampling", tone: "success", points: ["Decided after the trace finishes", "Keeps all errors and slow traces", "Plus a small baseline sample"] },
          ],
        },
        { type: "warn", text: "A trace is only end-to-end if every service propagates the trace context. One service that drops it splits the story in two." },
      ],
    },
    {
      id: "queue-age",
      kicker: "Queues hide problems",
      title: "Queue health",
      navTitle: "Queue Health",
      summary: "Alert on how long messages wait, not how many there are.",
      intro: [
        "A depth alert at 10,000 messages never fires at night when traffic is low, even if the consumer has stalled and the oldest order has waited three hours. Age is the customer-facing number: how long work is waiting.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Queue depth", tone: "warning", points: ["Depends on traffic level", "No single threshold fits", "Misses slow consumers at night"] },
            { title: "Oldest message age", tone: "success", points: ["Directly measures waiting", "One threshold works all day", "Matches what customers feel"] },
          ],
        },
      ],
    },
    {
      id: "alerting",
      kicker: "Page on symptoms",
      title: "Alerting and SLOs",
      navTitle: "Alerting & SLOs",
      summary: "Alert when users are hurting, not when a server is busy.",
      intro: [
        "A service level objective states the reliability users should get, for example 99.9% of requests succeed in under 300 ms. The error budget is the 0.1% you're allowed to miss. Alert when you're burning that budget too fast, not on every CPU spike.",
      ],
      blocks: [
        {
          type: "terms",
          items: [
            ["SLI", "The measured indicator, e.g. share of requests under 300 ms."],
            ["SLO", "The target for the SLI, e.g. 99.9% over 30 days."],
            ["Error budget", "Allowed failures: 0.1% of requests over the window."],
            ["Burn rate", "How fast the budget is being used. A fast burn pages someone."],
          ],
        },
      ],
    },
    {
      id: "pipelines",
      kicker: "Getting telemetry there",
      title: "Telemetry pipelines",
      navTitle: "Telemetry Pipelines",
      summary: "Collect once, buffer, fan out to each store.",
      intro: [
        "Services send telemetry to a collector that buffers it, samples it and routes it to metrics, log and trace stores. The buffer rides out backend outages; one collector gives every service the same pipeline.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Services", tone: "info" },
            { label: "Collector", sub: "Buffer, sample", tone: "warning" },
            { label: "Stores", sub: "Metrics, logs, traces", tone: "success" },
          ],
          caption: "Telemetry stays off the request path: services hand data off and move on.",
        },
        { type: "warn", text: "Labels with unbounded values (user ids, request ids) explode metric cardinality and cost. Put those in logs and traces, not metric labels." },
      ],
    },
  ],
};

export const DEPLOYMENT_GUIDE: Guide = {
  sectionId: "advanced-software-system-architecture-section-9",
  kicker: "Section 03 · Advanced",
  title: "Deployment & Release Architecture",
  intro:
    "Most outages start with a change. This guide covers deployment strategies, canary releases with automatic rollback, blue/green switches, schema migrations that work across versions, and feature flags that separate deploying code from releasing features.",
  byTheEnd: "You can ship changes to a small slice of users first, roll back in seconds, change a database schema without downtime, and release features independently of deploys.",
  chapters: [
    {
      id: "strategies",
      kicker: "Options for change",
      title: "Deployment strategies",
      navTitle: "Deployment Strategies",
      summary: "All at once, rolling, canary or blue/green.",
      intro: ["Each strategy trades speed, cost and blast radius differently."],
      blocks: [
        {
          type: "table",
          head: ["Strategy", "Blast radius", "Rollback", "Extra cost"],
          rows: [
            ["All at once", "Everyone", "Redeploy (minutes)", "None"],
            ["Rolling", "Grows as it rolls", "Roll back (minutes)", "Little"],
            ["Canary", "A small slice first", "Automatic, fast", "A canary fleet"],
            ["Blue/green", "Everyone at switch time", "Flip back (seconds)", "Double capacity during release"],
          ],
        },
      ],
    },
    {
      id: "canary",
      kicker: "Test on real traffic",
      title: "Canary releases",
      navTitle: "Canary Releases",
      summary: "Send a few percent to the new version and compare.",
      intro: [
        "A canary sends a small share of traffic, say 5%, to the new version and compares its error rate and latency percentiles with the stable fleet. If it regresses, automatic rollback sends all traffic back before most users notice.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Load balancer", tone: "warning" },
            { label: "Traffic router", sub: "95% / 5%", tone: "info" },
            { label: "Stable + canary", sub: "Compare p99 and errors", tone: "success" },
          ],
          caption: "A bad build reaches a few percent of users for a few minutes instead of everyone until someone notices.",
        },
        { type: "key", text: "Automatic rollback removes the slowest step of any incident: a human deciding to undo." },
      ],
    },
    {
      id: "blue-green",
      kicker: "Two complete environments",
      title: "Blue/green deployments",
      navTitle: "Blue/Green",
      summary: "Switch all traffic at once, and switch back just as fast.",
      intro: [
        "Blue/green keeps two full-size environments. The new version deploys to the idle one, gets tested, and then the router flips all traffic to it. Rollback is flipping back. Each environment must carry the full peak on its own, or the switch itself becomes the outage.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Strengths", tone: "success", points: ["One-step switch and rollback", "New version fully warmed before traffic", "Simple to reason about"] },
            { title: "Costs", tone: "warning", points: ["Double capacity during releases", "Shared database must suit both versions", "Long-lived sessions need care"] },
          ],
        },
      ],
    },
    {
      id: "migrations",
      kicker: "Schemas across versions",
      title: "Expand and contract",
      navTitle: "Expand/Contract Migrations",
      summary: "Every schema change must work with old and new code at once.",
      intro: [
        "During any gradual rollout, old and new versions share one database. Renaming a column in one step breaks every old instance. Expand/contract splits the change into safe steps: add the new shape, run both, then remove the old.",
      ],
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            "Expand: add phone_number next to phone; new code writes both.",
            "Backfill phone_number for existing rows.",
            "Switch reads to phone_number once every instance runs new code.",
            "Contract: stop writing phone, then drop it.",
          ],
        },
        { type: "warn", text: "Never run a contract step while any old instance is still serving. Rollback must stay possible at every step." },
      ],
    },
    {
      id: "feature-flags",
      kicker: "Deploy is not release",
      title: "Feature flags",
      navTitle: "Feature Flags",
      summary: "Ship code dark, turn it on gradually, turn it off instantly.",
      intro: [
        "A feature flag wraps new behaviour so the code can be deployed but switched off. Release becomes a configuration change: start with internal users or 5% of traffic, watch the metrics, widen gradually, and keep a kill switch.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Practice", "Why"],
          rows: [
            ["Percentage or segment rollouts", "Limit blast radius while learning"],
            ["Kill switch", "Turn a feature off without a deploy"],
            ["Local evaluation", "No network call per check; works if the flag service is down"],
            ["Remove stale flags", "Old flags become hidden complexity"],
          ],
        },
      ],
    },
    {
      id: "rollback",
      kicker: "Always have a way back",
      title: "Designing for rollback",
      navTitle: "Designing for Rollback",
      summary: "Decide rollback criteria before you ship.",
      intro: ["Rollback only works if data written by the new version can still be read by the old one, and if everyone agrees in advance what 'bad' looks like."],
      blocks: [
        { type: "list", items: ["Define rollback triggers: error rate, p99, key business metrics.", "Keep data formats backward compatible for at least one version.", "Practise rollback so it's routine, not heroic."] },
      ],
    },
  ],
};

export const COST_GUIDE: Guide = {
  sectionId: "advanced-software-system-architecture-section-10",
  kicker: "Section 04 · Advanced",
  title: "Cost & Architecture Optimization",
  intro:
    "A design that works but costs five times too much isn't finished. This guide covers unit costs, right-sizing, paying only for capacity you use, data lifecycle tiers, data transfer, and how to trade cost against reliability and latency without cutting the wrong thing.",
  byTheEnd: "You can find the waste in an architecture, right-size a fleet against real traffic, cut storage and transfer bills, and defend which costs are worth keeping.",
  chapters: [
    {
      id: "unit-costs",
      kicker: "Price per unit",
      title: "Know your unit costs",
      navTitle: "Unit Costs",
      summary: "Compare price per unit of the resource that limits you.",
      intro: ["Cost decisions get easier when expressed per unit: dollars per thousand requests, per active user, per GB stored. For compute, compare price per RPS across sizes; the biggest machine is rarely the cheapest per request."],
      blocks: [
        {
          type: "table",
          head: ["Size", "Capacity", "Monthly cost", "$ per RPS"],
          rows: [
            ["Medium", "430 RPS", "$330", "0.77"],
            ["Large", "800 RPS", "$620", "0.78"],
            ["XL", "1,350 RPS", "$1,120", "0.83"],
            ["2XL", "1,850 RPS", "$2,100", "1.14"],
          ],
        },
      ],
    },
    {
      id: "right-sizing",
      kicker: "Match capacity to traffic",
      title: "Right-sizing",
      navTitle: "Right-Sizing",
      summary: "Idle capacity is the most common cloud waste.",
      intro: [
        "Fleets are often sized for a launch-week forecast that never happened and then forgotten. Eight 2XL servers at 11% CPU for 1,600 RPS cost $16,980 a month; three Large servers carry the same load at 67% for $2,040.",
      ],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "8 x 2XL", value: 16980, max: 17000, tone: "danger", note: "11% CPU" },
            { label: "3 x Large", value: 2040, max: 17000, tone: "success", note: "67% CPU" },
          ],
          unit: " $/mo",
          caption: "Same traffic, same latency target.",
        },
        { type: "key", text: "Aim for a utilization band, e.g. 45-75% at peak: below it you're paying for idle capacity, above it you're out of headroom." },
      ],
    },
    {
      id: "elasticity",
      kicker: "Pay for what you use",
      title: "Elastic capacity",
      navTitle: "Elastic Capacity",
      summary: "Autoscale interactive work, schedule batch, use spare capacity.",
      intro: ["Traffic has a shape. Autoscaling follows it for interactive work, scheduled scaling covers predictable daily peaks, and interruptible spare capacity is often much cheaper for batch jobs that can retry."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Always on", tone: "warning", points: ["Sized for peak", "Idle most of the day", "Simple, expensive"] },
            { title: "Elastic", tone: "success", points: ["Baseline plus autoscaling", "Batch on interruptible capacity", "Pay roughly for actual use"] },
          ],
        },
      ],
    },
    {
      id: "lifecycle",
      kicker: "Data has a temperature",
      title: "Data lifecycle tiers",
      navTitle: "Lifecycle Tiers",
      summary: "Hot data on fast storage, cold data archived, old data deleted.",
      intro: [
        "Keeping four years of logs in a searchable cluster costs search-cluster prices for data nobody reads. Keep the recent window searchable, export older data to archive storage, and delete it when the retention policy ends.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Tier", "Holds", "Store"],
          rows: [
            ["Hot", "Last 7-30 days", "Searchable log or metrics store"],
            ["Cold", "Up to the retention limit", "Archive-class object storage"],
            ["Gone", "Past retention", "Expired automatically"],
          ],
        },
      ],
    },
    {
      id: "transfer",
      kicker: "Bytes on the move",
      title: "Data transfer costs",
      navTitle: "Data Transfer",
      summary: "Cross-region reads are billed per gigabyte, every time.",
      intro: [
        "An EU app tier that reads every request from a US database ships the same data across the ocean over and over. Replication ships each change once. Serving reads from a regional replica and cache cuts the bill and the latency together.",
      ],
      blocks: [
        { type: "formula", lines: ["transfer cost ≈ GB moved across regions per month x price per GB", "replication moves each change once; remote reads move data per request"] },
        {
          type: "flow",
          steps: [
            { label: "EU users", tone: "info" },
            { label: "EU app tier", tone: "warning" },
            { label: "EU replica + cache", sub: "Local reads", tone: "success" },
          ],
          caption: "Only writes cross the ocean to the primary.",
        },
      ],
    },
    {
      id: "trade-offs",
      kicker: "What not to cut",
      title: "Cost vs. reliability vs. latency",
      navTitle: "Trade-offs",
      summary: "Some spend is insurance; keep it on purpose.",
      intro: ["Spare capacity for failover, a second region, replicas and backups all look like waste until the day they're needed. Cut idle capacity and forgotten data; keep the redundancy your reliability targets require, and write down why."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Usually waste", tone: "danger", points: ["Oversized fleets", "Hot storage for cold data", "Cross-region reads", "Unused indexes and replicas"] },
            { title: "Usually insurance", tone: "success", points: ["N+1 capacity", "Zone and region redundancy", "Backups with tested restores"] },
          ],
        },
      ],
    },
    {
      id: "capstone",
      kicker: "Bringing it together",
      title: "Operating in production",
      navTitle: "Operating in Production",
      summary: "A checklist across scaling, visibility, releases and cost.",
      intro: ["The last four sections are one discipline: running a system that is right-sized, observable, safe to change and survives failures."],
      blocks: [
        {
          type: "list",
          items: [
            "Fleet sized for peak at a target utilization, with autoscaling for surprises.",
            "Percentile metrics, tail-sampled traces and structured logs.",
            "Canary releases with automatic rollback.",
            "Data in the cheapest tier that meets its access needs.",
            "Spare capacity and redundancy you can justify with numbers.",
          ],
        },
      ],
    },
  ],
};
