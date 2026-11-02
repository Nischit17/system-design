export type FamilyId = "software-system-design" | "ml-ai-system-design" | "llm-genai-systems";
export type Tone = "violet" | "amber" | "emerald" | "orange" | "rose" | "sky";

export interface TrackSection {
  id: string;
  number: number;
  title: string;
  description: string;
  icon: string;
  tone: Tone;
  /** Base codes in roadmap order (SSA/EX/ML/LLM). Dual-mode tracks pair each with an FTS twin. */
  codes: string[];
  /** Codes whose card shows the "Section challenge" tag. */
  challenges?: string[];
}

export interface Track {
  slug: string;
  title: string;
  shortTitle: string;
  family: FamilyId;
  tier: "Foundations" | "Advanced" | null;
  order: number;
  description: string;
  whoFor: string;
  prerequisites: string[];
  estimatedHours: string;
  dualMode: boolean;
  sections: TrackSection[];
}

export interface Family {
  id: FamilyId;
  title: string;
  tabLabel: string;
  icon: string;
}

export const FAMILIES: Family[] = [
  { id: "software-system-design", title: "Software System Design", tabLabel: "Software System Design", icon: "code-xml" },
  { id: "ml-ai-system-design", title: "ML & AI System Design", tabLabel: "ML & AI System Design", icon: "brain-circuit" },
  { id: "llm-genai-systems", title: "LLM & GenAI Systems", tabLabel: "LLM & GenAI Systems", icon: "bot" },
];

const ssa = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `SSA${String(from + i).padStart(4, "0")}`);
const ex = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `EX${String(from + i).padStart(4, "0")}`);
const ml = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `ML${String(from + i).padStart(4, "0")}`);
const llm = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `LLM${String(from + i).padStart(4, "0")}`);

const DUAL =
  "Each problem comes in two modes: build the tier from a blank canvas against a precise spec, or repair an already-running system that is showing a concrete production symptom.";

export const TRACKS: Track[] = [
  {
    slug: "compute-traffic-foundations",
    title: "Compute & Traffic Foundations",
    shortTitle: "Compute & Traffic",
    family: "software-system-design",
    tier: "Foundations",
    order: 1,
    description: `Size an application tier from first principles, route traffic across uneven fleets, and decide where user state lives. ${DUAL}`,
    whoFor: "Engineers who want to practice capacity planning and cost trade-offs, not just topology diagrams.",
    prerequisites: ["Comfortable with basic web application concepts"],
    estimatedHours: "~3 hours",
    dualMode: true,
    sections: [
      {
        id: "software-system-architecture-section-1",
        number: 1,
        title: "Servers & Compute",
        description: "Turn traffic forecasts into server counts and sizes; headroom, memory-bound work, isolating batch jobs, and paying only for the capacity you need.",
        icon: "server",
        tone: "violet",
        codes: ssa(1, 4),
      },
      {
        id: "software-system-architecture-section-2",
        number: 2,
        title: "Load Balancers & Traffic Routing",
        description: "Choose routing that matches the fleet and the workload; weighted routing, health checks, connection-aware balancing, and Layer 7 path routing.",
        icon: "network",
        tone: "amber",
        codes: ssa(5, 8),
      },
      {
        id: "software-system-architecture-section-3",
        number: 3,
        title: "Application State & Sessions",
        description: "Decide where session and connection state lives so scaling out and losing a server do not log users out.",
        icon: "cookie",
        tone: "violet",
        codes: ssa(9, 12),
      },
    ],
  },
  {
    slug: "data-storage-foundations",
    title: "Data & Storage Foundations",
    shortTitle: "Data & Storage",
    family: "software-system-design",
    tier: "Foundations",
    order: 2,
    description: `Model data relationally, keep queries fast as tables grow, scale reads and writes, and put large files where they belong. ${DUAL}`,
    whoFor: "Engineers who know SQL basics and want to reason about database capacity, replication, and storage choices.",
    prerequisites: ["Compute & Traffic Foundations"],
    estimatedHours: "~4 hours",
    dualMode: true,
    sections: [
      {
        id: "software-system-architecture-section-4",
        number: 1,
        title: "Relational Databases",
        description: "Schemas, indexes, transactions and connection limits; the fundamentals that decide whether one database survives growth.",
        icon: "database",
        tone: "emerald",
        codes: ssa(13, 16),
      },
      {
        id: "software-system-architecture-section-5",
        number: 2,
        title: "Database Scaling & Replication",
        description: "Read replicas, replication lag, read-after-write consistency, and failing over without losing committed data.",
        icon: "git-branch",
        tone: "emerald",
        codes: ssa(17, 20),
      },
      {
        id: "software-system-architecture-section-6",
        number: 3,
        title: "Partitioning & Sharding",
        description: "Split write load across shards and pick partition keys that do not create a single hot spot.",
        icon: "split",
        tone: "emerald",
        codes: ssa(21, 24),
      },
      {
        id: "software-system-architecture-section-7",
        number: 4,
        title: "Object Storage & File Systems",
        description: "Blobs vs. rows, direct uploads, prefix layout, shared filesystems and lifecycle tiers.",
        icon: "hard-drive",
        tone: "emerald",
        codes: ssa(25, 28),
      },
    ],
  },
  {
    slug: "caching-delivery-foundations",
    title: "Caching & Delivery Foundations",
    shortTitle: "Caching & Delivery",
    family: "software-system-design",
    tier: "Foundations",
    order: 3,
    description: `Serve repeated reads from memory, push content to the edge, and move slow work off the request path. ${DUAL}`,
    whoFor: "Engineers who want to cut latency and database load without breaking correctness.",
    prerequisites: ["Data & Storage Foundations"],
    estimatedHours: "~3 hours",
    dualMode: true,
    sections: [
      {
        id: "software-system-architecture-section-8",
        number: 1,
        title: "Caching",
        description: "Cache-aside reads, invalidation for data that must stay correct, stampedes at expiry, and keys that are simply too hot.",
        icon: "zap",
        tone: "emerald",
        codes: ssa(29, 32),
      },
      {
        id: "software-system-architecture-section-9",
        number: 2,
        title: "CDNs & Edge Delivery",
        description: "Edge caching for distant users, versioned assets, personalizing cached pages, and shielding the origin from viral spikes.",
        icon: "globe",
        tone: "amber",
        codes: ssa(33, 36),
      },
      {
        id: "software-system-architecture-section-10",
        number: 3,
        title: "Queues & Background Processing",
        description: "Move slow work behind a queue, size consumers so backlogs drain, quarantine poison messages, and prioritize urgent jobs.",
        icon: "list-checks",
        tone: "orange",
        codes: ssa(37, 40),
      },
    ],
  },
  {
    slug: "events-communication-advanced",
    title: "Events & Communication (Advanced)",
    shortTitle: "Events & Communication",
    family: "software-system-design",
    tier: "Advanced",
    order: 4,
    description: `Decouple services with events, survive duplicates and reordering, and design APIs that clients can rely on. ${DUAL}`,
    whoFor: "Engineers who have finished the foundation tracks and work on multi-service systems.",
    prerequisites: ["Completion of the Software System Architecture roadmaps"],
    estimatedHours: "~3 hours",
    dualMode: true,
    sections: [
      {
        id: "advanced-software-system-architecture-section-1",
        number: 1,
        title: "Pub/Sub & Event-Driven Systems",
        description: "Fan-out to independent consumers, isolate slow subscribers, and keep event contracts manageable.",
        icon: "radio",
        tone: "orange",
        codes: ssa(41, 44),
      },
      {
        id: "advanced-software-system-architecture-section-2",
        number: 2,
        title: "Idempotency, Ordering & Delivery Guarantees",
        description: "At-least-once delivery, idempotency keys, per-key ordering, and the transactional outbox.",
        icon: "list-checks",
        tone: "orange",
        codes: ssa(45, 48),
      },
      {
        id: "advanced-software-system-architecture-section-3",
        number: 3,
        title: "APIs & Service Communication",
        description: "Backend-for-frontend aggregation, efficient internal protocols, gateway protection, and versioning without breaking clients.",
        icon: "network",
        tone: "amber",
        codes: ssa(49, 52),
      },
    ],
  },
  {
    slug: "service-resilience-advanced",
    title: "Service Design & Resilience (Advanced)",
    shortTitle: "Service & Resilience",
    family: "software-system-design",
    tier: "Advanced",
    order: 5,
    description: `Draw service boundaries deliberately, choose consistency that matches the product, and stop failures from cascading. ${DUAL}`,
    whoFor: "Engineers who want to practice the patterns that matter once a system has real production traffic.",
    prerequisites: ["Completion of the Software System Architecture roadmaps"],
    estimatedHours: "~3 hours",
    dualMode: true,
    sections: [
      {
        id: "advanced-software-system-architecture-section-4",
        number: 1,
        title: "Service Boundaries & Microservices",
        description: "Extract services for real reasons, give each one its own data, avoid nano-services, and break synchronous chains.",
        icon: "boxes",
        tone: "violet",
        codes: ssa(53, 56),
      },
      {
        id: "advanced-software-system-architecture-section-5",
        number: 2,
        title: "Consistency & Distributed Data",
        description: "Per-operation consistency, multi-region conflicts, CAP under partition, and derived views that lag.",
        icon: "scale",
        tone: "emerald",
        codes: ssa(57, 60),
      },
      {
        id: "advanced-software-system-architecture-section-6",
        number: 3,
        title: "Reliability Patterns",
        description: "Circuit breakers, retries with backoff and jitter, bulkheads, and recovering without a thundering herd.",
        icon: "shield-check",
        tone: "rose",
        codes: ssa(61, 64),
      },
    ],
  },
  {
    slug: "production-operations-advanced",
    title: "Production Operations (Advanced)",
    shortTitle: "Production Operations",
    family: "software-system-design",
    tier: "Advanced",
    order: 6,
    description: `Scale on the right signal, find bottlenecks from evidence, release safely, and cut cost without breaking guarantees. ${DUAL}`,
    whoFor: "Engineers who run services in production and want to practice operational architecture.",
    prerequisites: ["Completion of the Software System Architecture roadmaps"],
    estimatedHours: "~4 hours",
    dualMode: true,
    sections: [
      {
        id: "advanced-software-system-architecture-section-7",
        number: 1,
        title: "Autoscaling & Capacity Management",
        description: "Scaling signals, cold starts during flash crowds, downstream limits, and launch capacity plans.",
        icon: "gauge",
        tone: "violet",
        codes: ssa(65, 68),
      },
      {
        id: "advanced-software-system-architecture-section-8",
        number: 2,
        title: "Observability & Production Diagnostics",
        description: "Percentiles, distributed tracing, the right queue metric, and multi-signal diagnosis.",
        icon: "activity",
        tone: "rose",
        codes: ssa(69, 72),
      },
      {
        id: "advanced-software-system-architecture-section-9",
        number: 3,
        title: "Deployment & Release Architecture",
        description: "Canary rollouts, blue/green cutover, expand/contract migrations, and feature flags.",
        icon: "rocket",
        tone: "amber",
        codes: ssa(73, 76),
      },
      {
        id: "advanced-software-system-architecture-section-10",
        number: 4,
        title: "Cost & Architecture Optimization",
        description: "Right-sizing, storage lifecycle economics, cross-region transfer, and a full optimization capstone.",
        icon: "dollar-sign",
        tone: "violet",
        codes: ssa(77, 80),
      },
    ],
  },
  {
    slug: "expert-system-architecture",
    title: "Expert System Architecture",
    shortTitle: "Expert Architecture",
    family: "software-system-design",
    tier: null,
    order: 7,
    description: "Full product designs graded against several production scenarios at once. Every section ends with a challenge that combines everything before it.",
    whoFor: "Engineers preparing for senior system design interviews.",
    prerequisites: ["Completion of the Software System Architecture and Advanced Software System Architecture tracks"],
    estimatedHours: "~10 hours",
    dualMode: false,
    sections: [
      {
        id: "expert-system-architecture-section-1",
        number: 1,
        title: "Core Backend Systems",
        description: "Read-heavy lookups, notification fan-out, shared rate limits, and file sync; the building blocks of most products.",
        icon: "server",
        tone: "violet",
        codes: ex(1, 5),
        challenges: ["EX0005"],
      },
      {
        id: "expert-system-architecture-section-2",
        number: 2,
        title: "Consumer Systems at Scale",
        description: "Feeds, media, streaming, and realtime location at consumer scale.",
        icon: "users",
        tone: "sky",
        codes: ex(6, 10),
        challenges: ["EX0010"],
      },
      {
        id: "expert-system-architecture-section-3",
        number: 3,
        title: "High-Integrity Platforms",
        description: "Contention, payments, and collaboration; correctness under concurrent access matters more than raw throughput here.",
        icon: "shield-check",
        tone: "rose",
        codes: ex(11, 14),
      },
      {
        id: "expert-system-architecture-section-4",
        number: 4,
        title: "Search & Platform Services",
        description: "Indexing, realtime collaboration, webhooks, and scheduling; specialized platform problems with their own shape.",
        icon: "search",
        tone: "emerald",
        codes: ex(15, 19),
        challenges: ["EX0019"],
      },
      {
        id: "expert-system-architecture-section-5",
        number: 5,
        title: "Infrastructure Systems",
        description: "The platforms other teams build on: metrics, logs, flags, caches, and storage.",
        icon: "cloud",
        tone: "amber",
        codes: ex(20, 25),
        challenges: ["EX0025"],
      },
    ],
  },
  {
    slug: "ml-data-foundations",
    title: "ML Data & Fundamentals",
    shortTitle: "Data & Fundamentals",
    family: "ml-ai-system-design",
    tier: "Foundations",
    order: 1,
    description: "How a model becomes a system: the training/serving boundary, where data and labels come from, pipelines, and feature stores.",
    whoFor: "Engineers and data scientists moving models from notebooks into production systems.",
    prerequisites: ["Comfortable with basic web application concepts"],
    estimatedHours: "~4 hours",
    dualMode: false,
    sections: [
      {
        id: "ml-ai-system-design-section-1",
        number: 1,
        title: "ML System Architecture Fundamentals",
        description: "Separate training from serving, choose batch vs. online prediction, and put a feature layer between them.",
        icon: "workflow",
        tone: "violet",
        codes: ml(1, 4),
      },
      {
        id: "ml-ai-system-design-section-2",
        number: 2,
        title: "Data Collection & Labeling",
        description: "Event capture, late-arriving labels, human labeling throughput, and filtering sensitive data.",
        icon: "tag",
        tone: "emerald",
        codes: ml(5, 8),
      },
      {
        id: "ml-ai-system-design-section-3",
        number: 3,
        title: "Data Pipelines & Preprocessing",
        description: "Batch windows, freshness, idempotent preprocessing, and backfills that do not corrupt current data.",
        icon: "route",
        tone: "emerald",
        codes: ml(9, 12),
      },
      {
        id: "ml-ai-system-design-section-4",
        number: 4,
        title: "Feature Engineering & Feature Stores",
        description: "Training/serving skew, online cache sizing, freshness tiers, and features shared across teams.",
        icon: "database",
        tone: "emerald",
        codes: ml(13, 16),
      },
    ],
  },
  {
    slug: "ml-training-foundations",
    title: "ML Training & Evaluation",
    shortTitle: "Training & Evaluation",
    family: "ml-ai-system-design",
    tier: "Foundations",
    order: 2,
    description: "Feed GPUs efficiently, share a cluster fairly, make every run reproducible, and gate models on evaluation that reflects production.",
    whoFor: "ML engineers who own training infrastructure or evaluation pipelines.",
    prerequisites: ["ML Data & Fundamentals"],
    estimatedHours: "~3 hours",
    dualMode: false,
    sections: [
      {
        id: "ml-ai-system-design-section-5",
        number: 1,
        title: "Training Infrastructure",
        description: "Data-parallel scaling, input bottlenecks, multi-tenant fairness, and checkpointing.",
        icon: "cpu",
        tone: "violet",
        codes: ml(17, 20),
      },
      {
        id: "ml-ai-system-design-section-6",
        number: 2,
        title: "Experiment Tracking & Reproducibility",
        description: "Immutable data versions, lineage from model back to code and data, and runs anyone can reproduce.",
        icon: "flask-conical",
        tone: "violet",
        codes: ml(21, 24),
      },
      {
        id: "ml-ai-system-design-section-7",
        number: 3,
        title: "Model Evaluation & Validation",
        description: "Per-segment metrics, deployment gates, champion/challenger tests, and leakage-free splits.",
        icon: "shield-check",
        tone: "rose",
        codes: ml(25, 28),
      },
    ],
  },
  {
    slug: "ml-serving-foundations",
    title: "ML Deployment & Serving",
    shortTitle: "Deployment & Serving",
    family: "ml-ai-system-design",
    tier: "Foundations",
    order: 3,
    description: "Govern model versions, score large batches inside a window, and serve live predictions under latency budgets.",
    whoFor: "ML engineers who deploy and operate models in production.",
    prerequisites: ["ML Training & Evaluation"],
    estimatedHours: "~3 hours",
    dualMode: false,
    sections: [
      {
        id: "ml-ai-system-design-section-8",
        number: 1,
        title: "Model Registry & Versioning",
        description: "A registry as the single source of truth, staged promotion, and instant rollback.",
        icon: "archive",
        tone: "violet",
        codes: ml(29, 32),
      },
      {
        id: "ml-ai-system-design-section-9",
        number: 2,
        title: "Batch Inference",
        description: "Size the scoring fleet, partition the work, score only what changed, and publish atomically.",
        icon: "layers",
        tone: "violet",
        codes: ml(33, 36),
      },
      {
        id: "ml-ai-system-design-section-10",
        number: 3,
        title: "Online Inference & Model Serving",
        description: "Serving capacity, warm pools, online features, fallbacks, and latency budgets.",
        icon: "zap",
        tone: "amber",
        codes: ml(37, 40),
      },
    ],
  },
  {
    slug: "llm-system-design",
    title: "Applied LLM System Design",
    shortTitle: "LLM Systems",
    family: "llm-genai-systems",
    tier: null,
    order: 1,
    description: "Retrieval-augmented generation, GPU serving economics, evaluation gates, and agents that take real actions.",
    whoFor: "Engineers who finished the Software System Architecture roadmaps and want the LLM interview loop.",
    prerequisites: ["Software System Architecture roadmaps"],
    estimatedHours: "~4 hours",
    dualMode: false,
    sections: [
      {
        id: "llm-system-design-section-1",
        number: 1,
        title: "RAG Foundations",
        description: "Chunking, hybrid retrieval, permissions-aware search, and grounded answers.",
        icon: "book-open",
        tone: "emerald",
        codes: llm(1, 3),
      },
      {
        id: "llm-system-design-section-2",
        number: 2,
        title: "Serving and Cost",
        description: "Batching, quantization, routing and caching levers that change the cost curve.",
        icon: "gauge",
        tone: "violet",
        codes: llm(4, 5),
      },
      {
        id: "llm-system-design-section-3",
        number: 3,
        title: "Quality Gates",
        description: "Validated judges and regression gates that decide whether a change ships.",
        icon: "badge-check",
        tone: "rose",
        codes: llm(6, 6),
      },
      {
        id: "llm-system-design-section-4",
        number: 4,
        title: "Agents That Take Action",
        description: "Agents with guardrails: tool use, planning, and the failure modes that come with letting a model act.",
        icon: "bot",
        tone: "sky",
        codes: llm(7, 8),
      },
    ],
  },
];

export const TONE_CLASSES: Record<Tone, { chip: string; icon: string }> = {
  violet: { chip: "bg-violet-400/15", icon: "text-violet-300" },
  amber: { chip: "bg-amber-400/15", icon: "text-amber-300" },
  emerald: { chip: "bg-emerald-400/15", icon: "text-emerald-300" },
  orange: { chip: "bg-orange-400/15", icon: "text-orange-300" },
  rose: { chip: "bg-rose-400/15", icon: "text-rose-300" },
  sky: { chip: "bg-sky-400/15", icon: "text-sky-300" },
};

export function getTrack(slug: string): Track | undefined {
  return TRACKS.find((t) => t.slug === slug);
}

export function tracksForFamily(family: FamilyId): Track[] {
  return TRACKS.filter((t) => t.family === family).sort((a, b) => a.order - b.order);
}

export function findSection(sectionId: string): { track: Track; section: TrackSection } | undefined {
  for (const track of TRACKS) {
    const section = track.sections.find((s) => s.id === sectionId);
    if (section) return { track, section };
  }
  return undefined;
}

/** Number of solvable problems shown on the roadmap for a section (dual-mode counts each pair once). */
export function sectionProblemCount(section: TrackSection): number {
  return section.codes.length;
}
