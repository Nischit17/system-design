import type { ProblemDef } from "../types";
import { configIs, fmt, node as n, rule, wire as w } from "../builders";
import type { Ctx } from "@/lib/sim/evaluate";
import * as E from "@/lib/sim/engine";

const SEC = (n: number) => `/tracks/llm-system-design/sections/llm-system-design-section-${n}`;

const generates = (c: Ctx) => c.edge("application-server", "llm-gateway") || c.edge("application-server", "llm-inference-server") || c.edge("worker", "llm-gateway");
const approximateIndex = (c: Ctx) => c.nodes("vector-database").some((v) => ["HNSW", "IVF"].includes(E.str(v.config.indexType)));
const ingestion = (c: Ctx) => c.path("object-storage", "worker", "embedding-service", "vector-database");
const tokensPerSec = (c: Ctx) => c.nodes("llm-inference-server").reduce((s, l) => s + E.llmTokensPerSec(l), 0);
const gpuCost = (c: Ctx) => c.nodes("llm-inference-server").reduce((s, l) => s + E.nodeCostUsd(l), 0);
const immutableAudit = (c: Ctx, near: string) => c.nodes("audit-log").some((a) => E.str(a.config.immutable) === "Enabled" && c.nodes(near).some((x) => E.linkedEitherWay(c.g, a.id, x.id)));

/* ---------------- RAG Foundations ---------------- */

const ownDocs: ProblemDef = {
  code: "LLM0001",
  slug: "answers-from-our-own-docs",
  title: "Answers From Our Own Docs",
  difficulty: "Medium",
  minutes: 20,
  description:
    "Lanternfish's support assistant answers from the model's general knowledge, so it invents product features and outdated prices. The company has 40,000 help articles, about 20 million chunks once split. Ground every answer in retrieved documentation: ingest the articles into a vector index, and retrieve relevant passages for each question before generating.",
  guide: {
    title: "RAG paths",
    description: "Ingestion embeds document chunks into a vector index; each question is embedded, matched and answered with the retrieved context.",
    flow: ["object-storage", "worker", "embedding-service", "vector-database"],
    secondary: { title: "Question answering", flow: ["load-balancer", "application-server", "vector-database"] },
    extra: [{ title: "Generation", flow: ["application-server", "llm-gateway", "llm-inference-server"] }],
    notes: ["Questions and documents must be embedded by the same model to be comparable."],
  },
  concepts: ["Retrieval-augmented generation", "Approximate nearest-neighbor search"],
  reading: [{ title: "RAG foundations learning path", description: "Review retrieval and grounding.", href: `${SEC(1)}#rag` }],
  components: ["object-storage", "worker", "embedding-service", "vector-database", "web-client", "load-balancer", "application-server", "llm-gateway", "llm-inference-server"],
  checks: [
    rule("Ingest articles: chunk them, embed the chunks and store them in a vector database.", ingestion, { category: "validity", label: "Ingestion", points: 15 }),
    rule("Retrieve passages from the vector database and generate answers with an LLM.", (c) => c.edge("application-server", "vector-database") && generates(c), { category: "validity", label: "Grounded answers", points: 15 }),
    rule("Use an approximate index (HNSW or IVF); a flat scan over 20 million chunks is too slow.", approximateIndex, { category: "Latency", label: "ANN index", points: 15 }),
    rule("Embed questions with the same embedding service used for documents.", (c) =>
      c.nodes("embedding-service").some((e) => E.incoming(c.g, e.id).some((x) => x.type === "application-server") && E.incoming(c.g, e.id).some((x) => x.type === "worker")), {
      category: "Correctness",
      label: "Same embeddings",
    }),
  ],
  reference: {
    config: [
      "Articles in object storage -> chunking workers -> embedding service (1536d) -> vector database (HNSW, 2 shards, metadata filtering).",
      "Questions: app embeds with the same service, retrieves top passages and calls the LLM through a gateway.",
    ],
    explanation: [
      "The model can only be as accurate as the context it's given. Retrieval supplies current, company-specific facts.",
      "Approximate indexes trade a sliver of recall for orders of magnitude lower latency at this scale.",
    ],
    graph: {
      nodes: [
        n("docs", "object-storage", 40, 80),
        n("chunker", "worker", 260, 80, { instances: 2, idempotent: "Enabled" }),
        n("embed", "embedding-service", 500, 160, { model: "Large (1536d)", batchSize: 64 }),
        n("vdb", "vector-database", 740, 160, { indexType: "HNSW", shardCount: 2, metadataFiltering: "Enabled" }),
        n("users", "web-client", 40, 320),
        n("lb", "load-balancer", 260, 320, { healthChecks: "Enabled" }),
        n("app", "application-server", 500, 320, { size: "Medium", instances: 2 }),
        n("gateway", "llm-gateway", 740, 400),
        n("llm", "llm-inference-server", 980, 400, { modelTier: "Medium (70B)", gpuType: "H100", gpuCount: 2, batchingMode: "Continuous batching" }),
      ],
      edges: w("docs>chunker>embed>vdb", "users>lb>app>embed", "app>vdb", "app>gateway>llm"),
    },
  },
};

const hybrid: ProblemDef = {
  code: "LLM0002",
  slug: "keyword-questions-embeddings-miss",
  title: "Keyword Questions Embeddings Miss",
  difficulty: "Medium",
  minutes: 18,
  description:
    "Ironbridge's RAG assistant handles 'how do I reset my router' well, but fails on 'what does error E-4021 mean on the X200 v3'. Pure vector search treats part numbers and error codes as fuzzy meaning and returns the wrong model's manual. Combine semantic and keyword retrieval, filter by product and version, and put the best passages first.",
  guide: {
    title: "Hybrid retrieval",
    description: "Retrieve with both vectors and keywords, filter by metadata, then re-rank the merged candidates.",
    flow: ["application-server", "vector-database", "ranking-service"],
    secondary: { title: "Generation", flow: ["application-server", "llm-gateway", "llm-inference-server"] },
    notes: ["Exact tokens like E-4021 are a keyword problem; 'my internet is slow' is a semantic one."],
  },
  concepts: ["Hybrid search", "Re-ranking"],
  reading: [{ title: "RAG foundations learning path", description: "Review hybrid retrieval.", href: `${SEC(1)}#hybrid` }],
  components: ["object-storage", "worker", "embedding-service", "vector-database", "elasticsearch", "application-server", "ranking-service", "llm-gateway", "llm-inference-server", "load-balancer"],
  checks: [
    rule("Combine keyword and vector retrieval (hybrid search, or a keyword index alongside the vector index).", (c) =>
      c.nodes("vector-database").some((v) => E.str(v.config.hybridSearch) === "Enabled") || (c.edge("application-server", "vector-database") && c.edge("application-server", "elasticsearch")), {
      category: "Retrieval",
      label: "Hybrid search",
      points: 25,
    }),
    configIs("vector-database", "metadataFiltering", "Enabled", "Filter retrieval by product and version metadata.", "Retrieval", 10),
    rule("Re-rank merged candidates before generation.", (c) => c.edge("application-server", "ranking-service"), { label: "Re-ranking", points: 15 }),
    rule("Generate answers from the retrieved passages.", (c) => c.edge("application-server", "vector-database") && generates(c), { category: "validity", label: "Grounded answers" }),
  ],
  reference: {
    config: ["Vector database: HNSW, hybrid search (vectors + keywords), metadata filtering by product and version.", "App re-ranks the merged top 50 with a learned ranker, then generates from the top 5."],
    explanation: ["Keywords catch exact identifiers; vectors catch paraphrases. Hybrid retrieval gets both.", "A re-ranker puts the most relevant passages where the model pays most attention."],
    graph: {
      nodes: [
        n("docs", "object-storage", 40, 60),
        n("chunker", "worker", 260, 60, { instances: 2 }),
        n("embed", "embedding-service", 500, 120, { model: "Large (1536d)" }),
        n("vdb", "vector-database", 740, 200, { indexType: "HNSW", hybridSearch: "Enabled", metadataFiltering: "Enabled", shardCount: 2 }),
        n("lb", "load-balancer", 40, 300, { healthChecks: "Enabled" }),
        n("app", "application-server", 260, 300, { size: "Medium", instances: 2 }),
        n("rerank", "ranking-service", 500, 300, { model: "Learned ranker" }),
        n("gateway", "llm-gateway", 500, 440),
        n("llm", "llm-inference-server", 740, 440, { modelTier: "Medium (70B)", gpuType: "H100", gpuCount: 2, batchingMode: "Continuous batching" }),
      ],
      edges: w("docs>chunker>embed>vdb", "lb>app>embed", "app>vdb", "app>rerank", "app>gateway>llm"),
    },
  },
};

const permissions: ProblemDef = {
  code: "LLM0003",
  slug: "the-bot-showed-someone-elses-salary",
  title: "The Bot Showed Someone Else's Salary",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Quorn's internal assistant indexes every document in the company drive. An engineer asked about 'compensation bands' and got a passage from an HR spreadsheet listing salaries. Make retrieval respect the same permissions as the source documents, keep cached answers from crossing between users, and record who saw what.",
  guide: {
    title: "Permission-aware retrieval",
    description: "Resolve the user's access, filter retrieval by it, and audit every answer.",
    flow: ["api-gateway", "application-server", "authz-service"],
    extra: [
      { title: "Retrieval", flow: ["application-server", "vector-database"] },
      { title: "Generation", flow: ["application-server", "llm-gateway", "llm-inference-server"] },
    ],
    notes: ["Filtering after generation is too late: the model has already read the document."],
  },
  concepts: ["Permission-aware search", "Data leakage through caches"],
  reading: [{ title: "RAG foundations learning path", description: "Review access control in RAG.", href: `${SEC(1)}#permissions` }],
  components: ["web-client", "api-gateway", "application-server", "authz-service", "embedding-service", "vector-database", "llm-gateway", "llm-inference-server", "audit-log", "object-storage", "worker"],
  checks: [
    rule("Resolve each user's permissions with an authorization service before retrieving.", (c) => c.edge("application-server", "authz-service"), { category: "Security", label: "User permissions", points: 20 }),
    configIs("vector-database", "metadataFiltering", "Enabled", "Filter retrieval by access-control metadata stored with each chunk.", "Security", 20),
    rule("Turn off the shared semantic cache, which could serve one user's answer to another.", (c) => c.has("llm-gateway") && c.nodes("llm-gateway").every((g) => E.str(g.config.semanticCache) !== "Enabled"), {
      category: "Security",
      label: "No cross-user cache",
    }),
    rule("Record every question and the documents used in an immutable audit log.", (c) => immutableAudit(c, "application-server"), { category: "Compliance", label: "Audit" }),
    rule("Authenticate users at the gateway.", (c) => c.nodes("api-gateway").some((g) => E.str(g.config.auth) !== "None"), { category: "Security", label: "Identity" }),
  ],
  reference: {
    config: [
      "Gateway (JWT) -> assistant -> relationship-based authz resolves the user's groups.",
      "Vector search filters chunks by ACL metadata copied from the source documents; semantic cache off; immutable audit log.",
    ],
    explanation: ["Once a document is in the model's context, its contents can appear in the answer. Permissions must be enforced at retrieval.", "Caches keyed only on question text are a side channel between users."],
    graph: {
      nodes: [
        n("docs", "object-storage", 40, 60),
        n("chunker", "worker", 260, 60, { instances: 2 }),
        n("embed", "embedding-service", 500, 120),
        n("vdb", "vector-database", 740, 200, { indexType: "HNSW", metadataFiltering: "Enabled", hybridSearch: "Enabled" }),
        n("web", "web-client", 40, 320),
        n("gw", "api-gateway", 260, 320, { auth: "JWT" }),
        n("app", "application-server", 500, 320, { size: "Medium", instances: 2 }),
        n("authz", "authz-service", 740, 340, { model: "Relationship based", decisionCacheSeconds: 30 }),
        n("gateway", "llm-gateway", 500, 480, { semanticCache: "Disabled" }),
        n("llm", "llm-inference-server", 740, 480, { modelTier: "Medium (70B)", gpuType: "H100", gpuCount: 2, batchingMode: "Continuous batching" }),
        n("audit", "audit-log", 260, 480, { immutable: "Enabled" }),
      ],
      edges: w("docs>chunker>embed>vdb", "web>gw>app>authz", "app>embed", "app>vdb", "app>gateway>llm", "app>audit"),
    },
  },
};

/* ---------------- Serving and Cost ---------------- */

const TOKEN_DEMAND = 120000;
const gpuBill: ProblemDef = {
  code: "LLM0004",
  slug: "the-gpu-bill",
  title: "The GPU Bill",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Mossgiel serves a 70B model that must produce 120,000 output tokens per second at peak. The current setup (static batching at FP16) would need over 40 H100s, which finance won't approve. Keep the 70B model, since smaller ones fail the quality bar and so did an INT4 build, and serve the peak at 80% utilization or less for $45,000 a month in GPUs.",
  guide: {
    title: "Serving path",
    description: "Requests flow through a gateway to inference servers tuned for throughput.",
    flow: ["application-server", "llm-gateway", "llm-inference-server"],
    notes: [
      "Per GPU at FP16 with static batching: A100 1,800 and H100 3,600 tokens/s for a 70B model.",
      "Continuous batching is about 2.4x; FP8 about 1.6x; INT4 about 2.2x.",
    ],
  },
  concepts: ["Continuous batching", "Quantization trade-offs", "GPU cost"],
  reading: [{ title: "Serving and cost learning path", description: "Review the throughput levers.", href: `${SEC(2)}#throughput` }],
  components: ["load-balancer", "application-server", "llm-gateway", "llm-inference-server"],
  checks: [
    rule("Serve the model from inference servers behind a gateway.", (c) => c.path("llm-gateway", "llm-inference-server"), { category: "validity", label: "Serving path" }),
    rule("Keep the 70B model.", (c) => c.has("llm-inference-server") && c.all("llm-inference-server", "modelTier", "Medium (70B)"), { category: "Quality", label: "Model tier" }),
    configIs("llm-inference-server", "batchingMode", "Continuous batching", "Use continuous batching so GPUs stay full as requests come and go.", "Throughput", 15, { all: true }),
    rule("Quantize to FP8 (INT4 failed the quality evaluation).", (c) => c.has("llm-inference-server") && c.all("llm-inference-server", "quantization", "FP8"), { category: "cost", label: "Quantization", points: 15 }),
    rule("Serve 120,000 tokens per second at 80% utilization or less.", (c) => tokensPerSec(c) * 0.8 >= TOKEN_DEMAND, {
      category: "capacity",
      label: "Token throughput",
      points: 20,
      fail: (c) => `Inference servers produce ${fmt(tokensPerSec(c))} tokens/s; 120,000 at 80% needs 150,000.`,
    }),
    rule("Keep GPU spend at or below $45,000 a month.", (c) => c.has("llm-inference-server") && gpuCost(c) <= 45000, {
      category: "cost",
      label: "GPU budget",
      points: 15,
      fail: (c) => `GPUs cost $${fmt(gpuCost(c))} a month.`,
    }),
  ],
  reference: {
    config: ["12 x H100 running the 70B model with continuous batching, FP8 and prefix caching: 165,888 tokens/s (72% at peak), $39,600/month."],
    explanation: [
      "Static batching wastes GPU time waiting for the slowest request in each batch; continuous batching refills slots as requests finish.",
      "FP8 roughly halves memory traffic with negligible quality loss for this model, unlike INT4.",
    ],
    graph: {
      nodes: [
        n("lb", "load-balancer", 40, 200, { healthChecks: "Enabled" }),
        n("app", "application-server", 260, 200, { size: "Large", instances: 2 }),
        n("gateway", "llm-gateway", 500, 200),
        n("llm", "llm-inference-server", 740, 200, { modelTier: "Medium (70B)", gpuType: "H100", gpuCount: 12, batchingMode: "Continuous batching", quantization: "FP8", prefixCaching: "Enabled" }),
      ],
      edges: w("lb>app>gateway>llm"),
    },
  },
};

const tiers = (c: Ctx) => new Set(c.nodes("llm-inference-server").map((l) => E.str(l.config.modelTier)));
const easyQuestions: ProblemDef = {
  code: "LLM0005",
  slug: "most-questions-are-easy",
  title: "Most Questions Are Easy",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Every question to Orchard's assistant goes to the flagship model. Analysis shows 70% could be answered by a small model, 30% are near-duplicates of recent questions, and every request repeats the same 3,000-token system prompt. A few users script thousands of requests a minute, and when the model provider has an outage, the assistant goes down. Cut cost without hurting quality, and make it resilient.",
  guide: {
    title: "Gateway levers",
    description: "A gateway caches, routes easy questions to a small model, escalates hard ones, and enforces quotas.",
    flow: ["application-server", "llm-gateway", "llm-inference-server"],
    notes: ["Cascade routing escalates to the bigger model only when the small one isn't confident."],
  },
  concepts: ["Model cascades", "Semantic and prompt caching", "Usage quotas"],
  reading: [{ title: "Serving and cost learning path", description: "Review routing and caching.", href: `${SEC(2)}#routing` }],
  components: ["load-balancer", "application-server", "llm-gateway", "llm-inference-server"],
  checks: [
    rule("Send all model traffic through an LLM gateway.", (c) => c.edge("application-server", "llm-gateway") && !c.edge("application-server", "llm-inference-server"), { category: "validity", label: "Gateway" }),
    rule("Route with a confidence-gated cascade across a small and a large model.", (c) =>
      c.is("llm-gateway", "routing", "Cascade (confidence gated)") && tiers(c).has("Small (8B)") && (tiers(c).has("Flagship") || tiers(c).has("Medium (70B)")), {
      category: "cost",
      label: "Cascade",
      points: 20,
    }),
    configIs("llm-gateway", "semanticCache", "Enabled", "Answer near-duplicate questions from a semantic cache.", "cost", 15),
    configIs("llm-gateway", "promptCaching", "Enabled", "Cache the shared system prompt.", "cost", 10),
    rule("Limit each user to 20,000 tokens per minute or less.", (c) => c.nodes("llm-gateway").some((g) => E.num(g.config.perUserTokensPerMinute) > 0 && E.num(g.config.perUserTokensPerMinute) <= 20000), {
      category: "Security",
      label: "Quotas",
    }),
    configIs("llm-gateway", "fallbackProvider", "Enabled", "Fail over to a second provider during outages.", "reliability", 10),
  ],
  reference: {
    config: [
      "LLM gateway: cascade routing, semantic cache, prompt caching, 10,000 tokens/min per user, fallback provider.",
      "Small (8B) on 2 x A100 handles most traffic; flagship on 8 x H100 handles escalations.",
    ],
    explanation: ["Paying flagship prices for easy questions is the biggest waste; a cascade pays them only when needed.", "Caches remove repeated work, quotas cap abuse, and a fallback provider removes a single point of failure."],
    graph: {
      nodes: [
        n("lb", "load-balancer", 40, 220, { healthChecks: "Enabled" }),
        n("app", "application-server", 260, 220, { size: "Medium", instances: 2 }),
        n("gateway", "llm-gateway", 500, 220, { routing: "Cascade (confidence gated)", semanticCache: "Enabled", promptCaching: "Enabled", perUserTokensPerMinute: 10000, fallbackProvider: "Enabled" }),
        n("small", "llm-inference-server", 740, 120, { modelTier: "Small (8B)", gpuType: "A100", gpuCount: 2, batchingMode: "Continuous batching", quantization: "FP8" }),
        n("big", "llm-inference-server", 740, 320, { modelTier: "Flagship", gpuType: "H100", gpuCount: 8, batchingMode: "Continuous batching", quantization: "FP8", prefixCaching: "Enabled" }),
      ],
      edges: w("lb>app>gateway>small", "gateway>big"),
    },
  },
};

/* ---------------- Quality Gates ---------------- */

const trustJudge: ProblemDef = {
  code: "LLM0006",
  slug: "can-we-trust-the-judge",
  title: "Can We Trust the Judge?",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Pinecastle changes its assistant's prompts several times a week, and one change last month quietly made answers worse for two weeks. The team now wants every change scored by an LLM judge before it ships, but nobody knows whether the judge agrees with humans, and judges are known to favor whichever answer comes first. Build a quality gate the team can actually trust.",
  guide: {
    title: "Release gate",
    description: "Every prompt or model change runs through an evaluation harness before versioned config reaches production.",
    flow: ["web-client", "eval-harness", "configuration-service", "application-server"],
    secondary: { title: "Judge model", flow: ["eval-harness", "llm-gateway", "llm-inference-server"] },
    notes: ["Cohen's kappa of 0.7 or more is substantial agreement with human raters."],
  },
  concepts: ["LLM-as-judge validation", "Regression gates"],
  reading: [{ title: "Quality gates learning path", description: "Review judge validation.", href: `${SEC(3)}#judges` }],
  components: ["web-client", "eval-harness", "configuration-service", "application-server", "llm-gateway", "llm-inference-server"],
  checks: [
    rule("Gate prompt and model changes through an evaluation harness before they're published.", (c) => c.path("eval-harness", "configuration-service"), { category: "validity", label: "Release path" }),
    rule("Score with an LLM judge whose agreement with human raters is a kappa of 0.7 or more.", (c) =>
      c.nodes("eval-harness").some((h) => E.str(h.config.judge) !== "Exact match" && E.num(h.config.humanAgreementKappa) >= 0.7), {
      category: "Quality",
      label: "Validated judge",
      points: 20,
    }),
    rule("Evaluate on a golden set of at least 500 examples.", (c) => c.nodes("eval-harness").some((h) => E.num(h.config.goldenSetSize) >= 500), { category: "Quality", label: "Golden set" }),
    configIs("eval-harness", "biasCorrection", "Enabled", "Correct for position bias by judging both orders.", "Quality", 10),
    rule("Block changes that regress quality by more than 2%.", (c) => c.nodes("eval-harness").some((h) => E.num(h.config.regressionGatePercent) > 0 && E.num(h.config.regressionGatePercent) <= 2), {
      category: "Release safety",
      label: "Regression gate",
      points: 15,
    }),
    configIs("eval-harness", "ciGate", "Enabled", "Run the gate automatically on every change.", "Release safety", 10),
  ],
  reference: {
    config: [
      "Changes -> evaluation harness (800-example golden set, large-model judge with kappa 0.78, position-bias correction, 2% regression gate, CI) -> versioned prompts pushed to the app.",
    ],
    explanation: ["An unvalidated judge is an opinion with a number attached. Measuring agreement with humans earns it trust.", "Bias correction and an automated gate make the score both fair and impossible to skip."],
    graph: {
      nodes: [
        n("dev", "web-client", 40, 200),
        n("ci", "eval-harness", 260, 200, { goldenSetSize: 800, judge: "Large model judge", humanAgreementKappa: 0.78, regressionGatePercent: 2, biasCorrection: "Enabled", ciGate: "Enabled" }),
        n("prompts", "configuration-service", 500, 200, { versioned: "Enabled", delivery: "Push on change" }),
        n("app", "application-server", 740, 200, { size: "Medium", instances: 2 }),
        n("gateway", "llm-gateway", 500, 380),
        n("llm", "llm-inference-server", 740, 380, { modelTier: "Flagship", gpuType: "H100", gpuCount: 4, batchingMode: "Continuous batching" }),
      ],
      edges: w("dev>ci>prompts>app>gateway>llm", "ci>gateway"),
    },
  },
};

/* ---------------- Agents That Take Action ---------------- */

const sandboxed = (c: Ctx) => c.nodes("tool-sandbox").some((t) => E.str(t.config.permissions) === "Scoped allowlist");
const stepLimit = (c: Ctx, max: number) => c.nodes("tool-sandbox").some((t) => E.num(t.config.maxSteps) > 0 && E.num(t.config.maxSteps) <= max);
const refundAgent: ProblemDef = {
  code: "LLM0007",
  slug: "the-agent-that-refunded-everything",
  title: "The Agent That Refunded Everything",
  difficulty: "Hard",
  minutes: 20,
  description:
    "Brannock's support agent can look up orders and issue refunds. A customer pasted instructions into a chat message, the agent followed them, and over one weekend it issued 400 refunds and looped for hours on some conversations. Keep the agent useful, but put real guardrails between the model and actions that move money.",
  guide: {
    title: "Guarded tool use",
    description: "Every tool call goes through a sandbox with an allowlist, step limits, human approval for money, and an audit trail.",
    flow: ["load-balancer", "application-server", "llm-gateway", "llm-inference-server"],
    secondary: { title: "Actions", flow: ["application-server", "tool-sandbox", "payment-gateway"] },
    notes: ["Treat anything the model read in a conversation as untrusted input."],
  },
  concepts: ["Agent guardrails", "Prompt injection"],
  reading: [{ title: "Agents learning path", description: "Review agent safety.", href: `${SEC(4)}#guardrails` }],
  components: ["web-client", "load-balancer", "application-server", "llm-gateway", "llm-inference-server", "tool-sandbox", "payment-gateway", "audit-log"],
  checks: [
    rule("Route every tool call through a tool sandbox.", (c) => c.path("application-server", "tool-sandbox") && !c.edge("application-server", "payment-gateway"), { category: "validity", label: "Sandboxed tools" }),
    rule("Allow only the specific tools and arguments the agent needs (scoped allowlist).", sandboxed, { category: "Security", label: "Least privilege", points: 20 }),
    configIs("tool-sandbox", "humanApproval", "Enabled", "Require human approval for actions that move money.", "Security", 15),
    rule("Stop runaway loops with a limit of 10 steps or fewer per task.", (c) => stepLimit(c, 10), { category: "Safety", label: "Step limit" }),
    rule("Record every tool call in an immutable audit log.", (c) => immutableAudit(c, "tool-sandbox"), { category: "Compliance", label: "Audit" }),
    configIs("payment-gateway", "idempotencyKeys", "Enabled", "Send idempotency keys so a retried refund can't pay out twice.", "Correctness", 10),
  ],
  reference: {
    config: [
      "Agent service -> LLM gateway -> model; tool calls -> sandbox (scoped allowlist, human approval for refunds, 8-step limit) -> orders API and payment gateway (idempotency keys).",
      "Every tool call is written to an immutable audit log.",
    ],
    explanation: ["The model decides what to try; the sandbox decides what's allowed. That split makes injected instructions far less dangerous.", "Human approval keeps money-moving actions behind a person, and step limits end loops early."],
    graph: {
      nodes: [
        n("web", "web-client", 40, 200),
        n("lb", "load-balancer", 240, 200, { healthChecks: "Enabled" }),
        n("agent", "application-server", 460, 200, { size: "Medium", instances: 2 }),
        n("gateway", "llm-gateway", 700, 80, { perUserTokensPerMinute: 20000 }),
        n("llm", "llm-inference-server", 940, 80, { modelTier: "Flagship", gpuType: "H100", gpuCount: 4, batchingMode: "Continuous batching" }),
        n("sandbox", "tool-sandbox", 700, 300, { permissions: "Scoped allowlist", humanApproval: "Enabled", maxSteps: 8 }),
        n("orders", "application-server", 940, 240, { size: "Small" }),
        n("psp", "payment-gateway", 940, 380, { idempotencyKeys: "Enabled" }),
        n("audit", "audit-log", 700, 460, { immutable: "Enabled" }),
      ],
      edges: w("web>lb>agent>gateway>llm", "agent>sandbox>orders", "sandbox>psp", "sandbox>audit"),
    },
  },
};

const agentPlatform: ProblemDef = {
  code: "LLM0008",
  slug: "agents-at-scale",
  title: "Agents at Scale",
  difficulty: "Hard",
  minutes: 25,
  description:
    "Ellanby is opening its research agent to every customer. Tasks take 20 to 200 steps and several minutes each, run thousands at a time, call internal tools, and occasionally crash mid-task. Some users try to run up huge bills, and when something goes wrong, engineers need to see exactly what the agent did. Design the platform that runs these agents.",
  guide: {
    title: "Agent platform",
    description: "Tasks are queued and executed by idempotent runners that keep durable state, call models through a gateway and tools through a sandbox.",
    flow: ["api-gateway", "application-server", "message-queue", "worker"],
    extra: [
      { title: "Model calls", flow: ["worker", "llm-gateway", "llm-inference-server"] },
      { title: "Tools and state", flow: ["worker", "tool-sandbox", "application-server"] },
      { title: "Traces", flow: ["worker", "telemetry-collector", "trace-store"] },
    ],
    notes: ["A multi-minute task can't live inside an HTTP request."],
  },
  concepts: ["Long-running agent execution", "Cost and safety controls", "Agent observability"],
  reading: [{ title: "Agents learning path", description: "Review agent platforms.", href: `${SEC(4)}#platforms` }],
  components: ["web-client", "api-gateway", "application-server", "message-queue", "worker", "postgresql", "llm-gateway", "llm-inference-server", "tool-sandbox", "telemetry-collector", "trace-store"],
  checks: [
    rule("Queue tasks and run them asynchronously on agent runners.", (c) => c.path("application-server", "message-queue", "worker"), { category: "Scalability", label: "Async execution", points: 15 }),
    rule("Persist task state after every step so a crashed task resumes.", (c) => c.nodes("worker").some((x) => E.outgoing(c.g, x.id).some((o) => o.type === "postgresql" || o.type === "dynamodb")), {
      category: "reliability",
      label: "Durable state",
    }),
    rule("Make runner steps idempotent so a resumed task doesn't repeat actions.", (c) => c.has("worker") && c.all("worker", "idempotent", "Enabled"), { category: "Correctness", label: "Idempotent steps" }),
    rule("Run tools through a sandbox with a scoped allowlist and at most 200 steps per task.", (c) => c.path("worker", "tool-sandbox") && sandboxed(c) && stepLimit(c, 200), {
      category: "Security",
      label: "Tool sandbox",
      points: 15,
    }),
    rule("Cap tokens per user and fail over to a second provider at the gateway.", (c) =>
      c.path("worker", "llm-gateway") && c.nodes("llm-gateway").some((g) => E.num(g.config.perUserTokensPerMinute) > 0 && E.str(g.config.fallbackProvider) === "Enabled"), {
      category: "cost",
      label: "Quotas and failover",
    }),
    rule("Trace agent runs, keeping every failed or slow run (tail sampling).", (c) => c.path("worker", "telemetry-collector", "trace-store") && c.is("trace-store", "tailSampling", "Enabled"), {
      category: "Visibility",
      label: "Traces",
    }),
  ],
  reference: {
    config: [
      "Gateway (JWT) -> task API -> queue (retries, DLQ) -> 10 idempotent agent runners that checkpoint state to PostgreSQL after each step.",
      "Runners call models via an LLM gateway (30,000 tokens/min per user, fallback provider, prompt caching) and tools via a sandbox (scoped allowlist, 150 steps).",
      "Runner traces go through a collector to a trace store with tail sampling.",
    ],
    explanation: [
      "Long tasks need durable, resumable execution: queue, checkpoint and retry, the same as any batch system.",
      "Quotas, sandboxes and traces are what make it safe to hand an agent to every customer.",
    ],
    graph: {
      nodes: [
        n("web", "web-client", 40, 240),
        n("gw", "api-gateway", 240, 240, { auth: "JWT" }),
        n("api", "application-server", 440, 240, { size: "Medium", instances: 2 }),
        n("q", "message-queue", 640, 240, { retry: "Enabled", maxRetries: 3, dlqEnabled: "Enabled", visibilityTimeoutSec: 900 }),
        n("runners", "worker", 860, 240, { instances: 10, idempotent: "Enabled" }),
        n("state", "postgresql", 860, 420, { size: "Medium" }),
        n("gateway", "llm-gateway", 1100, 100, { perUserTokensPerMinute: 30000, fallbackProvider: "Enabled", promptCaching: "Enabled" }),
        n("llm", "llm-inference-server", 1340, 100, { modelTier: "Flagship", gpuType: "H100", gpuCount: 8, batchingMode: "Continuous batching", prefixCaching: "Enabled" }),
        n("sandbox", "tool-sandbox", 1100, 260, { permissions: "Scoped allowlist", maxSteps: 150 }),
        n("tools", "application-server", 1340, 260, { size: "Small" }),
        n("collector", "telemetry-collector", 1100, 420),
        n("traces", "trace-store", 1340, 420, { tailSampling: "Enabled", samplingPercent: 10 }),
      ],
      edges: w("web>gw>api>q>runners>state", "runners>gateway>llm", "runners>sandbox>tools", "runners>collector>traces"),
    },
  },
};

export const LLM: ProblemDef[] = [ownDocs, hybrid, permissions, gpuBill, easyQuestions, trustJudge, refundAgent, agentPlatform];
