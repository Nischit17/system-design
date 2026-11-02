import {
  Activity,
  Archive,
  BadgeCheck,
  Bell,
  Bot,
  Boxes,
  BrainCircuit,
  CalendarClock,
  Clapperboard,
  ClipboardCheck,
  Cloud,
  Copy,
  Cpu,
  CreditCard,
  Database,
  DatabaseZap,
  FileClock,
  FileSearch,
  Film,
  FlaskConical,
  Folder,
  Gauge,
  GitBranch,
  GitMerge,
  Globe,
  HardDrive,
  Hash,
  HeartPulse,
  Image,
  KeyRound,
  Landmark,
  Layers,
  LineChart,
  ListVideo,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  MessageSquareText,
  Network,
  Package,
  Radio,
  RefreshCw,
  Route,
  Rss,
  Scale,
  ScrollText,
  Search,
  Send,
  Server,
  ServerCog,
  Settings2,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  Smartphone,
  Sparkles,
  Split,
  Tag,
  Ticket,
  Timer,
  ToggleRight,
  TrendingUp,
  Upload,
  Users,
  Waypoints,
  Wifi,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type Category =
  | "client"
  | "compute"
  | "networking"
  | "database"
  | "messaging"
  | "reliability";

export const CATEGORIES: Category[] = [
  "client",
  "compute",
  "networking",
  "database",
  "messaging",
  "reliability",
];

export const CATEGORY_LABELS: Record<Category, string> = {
  client: "Client",
  compute: "Compute",
  networking: "Networking",
  database: "Database",
  messaging: "Messaging",
  reliability: "Reliability",
};

export type ConfigValue = string | number;

export type ConfigField =
  | {
      key: string;
      label: string;
      type: "select";
      defaultValue: string;
      options: string[];
      hint?: string;
    }
  | {
      key: string;
      label: string;
      type: "number";
      defaultValue: number;
      min?: number;
      max?: number;
      hint?: string;
    }
  | { key: string; label: string; type: "text"; defaultValue: string; hint?: string }
  | { key: string; label: string; type: "readonly"; defaultValue: string; hint?: string };

export interface ComponentDef {
  type: string;
  label: string;
  category: Category;
  icon: LucideIcon;
  blurb: string;
  configFields: ConfigField[];
}

/* ---------- field helpers ---------- */
const sel = (
  key: string,
  label: string,
  options: string[],
  defaultValue = options[0],
  hint?: string,
): ConfigField => ({ key, label, type: "select", options, defaultValue, hint });
const num = (
  key: string,
  label: string,
  defaultValue: number,
  min?: number,
  max?: number,
  hint?: string,
): ConfigField => ({ key, label, type: "number", defaultValue, min, max, hint });
const txt = (key: string, label: string, defaultValue = "", hint?: string): ConfigField => ({
  key,
  label,
  type: "text",
  defaultValue,
  hint,
});
const toggle = (key: string, label: string, defaultValue = "Disabled", hint?: string) =>
  sel(key, label, ["Disabled", "Enabled"], defaultValue, hint);

export const REGIONS = ["us-east", "us-west", "eu-west", "ap-south"];
const region = (hint?: string) =>
  sel(
    "region",
    "Region",
    REGIONS,
    "us-east",
    hint ??
      "Traffic or data that crosses between nodes in different regions is billed as cross-region transfer.",
  );

const SERVER_SIZES = ["Small", "Medium", "Large", "XL", "2XL"];
const DB_SIZES = ["Free", "Small", "Medium", "Large", "XL"];
const CACHE_SIZES = ["Small", "Medium", "Large", "XL"];

const relationalFields: ConfigField[] = [
  sel(
    "size",
    "Size",
    DB_SIZES,
    "Small",
    "Read/write capacity and monthly cost scale with size; see the database table in the Reference tab.",
  ),
  num("maxConnections", "Max connections", 100, 10, 5000, "Hard ceiling on concurrent client connections."),
  sel("role", "Role", ["Standalone", "Primary", "Replica"], "Standalone"),
  txt("replicatesFrom", "Replicates from", "", "The primary this replica copies data from."),
  sel("replicationMode", "Replication mode", ["Async", "Sync"], "Async"),
  toggle("autoFailover", "Auto failover", "Disabled", "Promotes a replica automatically when the primary stops responding."),
  txt("indexedFields", "Indexed fields", "", "Comma-separated columns, for example customer_id, created_at"),
  txt(
    "schemaTables",
    "Schema (tables & relationships)",
    "",
    'Describe tables and keys, e.g. "orders(id, customer_id FK -> customers); line_items(id, order_id FK -> orders)".',
  ),
  toggle("partitioning", "Partitioning"),
  sel("partitionStrategy", "Partition strategy", ["Hash", "Range"], "Hash"),
  txt("partitionKey", "Partition key", ""),
  num("shardCount", "Shard count", 1, 1, 128),
  toggle(
    "outboxPattern",
    "Transactional outbox",
    "Disabled",
    "Writes the outgoing event in the same transaction as the business row so a relay can publish it reliably.",
  ),
  sel(
    "conflictResolution",
    "Conflict resolution",
    ["Last Write Wins", "Custom Merge / CRDT", "Reject on Conflict"],
    "Last Write Wins",
    "How concurrent writes to the same record from two regions are reconciled.",
  ),
  sel(
    "migrationPhase",
    "Migration phase",
    ["Complete", "Expand", "Contract"],
    "Complete",
    "Expand: schema serves old and new app versions. Contract: drop old-only columns once every instance is upgraded.",
  ),
  region(),
];

const keyValueFields = (defaultSize = "Small"): ConfigField[] => [
  sel("size", "Size", ["Small", "Medium", "Large", "XL"], defaultSize),
  sel("consistency", "Read consistency", ["Eventual", "Strong"], "Eventual"),
  txt("partitionKey", "Partition key", ""),
  num("replicationFactor", "Replication factor", 3, 1, 5),
  region(),
];

/* ---------- catalog ---------- */
export const COMPONENTS: ComponentDef[] = [
  // ----- client
  {
    type: "web-client",
    label: "Web Client",
    category: "client",
    icon: Globe,
    blurb: "Browser that sends requests",
    configFields: [sel("protocol", "Protocol", ["HTTPS", "HTTP"])],
  },
  {
    type: "mobile-client",
    label: "Mobile Client",
    category: "client",
    icon: Smartphone,
    blurb: "Native app on a phone",
    configFields: [sel("protocol", "Protocol", ["HTTPS", "HTTP"])],
  },

  // ----- compute
  {
    type: "application-server",
    label: "Application Server",
    category: "compute",
    icon: Server,
    blurb: "Runs business logic",
    configFields: [
      sel(
        "size",
        "Size",
        SERVER_SIZES,
        "Medium",
        "Larger sizes serve more traffic and cost more per month; the Reference tab has the full table.",
      ),
      num("instances", "Instances", 1, 1, 64),
      num(
        "trafficWeight",
        "Routing weight",
        25,
        0,
        100,
        "Relative share used only by Weighted Round Robin. Weights don't need to add up to 100.",
      ),
      sel("protocol", "Protocol", ["HTTP", "HTTPS", "gRPC"]),
      sel("sessionStorage", "Session state", ["Stateless", "Local memory"]),
      sel(
        "servesPath",
        "Serves path",
        ["All paths", "/search/*", "/catalog/*", "/checkout/*", "/uploads/*"],
        "All paths",
        "Used by a Layer 7 load balancer with path-based routing to send each URL prefix to its own pool.",
      ),
      num(
        "dbConnectionsPerInstance",
        "DB connections per instance",
        20,
        1,
        2000,
        "Each instance opens this many database connections. Without a pool, totals grow with instance count.",
      ),
      num(
        "coldStartSeconds",
        "Cold start time (seconds)",
        0,
        0,
        600,
        "How long a new instance needs before it can take traffic.",
      ),
      region(),
    ],
  },
  {
    type: "worker",
    label: "Worker",
    category: "compute",
    icon: Cpu,
    blurb: "Processes background jobs",
    configFields: [
      num("instances", "Instances", 1, 1, 512),
      toggle("autoScaling", "Auto scaling"),
      toggle("idempotent", "Idempotent consumer", "Disabled", "Processing the same message twice has no extra effect."),
      region(),
    ],
  },
  {
    type: "serverless-function",
    label: "Serverless Function",
    category: "compute",
    icon: Zap,
    blurb: "Runs code on demand",
    configFields: [
      num("concurrency", "Max concurrency", 10, 1, 1000),
      num(
        "avgDurationMs",
        "Avg duration (ms)",
        200,
        1,
        900000,
        "Average run time per invocation. Together with concurrency it sets requests per second.",
      ),
    ],
  },
  {
    type: "upload-service",
    label: "Upload Service",
    category: "compute",
    icon: Upload,
    blurb: "Issues upload permissions",
    configFields: [
      sel(
        "uploadMethod",
        "Upload method",
        ["Proxy through app", "Direct / Signed URL"],
        "Proxy through app",
        "Signed URLs let clients send bytes straight to object storage instead of through your servers.",
      ),
      num("urlExpiryMinutes", "URL expiry (minutes)", 15, 1, 1440),
    ],
  },
  {
    type: "image-processor",
    label: "Image Processor",
    category: "compute",
    icon: Image,
    blurb: "Generates resized image variants",
    configFields: [
      num("instances", "Instances", 1, 1, 256),
    ],
  },
  {
    type: "video-encoder",
    label: "Video Encoder",
    category: "compute",
    icon: Film,
    blurb: "Encodes playback renditions",
    configFields: [
      num("instances", "Instances", 1, 1, 512),
      sel("ladder", "Bitrate ladder", ["Single bitrate", "Adaptive (4 renditions)", "Adaptive (6 renditions)"], "Single bitrate"),
    ],
  },
  {
    type: "transcoder",
    label: "Transcoder",
    category: "compute",
    icon: Clapperboard,
    blurb: "Converts media formats",
    configFields: [num("instances", "Instances", 1, 1, 256)],
  },
  {
    type: "manifest-generator",
    label: "Manifest Generator",
    category: "compute",
    icon: ListVideo,
    blurb: "Writes HLS / DASH playlists",
    configFields: [sel("format", "Format", ["HLS", "DASH", "HLS + DASH"])],
  },
  {
    type: "search-indexer",
    label: "Search Indexer",
    category: "compute",
    icon: FileSearch,
    blurb: "Turns source rows into search documents",
    configFields: [
      sel("mode", "Indexing mode", ["Nightly batch", "Change data capture"], "Nightly batch"),
      num("instances", "Instances", 1, 1, 64),
    ],
  },
  {
    type: "websocket-gateway",
    label: "WebSocket Gateway",
    category: "compute",
    icon: Wifi,
    blurb: "Holds live client connections",
    configFields: [
      num("instances", "Instances", 1, 1, 256),
      sel(
        "connectionState",
        "Connection lookup",
        ["Local only", "Shared registry"],
        "Local only",
        "A shared registry lets any node find which gateway holds a given user's socket.",
      ),
    ],
  },
  {
    type: "presence-service",
    label: "Presence Service",
    category: "compute",
    icon: Radio,
    blurb: "Tracks who is online",
    configFields: [num("heartbeatSeconds", "Heartbeat interval (s)", 30, 5, 600)],
  },
  {
    type: "feed-service",
    label: "Feed Service",
    category: "compute",
    icon: Rss,
    blurb: "Builds personalized timelines",
    configFields: [
      sel(
        "strategy",
        "Fan-out strategy",
        ["Fan-out on read", "Fan-out on write", "Hybrid"],
        "Fan-out on read",
        "Hybrid pushes posts for normal accounts and pulls posts from very large accounts at read time.",
      ),
      num("celebrityThreshold", "Celebrity follower threshold", 100000, 1000, 100000000),
      num("instances", "Instances", 1, 1, 256),
    ],
  },
  {
    type: "ranking-service",
    label: "Ranking Service",
    category: "compute",
    icon: TrendingUp,
    blurb: "Orders feed or search results",
    configFields: [sel("model", "Ranking model", ["Recency", "Engagement score", "Learned ranker"])],
  },
  {
    type: "chunking-service",
    label: "Chunking Service",
    category: "compute",
    icon: Boxes,
    blurb: "Splits big files into blocks",
    configFields: [
      num("chunkSizeMb", "Chunk size (MB)", 4, 1, 256),
      toggle("dedup", "Content-hash dedup"),
      toggle("resumable", "Resumable uploads"),
    ],
  },
  {
    type: "key-generator",
    label: "Key Generator",
    category: "compute",
    icon: Hash,
    blurb: "Hands out unique short IDs",
    configFields: [
      sel("strategy", "Strategy", ["Random + collision check", "Counter + Base62", "Hash of URL"], "Random + collision check"),
      num("keyLength", "Key length", 7, 4, 16),
      num("batchSize", "Pre-allocated batch size", 1000, 1, 1000000),
    ],
  },
  {
    type: "edge-compute",
    label: "Edge Compute",
    category: "compute",
    icon: Sparkles,
    blurb: "Runs small functions at CDN edges",
    configFields: [
      sel("purpose", "Purpose", ["Header rewrite", "Personalize cached shell", "Auth check"], "Header rewrite"),
      num("runtimeMs", "Runtime per request (ms)", 5, 1, 200),
    ],
  },
  {
    type: "job-scheduler",
    label: "Job Scheduler",
    category: "compute",
    icon: CalendarClock,
    blurb: "Triggers jobs on a schedule",
    configFields: [
      txt("schedule", "Schedule (cron)", "0 * * * *"),
      sel("durability", "Job durability", ["In-memory", "Durable store"], "In-memory"),
      num("concurrencyLimit", "Concurrency limit", 10, 1, 10000),
      toggle("leaderElection", "Leader election", "Disabled", "Only one scheduler replica fires each job."),
    ],
  },
  {
    type: "feature-flag-service",
    label: "Feature Flag Service",
    category: "compute",
    icon: ToggleRight,
    blurb: "Turns features on without a deploy",
    configFields: [
      sel("rollout", "Rollout strategy", ["All or nothing", "Percentage", "Targeted segments"], "All or nothing"),
      num("rolloutPercent", "Rollout percent", 100, 0, 100),
      toggle("killSwitch", "Kill switch"),
      toggle("localEvaluation", "SDK local evaluation", "Disabled", "Apps keep a cached copy of flag rules so lookups never block requests."),
    ],
  },
  {
    type: "configuration-service",
    label: "Configuration Service",
    category: "compute",
    icon: Settings2,
    blurb: "Ships versioned runtime config",
    configFields: [
      toggle("versioned", "Versioned config", "Enabled"),
      sel("delivery", "Delivery", ["Poll every 60s", "Push on change"], "Poll every 60s"),
    ],
  },
  {
    type: "authz-service",
    label: "Authorization Service",
    category: "compute",
    icon: ShieldCheck,
    blurb: "Decides who may do what",
    configFields: [
      sel("model", "Policy model", ["Role based", "Attribute based", "Relationship based"], "Role based"),
      num("decisionCacheSeconds", "Decision cache (s)", 30, 0, 3600),
    ],
  },
  {
    type: "notification-orchestrator",
    label: "Notification Decision Service",
    category: "compute",
    icon: Bell,
    blurb: "Chooses channel, timing and dedup",
    configFields: [
      num("dedupWindowMinutes", "Dedup window (min)", 0, 0, 1440),
      toggle("quietHours", "Respect quiet hours"),
      toggle("channelFallback", "Channel fallback", "Disabled", "Retry over SMS or email when push delivery fails."),
      toggle("userPreferences", "User preference check"),
    ],
  },
  {
    type: "collaboration-engine",
    label: "Collaboration Engine",
    category: "compute",
    icon: GitMerge,
    blurb: "Merges simultaneous edits",
    configFields: [
      sel("mergeStrategy", "Merge strategy", ["Last write wins", "Operational transform", "CRDT"], "Last write wins"),
      num("snapshotEveryOps", "Snapshot every N ops", 500, 10, 100000),
    ],
  },
  {
    type: "telemetry-collector",
    label: "Telemetry Collector",
    category: "compute",
    icon: Activity,
    blurb: "Buffers metrics, logs and traces",
    configFields: [
      num("bufferMinutes", "Local buffer (min)", 5, 0, 1440),
      num("samplingPercent", "Trace sampling %", 100, 1, 100),
    ],
  },
  {
    type: "media-packager",
    label: "Media Packager",
    category: "compute",
    icon: Package,
    blurb: "Packages segments with DRM",
    configFields: [toggle("drm", "DRM encryption")],
  },
  {
    type: "model-server",
    label: "Model Server",
    category: "compute",
    icon: BrainCircuit,
    blurb: "Serves live predictions",
    configFields: [
      sel("size", "Size", SERVER_SIZES, "Medium"),
      num("instances", "Warm instances", 1, 1, 256),
      num("coldStartSeconds", "Cold start (s)", 90, 0, 900),
      sel("featureLookup", "Feature lookup", ["Inline from warehouse", "Online feature store"], "Inline from warehouse"),
      num("timeoutMs", "Prediction timeout (ms)", 1000, 10, 30000),
      sel("fallback", "Fallback when slow", ["None", "Cached / default prediction"], "None"),
    ],
  },
  {
    type: "training-job",
    label: "Training Job",
    category: "compute",
    icon: FlaskConical,
    blurb: "Runs GPU training against a dataset",
    configFields: [
      sel("gpuType", "GPU type", ["T4", "A100", "H100"], "A100"),
      num("gpuCount", "GPU count", 8, 1, 1024),
      sel("strategy", "Parallelism", ["Single node", "Data parallel"], "Single node"),
      num(
        "dataLoaderThroughputSamplesPerSec",
        "Data loader throughput (samples/s)",
        2000,
        1,
        10000000,
        "If loaders feed samples slower than the GPUs consume them, the GPUs sit idle.",
      ),
      num("checkpointMinutes", "Checkpoint every (min)", 0, 0, 1440, "0 means never; a failure restarts from the beginning."),
      sel("scheduling", "Cluster scheduling", ["First come first served", "Fair-share quotas"], "First come first served"),
    ],
  },
  {
    type: "model-registry",
    label: "Model Registry",
    category: "compute",
    icon: Archive,
    blurb: "Versions models and promotion stage",
    configFields: [
      sel("promotion", "Promotion flow", ["Manual copy", "Staged (staging -> production)"], "Manual copy"),
      toggle("immutableVersions", "Immutable versions"),
      toggle("rollbackAlias", "Production alias (instant rollback)"),
      toggle("approvalGate", "Requires evaluation sign-off"),
    ],
  },
  {
    type: "experiment-tracker",
    label: "Experiment Tracker",
    category: "compute",
    icon: LineChart,
    blurb: "Links runs to code, data and params",
    configFields: [
      toggle("logCodeVersion", "Log code commit"),
      toggle("logDataVersion", "Log dataset version"),
      toggle("logHyperparameters", "Log hyperparameters"),
      toggle("logEnvironment", "Log environment image"),
    ],
  },
  {
    type: "data-validator",
    label: "Data Validator",
    category: "compute",
    icon: ClipboardCheck,
    blurb: "Rejects bad or sensitive records",
    configFields: [
      toggle("schemaChecks", "Schema checks"),
      toggle("piiFilter", "PII filter"),
      num("maxNullPercent", "Max null %", 100, 0, 100),
      toggle("dedupe", "Deduplicate by event id"),
    ],
  },
  {
    type: "batch-scoring-job",
    label: "Batch Scoring Job",
    category: "compute",
    icon: Layers,
    blurb: "Scores large record sets offline",
    configFields: [
      num("instances", "Instances", 1, 1, 1024),
      sel("scope", "Scoring scope", ["Full rescore", "Changed records only"], "Full rescore"),
      sel("publish", "Publish results", ["Overwrite in place", "Write new version, then swap"], "Overwrite in place"),
    ],
  },
  {
    type: "embedding-service",
    label: "Embedding Service",
    category: "compute",
    icon: Shuffle,
    blurb: "Turns text into vectors",
    configFields: [
      sel("model", "Embedding model", ["Small (384d)", "Large (1536d)"], "Small (384d)"),
      num("batchSize", "Batch size", 32, 1, 2048),
    ],
  },
  {
    type: "llm-inference-server",
    label: "LLM Inference Server",
    category: "compute",
    icon: Bot,
    blurb: "Generates tokens on GPUs",
    configFields: [
      sel("modelTier", "Model tier", ["Small (8B)", "Medium (70B)", "Flagship"], "Medium (70B)"),
      sel("gpuType", "GPU type", ["A100", "H100"], "H100"),
      num("gpuCount", "GPU count", 8, 1, 512),
      sel("batchingMode", "Batching", ["Static batching", "Continuous batching"], "Static batching"),
      sel("quantization", "Quantization", ["FP16", "FP8", "INT4"], "FP16"),
      toggle("prefixCaching", "KV prefix caching"),
    ],
  },
  {
    type: "eval-harness",
    label: "Eval Harness",
    category: "compute",
    icon: BadgeCheck,
    blurb: "Scores model output before release",
    configFields: [
      num("goldenSetSize", "Golden set size", 100, 0, 100000),
      sel("judge", "Judge", ["Exact match", "Small model judge", "Large model judge"], "Small model judge"),
      num("humanAgreementKappa", "Judge/human agreement (kappa)", 0.4, 0, 1),
      num("regressionGatePercent", "Regression gate (% drop)", 10, 0, 100),
      toggle("biasCorrection", "Judge bias correction"),
      toggle("ciGate", "Blocks release on failure"),
    ],
  },
  {
    type: "tool-sandbox",
    label: "Tool Sandbox",
    category: "compute",
    icon: Lock,
    blurb: "Runs agent tool calls in isolation",
    configFields: [
      sel("permissions", "Permissions", ["Full access", "Scoped allowlist"], "Full access"),
      toggle("humanApproval", "Human approval for risky actions"),
      num("maxSteps", "Max steps per task", 50, 1, 1000),
    ],
  },

  // ----- networking
  {
    type: "load-balancer",
    label: "Load Balancer",
    category: "networking",
    icon: Network,
    blurb: "Spreads traffic across servers",
    configFields: [
      sel("layer", "Layer", ["Layer 7", "Layer 4"]),
      sel("algorithm", "Algorithm", ["Round Robin", "Least Connections", "Weighted Round Robin"]),
      toggle("healthChecks", "Health checks", "Disabled", "Stops sending traffic to instances that fail probes."),
      toggle(
        "sessionAffinity",
        "Session affinity (sticky sessions)",
        "Disabled",
        "Keeps each client on the same backend. Fixes routing, not durability: if that server dies, its local sessions die too.",
      ),
      sel(
        "pathRouting",
        "Path-based routing",
        ["Disabled", "Enabled"],
        "Disabled",
        "Layer 7 only: send different URL paths to different server pools.",
      ),
      toggle(
        "readAfterWriteConsistency",
        "Read-after-write consistency",
        "Disabled",
        "Routes a user's reads to the primary for a short window after they write.",
      ),
      region(),
    ],
  },
  {
    type: "api-gateway",
    label: "API Gateway",
    category: "networking",
    icon: Waypoints,
    blurb: "One front door for many APIs",
    configFields: [
      sel("auth", "Auth", ["None", "API key", "JWT"]),
      num("rateLimitPerClientRps", "Rate limit per client (req/sec)", 1000, 1, 1000000),
      num("timeoutMs", "Request timeout (ms)", 5000, 1, 120000),
      sel("aggregation", "Response aggregation", ["None", "Backend for frontend"], "None"),
      sel("versioningStrategy", "Versioning", ["None", "URI versioning", "Header versioning"], "None"),
      txt("supportedVersions", "Supported versions", "", 'Comma-separated, e.g. "v1, v2".'),
      sel("idempotencyKeys", "Idempotency keys", ["Ignored", "Required on writes"], "Ignored"),
    ],
  },
  {
    type: "cdn",
    label: "CDN",
    category: "networking",
    icon: Cloud,
    blurb: "Caches content near users",
    configFields: [
      sel("cachedContent", "Cached content", ["Static assets", "Images", "Video segments", "Static + API GETs"], "Static assets"),
      num("ttlSeconds", "TTL (seconds)", 3600, 0, 31536000),
      sel(
        "assetVersioning",
        "Asset versioning",
        ["None", "Content-hashed filenames"],
        "None",
        "Hashed filenames change on every build, so browsers and edges can never serve a stale bundle.",
      ),
      toggle("originShield", "Origin shield", "Disabled", "One regional cache layer collapses edge misses before they reach the origin."),
      sel("edgeLocations", "Edge footprint", ["Single region", "Global"], "Global"),
    ],
  },
  {
    type: "dns",
    label: "DNS / Global Traffic Manager",
    category: "networking",
    icon: Globe,
    blurb: "Sends users to a healthy region",
    configFields: [
      sel("routingPolicy", "Routing policy", ["Simple", "Latency based", "Failover", "Geo"], "Simple"),
      toggle("healthChecks", "Region health checks"),
      num("ttlSeconds", "Record TTL (s)", 300, 5, 86400),
    ],
  },
  {
    type: "rate-limiter",
    label: "Rate Limiter",
    category: "networking",
    icon: Timer,
    blurb: "Caps request rates",
    configFields: [
      sel("algorithm", "Algorithm", ["Fixed window", "Sliding window", "Token bucket"], "Fixed window"),
      num("requestsPerSecond", "Limit (req/sec)", 100, 1, 10000000),
      sel("scope", "Scope", ["Per client", "Global"], "Per client"),
      sel("store", "Counter store", ["Local memory", "Shared (Redis)"], "Local memory"),
      sel("rampUpStrategy", "Recovery ramp", ["Immediate", "Gradual"], "Immediate"),
    ],
  },
  {
    type: "traffic-router",
    label: "Traffic Router",
    category: "networking",
    icon: Split,
    blurb: "Shifts traffic between versions",
    configFields: [
      sel("strategy", "Release strategy", ["All at once", "Canary", "Blue/green"], "All at once"),
      num("canaryPercent", "Canary traffic %", 100, 0, 100),
      toggle("autoRollback", "Automatic rollback on errors"),
    ],
  },
  {
    type: "cell-router",
    label: "Cell Router / Directory",
    category: "networking",
    icon: Route,
    blurb: "Pins customers to isolated cells",
    configFields: [num("cells", "Cells", 1, 1, 256)],
  },
  {
    type: "waiting-room",
    label: "Virtual Waiting Room",
    category: "networking",
    icon: Ticket,
    blurb: "Admits surges at a safe pace",
    configFields: [num("admissionRatePerMinute", "Admissions per minute", 1000, 1, 10000000)],
  },
  {
    type: "payment-gateway",
    label: "Payment Gateway",
    category: "networking",
    icon: CreditCard,
    blurb: "External card processor",
    configFields: [toggle("idempotencyKeys", "Send idempotency keys")],
  },
  {
    type: "email-provider",
    label: "Email Provider",
    category: "networking",
    icon: Mail,
    blurb: "Third-party email delivery",
    configFields: [],
  },
  {
    type: "push-provider",
    label: "Push Notification Provider",
    category: "networking",
    icon: Send,
    blurb: "APNs / FCM delivery",
    configFields: [],
  },
  {
    type: "sms-provider",
    label: "SMS Provider",
    category: "networking",
    icon: MessageSquareText,
    blurb: "Text message delivery",
    configFields: [],
  },
  {
    type: "egress-proxy",
    label: "Egress Proxy",
    category: "networking",
    icon: ShieldAlert,
    blurb: "Controls outbound calls",
    configFields: [toggle("allowlist", "Destination allowlist"), toggle("signing", "Sign outbound requests")],
  },
  {
    type: "llm-gateway",
    label: "LLM Gateway / Router",
    category: "networking",
    icon: Share2,
    blurb: "Routes prompts across models",
    configFields: [
      sel("routing", "Routing", ["Flagship only", "Cascade (confidence gated)"], "Flagship only"),
      toggle("semanticCache", "Semantic cache"),
      toggle("promptCaching", "Provider prompt caching"),
      num("perUserTokensPerMinute", "Per-user tokens/min", 0, 0, 10000000, "0 means unlimited."),
      toggle("fallbackProvider", "Fallback provider"),
    ],
  },

  // ----- database
  {
    type: "postgresql",
    label: "PostgreSQL",
    category: "database",
    icon: Database,
    blurb: "Relational, durable storage",
    configFields: relationalFields,
  },
  {
    type: "mysql",
    label: "MySQL",
    category: "database",
    icon: Database,
    blurb: "Relational, durable storage",
    configFields: relationalFields,
  },
  {
    type: "connection-pool",
    label: "Connection Pool",
    category: "database",
    icon: Layers,
    blurb: "Shares a few DB connections",
    configFields: [
      num("maxServerConnections", "Connections to database", 100, 1, 5000),
      sel("mode", "Pool mode", ["Session", "Transaction"], "Transaction"),
    ],
  },
  {
    type: "redis",
    label: "Redis",
    category: "database",
    icon: KeyRound,
    blurb: "In-memory key-value store",
    configFields: [
      sel("size", "Size", CACHE_SIZES, "Small"),
      sel("usage", "Used as", ["Cache", "Session store", "Connection registry", "Rate limit counters", "Leaderboard"], "Cache"),
      num("ttlSeconds", "TTL (seconds)", 300, 0, 604800),
      sel("evictionPolicy", "Eviction policy", ["allkeys-lru", "allkeys-lfu", "noeviction"], "allkeys-lru"),
      sel(
        "invalidation",
        "Invalidation",
        ["TTL only", "Delete on write"],
        "TTL only",
        "Delete-on-write removes a key whenever the source row changes, so readers never see stale stock or prices.",
      ),
      sel(
        "stampedeProtection",
        "Stampede protection",
        ["None", "Request coalescing", "Jittered TTL + coalescing"],
        "None",
      ),
      toggle("hotKeyReplication", "Hot-key replication", "Disabled", "Copies very hot keys to several shards or a local tier."),
      num("replicas", "Read replicas", 0, 0, 5),
      sel("persistence", "Persistence", ["None", "Append-only file"], "None"),
      region(),
    ],
  },
  {
    type: "dynamodb",
    label: "DynamoDB",
    category: "database",
    icon: DatabaseZap,
    blurb: "Managed key-value store",
    configFields: keyValueFields(),
  },
  {
    type: "mongodb",
    label: "MongoDB",
    category: "database",
    icon: Database,
    blurb: "Document database",
    configFields: keyValueFields(),
  },
  {
    type: "cassandra",
    label: "Cassandra",
    category: "database",
    icon: Database,
    blurb: "Wide-column, write-heavy store",
    configFields: keyValueFields("Medium"),
  },
  {
    type: "elasticsearch",
    label: "Elasticsearch",
    category: "database",
    icon: Search,
    blurb: "Full-text search engine",
    configFields: [
      sel("size", "Size", ["Small", "Medium", "Large", "XL"], "Small"),
      num("shards", "Primary shards", 1, 1, 256),
      num("replicas", "Replicas per shard", 0, 0, 5),
    ],
  },
  {
    type: "search-index",
    label: "Search Index",
    category: "database",
    icon: FileSearch,
    blurb: "Derived low-latency lookup index",
    configFields: [sel("size", "Size", ["Small", "Medium", "Large", "XL"], "Small"), num("shards", "Shards", 1, 1, 256)],
  },
  {
    type: "object-storage",
    label: "Object Storage",
    category: "database",
    icon: HardDrive,
    blurb: "Durable blobs and files",
    configFields: [
      sel("storageClass", "Storage class", ["Standard", "Infrequent access", "Archive"], "Standard"),
      num("lifecycleDays", "Move to cheaper tier after (days)", 0, 0, 3650, "0 disables the lifecycle rule."),
      num("expireDays", "Delete after (days)", 0, 0, 3650, "0 keeps objects forever."),
      toggle("versioning", "Object versioning"),
      sel("keyLayout", "Key layout", ["Flat prefix", "Hashed prefixes"], "Flat prefix"),
      region(),
    ],
  },
  {
    type: "shared-filesystem",
    label: "Shared Filesystem",
    category: "database",
    icon: Folder,
    blurb: "Network drive many hosts mount",
    configFields: [
      sel("throughputMode", "Throughput mode", ["Bursting", "Provisioned"], "Bursting"),
      num("provisionedIops", "Provisioned IOPS", 3000, 100, 200000),
    ],
  },
  {
    type: "geo-index",
    label: "Geo Index",
    category: "database",
    icon: MapPin,
    blurb: "Answers 'what is near me'",
    configFields: [
      sel("indexType", "Index type", ["Geohash grid", "Quadtree"], "Geohash grid"),
      num("shardCount", "Shards", 1, 1, 256),
      num("updateIntervalSeconds", "Location update interval (s)", 4, 1, 60),
    ],
  },
  {
    type: "ledger",
    label: "Financial Ledger",
    category: "database",
    icon: Landmark,
    blurb: "Append-only money movements",
    configFields: [
      toggle("doubleEntry", "Double-entry postings"),
      toggle("immutable", "Immutable entries"),
      toggle("idempotencyKeys", "Idempotency keys"),
    ],
  },
  {
    type: "feature-store",
    label: "Feature Store",
    category: "database",
    icon: Database,
    blurb: "Shared features for training and serving",
    configFields: [
      sel("onlineStore", "Online store", ["None", "Redis", "DynamoDB"], "None"),
      sel("freshness", "Freshness", ["Daily batch", "Hourly batch", "Streaming"], "Daily batch"),
      toggle("pointInTimeJoins", "Point-in-time joins", "Disabled", "Training rows only see feature values known at the label's timestamp."),
      toggle("sharedDefinitions", "Shared feature definitions"),
      num("onlineCacheGb", "Online cache size (GB)", 16, 1, 4096),
    ],
  },
  {
    type: "dataset-store",
    label: "Dataset Store",
    category: "database",
    icon: Database,
    blurb: "Versioned training data",
    configFields: [
      sel("versioning", "Versioning", ["Overwrite in place", "Immutable snapshots"], "Overwrite in place"),
      sel("splitStrategy", "Train/test split", ["Random rows", "By time", "By entity"], "Random rows"),
    ],
  },
  {
    type: "vector-database",
    label: "Vector Database",
    category: "database",
    icon: Database,
    blurb: "Semantic search over embeddings",
    configFields: [
      sel("indexType", "Index", ["Flat", "HNSW", "IVF"], "HNSW"),
      sel("quantization", "Quantization", ["None", "Scalar", "Product"], "None"),
      num("shardCount", "Shards", 1, 1, 128),
      toggle("hybridSearch", "Hybrid (keyword + vector)"),
      toggle("metadataFiltering", "Metadata filtering (ACLs)"),
    ],
  },
  {
    type: "audit-log",
    label: "Audit Log",
    category: "database",
    icon: ScrollText,
    blurb: "Tamper-evident change history",
    configFields: [num("retentionDays", "Retention (days)", 365, 1, 3650), toggle("immutable", "Write-once")],
  },
  {
    type: "log-store",
    label: "Log Store",
    category: "database",
    icon: FileClock,
    blurb: "Searchable application logs",
    configFields: [num("retentionDays", "Retention (days)", 30, 1, 3650), toggle("structured", "Structured (JSON) logs")],
  },
  {
    type: "metrics-store",
    label: "Metrics Store",
    category: "database",
    icon: Gauge,
    blurb: "Time-series metrics",
    configFields: [
      sel("aggregation", "Latency aggregation", ["Average only", "Percentiles (p50/p95/p99)"], "Average only"),
      num("retentionDays", "Retention (days)", 15, 1, 3650),
    ],
  },
  {
    type: "trace-store",
    label: "Trace Store",
    category: "database",
    icon: GitBranch,
    blurb: "Distributed request traces",
    configFields: [num("samplingPercent", "Sampling %", 10, 1, 100), toggle("tailSampling", "Keep all slow / error traces")],
  },
  {
    type: "session-registry",
    label: "Session Registry",
    category: "database",
    icon: Users,
    blurb: "Maps users to live sessions",
    configFields: [num("ttlSeconds", "Entry TTL (s)", 120, 5, 86400)],
  },
  {
    type: "graph-store",
    label: "Graph Store",
    category: "database",
    icon: Workflow,
    blurb: "Relationship queries",
    configFields: [sel("size", "Size", ["Small", "Medium", "Large"], "Small")],
  },

  // ----- messaging
  {
    type: "message-queue",
    label: "Message Queue",
    category: "messaging",
    icon: MessageSquare,
    blurb: "Buffers work between services",
    configFields: [
      toggle("retry", "Retry failed messages", "Enabled"),
      num("maxRetries", "Max retries", 0, 0, 100, "0 retries forever; a bad message can block its consumers indefinitely."),
      toggle("dlqEnabled", "Dead-letter queue"),
      sel("priority", "Priority", ["Single lane", "Priority lanes"], "Single lane"),
      sel("ordering", "Ordering", ["Best effort", "FIFO per key"], "Best effort"),
      num("visibilityTimeoutSec", "Visibility timeout (s)", 30, 1, 43200),
    ],
  },
  {
    type: "event-stream",
    label: "Event Stream",
    category: "messaging",
    icon: Radio,
    blurb: "Durable, ordered event log",
    configFields: [
      num("partitions", "Partitions", 1, 1, 1024),
      num("replicationFactor", "Replication factor", 1, 1, 5),
      txt("partitionKey", "Partition key", ""),
      num("retentionHours", "Retention (hours)", 24, 1, 8760),
    ],
  },
  {
    type: "pub-sub",
    label: "Pub/Sub",
    category: "messaging",
    icon: Share2,
    blurb: "Fans events out to subscribers",
    configFields: [
      sel(
        "subscriberIsolation",
        "Subscriber isolation",
        ["Shared delivery", "Queue per subscriber"],
        "Shared delivery",
        "With a queue per subscriber, a slow consumer only delays itself.",
      ),
      sel("schema", "Event schema", ["Untyped JSON", "Versioned schema registry"], "Untyped JSON"),
    ],
  },
  {
    type: "labeling-queue",
    label: "Labeling Queue",
    category: "messaging",
    icon: Tag,
    blurb: "Sends items to human labelers",
    configFields: [
      sel("reviewMode", "Review mode", ["Single reviewer", "Consensus (2 of 3)"], "Single reviewer"),
      num("labelers", "Labelers", 10, 1, 10000),
      num("itemsPerLabelerPerHour", "Items / labeler / hour", 60, 1, 2000),
      toggle("activeLearning", "Active learning prioritization"),
    ],
  },

  // ----- reliability
  {
    type: "replica",
    label: "Replica",
    category: "reliability",
    icon: Copy,
    blurb: "Redundant copy of a component",
    configFields: [num("count", "Copies", 1, 1, 10)],
  },
  {
    type: "health-check",
    label: "Health Check",
    category: "reliability",
    icon: HeartPulse,
    blurb: "Finds unhealthy instances",
    configFields: [num("intervalSeconds", "Interval (s)", 10, 1, 300), num("unhealthyThreshold", "Failures before unhealthy", 3, 1, 10)],
  },
  {
    type: "auto-scaling",
    label: "Auto Scaling",
    category: "reliability",
    icon: Scale,
    blurb: "Grows and shrinks capacity",
    configFields: [
      sel("metric", "Scaling signal", ["CPU utilization", "Queue depth / backlog", "Request concurrency"], "CPU utilization"),
      num("min", "Min instances", 1, 0, 1000),
      num("max", "Max instances", 10, 1, 5000),
      num("targetPercent", "Target utilization %", 70, 10, 95),
      num("scaleOutCooldownSec", "Scale-out reaction (s)", 300, 0, 3600),
      num("warmPool", "Pre-warmed instances", 0, 0, 1000, "Started ahead of time so scale-out skips the cold start."),
      toggle("downstreamAware", "Cap by downstream capacity"),
    ],
  },
  {
    type: "multi-az",
    label: "Multi-AZ",
    category: "reliability",
    icon: ServerCog,
    blurb: "Spreads across availability zones",
    configFields: [num("zones", "Zones", 2, 2, 6)],
  },
  {
    type: "backup",
    label: "Backup",
    category: "reliability",
    icon: Archive,
    blurb: "Scheduled data snapshots",
    configFields: [
      num("frequencyHours", "Snapshot every (h)", 24, 1, 168),
      num("retentionDays", "Retention (days)", 7, 1, 3650),
      toggle("pointInTimeRecovery", "Point-in-time recovery"),
    ],
  },
  {
    type: "circuit-breaker",
    label: "Circuit Breaker",
    category: "reliability",
    icon: Zap,
    blurb: "Stops calls to failing dependencies",
    configFields: [
      num("failureThresholdPercent", "Open at error %", 50, 1, 100),
      num("openSeconds", "Stay open (s)", 30, 1, 3600),
      sel("fallback", "Fallback", ["Error", "Cached / default response"], "Error"),
      num("timeoutMs", "Call timeout (ms)", 2000, 10, 60000),
    ],
  },
  {
    type: "retry-policy",
    label: "Retry Policy",
    category: "reliability",
    icon: RefreshCw,
    blurb: "Retries transient failures",
    configFields: [
      num("maxAttempts", "Max attempts", 5, 1, 20),
      sel("backoff", "Backoff", ["Immediate", "Fixed", "Exponential"], "Immediate"),
      toggle("jitter", "Jitter"),
      num("retryBudgetPercent", "Retry budget (% of traffic)", 100, 0, 100),
    ],
  },
  {
    type: "bulkhead",
    label: "Bulkhead",
    category: "reliability",
    icon: Boxes,
    blurb: "Separate pools per dependency",
    configFields: [num("pools", "Isolated pools", 1, 1, 32), num("maxConcurrentPerPool", "Max concurrent per pool", 50, 1, 10000)],
  },
  {
    type: "availability-zone",
    label: "Availability Zone",
    category: "reliability",
    icon: Hash,
    blurb: "Marks a failure domain",
    configFields: [sel("zone", "Zone", ["az-a", "az-b", "az-c"], "az-a")],
  },
  {
    type: "disaster-recovery-region",
    label: "Disaster Recovery Region",
    category: "reliability",
    icon: Globe,
    blurb: "Secondary region to recover into",
    configFields: [
      sel("mode", "Recovery mode", ["Backup & restore", "Pilot light", "Warm standby", "Active-active"], "Backup & restore"),
      num("rpoMinutes", "RPO (min)", 1440, 0, 10080),
      num("rtoMinutes", "RTO (min)", 720, 0, 10080),
    ],
  },
];

const BY_TYPE = new Map(COMPONENTS.map((c) => [c.type, c]));
const BY_LABEL = new Map(COMPONENTS.map((c) => [c.label, c.type]));

export function getComponent(type: string): ComponentDef | undefined {
  return BY_TYPE.get(type);
}

export function componentLabel(type: string): string {
  return BY_TYPE.get(type)?.label ?? type;
}

export function componentTypeForLabel(label: string): string | undefined {
  return BY_LABEL.get(label);
}

export function defaultConfigFor(type: string): Record<string, ConfigValue> {
  const def = BY_TYPE.get(type);
  return def ? Object.fromEntries(def.configFields.map((f) => [f.key, f.defaultValue])) : {};
}

/** Short per-type display names: server1, server2, balancer1, postgresql1 ... */
export function computeNodeDisplayNames(nodes: { id: string; type: string }[]): Map<string, string> {
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const node of nodes) {
    const parts = node.type.split("-");
    const stem = parts[parts.length - 1];
    const n = (counts.get(stem) ?? 0) + 1;
    counts.set(stem, n);
    names.set(node.id, `${stem}${n}`);
  }
  return names;
}

export function paletteGroups(): { category: Category; label: string; components: ComponentDef[] }[] {
  return CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    components: COMPONENTS.filter((c) => c.category === category),
  })).filter((g) => g.components.length > 0);
}

/* ---------- visual style per category ---------- */
export type CategoryStyle = {
  chip: string;
  tint: string;
  border: string;
  ring: string;
  bar: string;
  dot: string;
  text: string;
  shape: "pill" | "tight" | "hex" | "soft";
};

export const CATEGORY_STYLES: Record<Category, CategoryStyle> = {
  client: {
    chip: "bg-sky-400/15 text-sky-300",
    tint: "bg-sky-400/15",
    border: "border-sky-400",
    ring: "ring-sky-400/50",
    bar: "bg-sky-400",
    dot: "bg-sky-400",
    text: "text-sky-300",
    shape: "pill",
  },
  compute: {
    chip: "bg-violet-400/15 text-violet-300",
    tint: "bg-violet-400/15",
    border: "border-violet-400",
    ring: "ring-violet-400/50",
    bar: "bg-violet-400",
    dot: "bg-violet-400",
    text: "text-violet-300",
    shape: "tight",
  },
  networking: {
    chip: "bg-amber-400/15 text-amber-300",
    tint: "bg-amber-400/15",
    border: "border-amber-400",
    ring: "ring-amber-400/50",
    bar: "bg-amber-400",
    dot: "bg-amber-400",
    text: "text-amber-300",
    shape: "hex",
  },
  database: {
    chip: "bg-emerald-400/15 text-emerald-300",
    tint: "bg-emerald-400/15",
    border: "border-emerald-400",
    ring: "ring-emerald-400/50",
    bar: "bg-emerald-400",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    shape: "soft",
  },
  messaging: {
    chip: "bg-orange-400/15 text-orange-300",
    tint: "bg-orange-400/15",
    border: "border-orange-400",
    ring: "ring-orange-400/50",
    bar: "bg-orange-400",
    dot: "bg-orange-400",
    text: "text-orange-300",
    shape: "hex",
  },
  reliability: {
    chip: "bg-rose-400/15 text-rose-300",
    tint: "bg-rose-400/15",
    border: "border-rose-400",
    ring: "ring-rose-400/50",
    bar: "bg-rose-400",
    dot: "bg-rose-400",
    text: "text-rose-300",
    shape: "pill",
  },
};

export const HEX_CLIP = "polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0% 50%)";

export function shapeRadius(shape: CategoryStyle["shape"]): string {
  return shape === "pill" ? "rounded-full" : shape === "tight" ? "rounded-md" : shape === "soft" ? "rounded-xl" : "";
}
