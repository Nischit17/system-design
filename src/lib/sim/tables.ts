/** Capacity + price tables used by the simulator. All prices are monthly USD. */

export const SIZE_TABLE: Record<string, { vcpu: number; ramGb: number; capacityRps: number; monthlyCostUsd: number }> = {
  Small: { vcpu: 4, ramGb: 8, capacityRps: 220, monthlyCostUsd: 180 },
  Medium: { vcpu: 8, ramGb: 16, capacityRps: 430, monthlyCostUsd: 330 },
  Large: { vcpu: 16, ramGb: 32, capacityRps: 800, monthlyCostUsd: 620 },
  XL: { vcpu: 32, ramGb: 64, capacityRps: 1350, monthlyCostUsd: 1120 },
  "2XL": { vcpu: 64, ramGb: 128, capacityRps: 1850, monthlyCostUsd: 2100 },
};

export const LOAD_BALANCER_CAPACITY_RPS = 10_000;
export const LOAD_BALANCER_MONTHLY_COST_USD = 180;

export const DB_SIZE_TABLE: Record<string, { readCapacityPerSec: number; writeCapacityPerSec: number; monthlyCostUsd: number }> = {
  Free: { readCapacityPerSec: 0, writeCapacityPerSec: 0, monthlyCostUsd: 0 },
  Small: { readCapacityPerSec: 6000, writeCapacityPerSec: 2500, monthlyCostUsd: 90 },
  Medium: { readCapacityPerSec: 18000, writeCapacityPerSec: 7000, monthlyCostUsd: 220 },
  Large: { readCapacityPerSec: 45000, writeCapacityPerSec: 16000, monthlyCostUsd: 480 },
  XL: { readCapacityPerSec: 90000, writeCapacityPerSec: 30000, monthlyCostUsd: 960 },
};

export const CACHE_SIZE_TABLE: Record<string, { opsPerSec: number; memoryGb: number; monthlyCostUsd: number }> = {
  Small: { opsPerSec: 25000, memoryGb: 4, monthlyCostUsd: 60 },
  Medium: { opsPerSec: 80000, memoryGb: 16, monthlyCostUsd: 160 },
  Large: { opsPerSec: 200000, memoryGb: 64, monthlyCostUsd: 420 },
  XL: { opsPerSec: 400000, memoryGb: 128, monthlyCostUsd: 800 },
};

export const KV_SIZE_TABLE: Record<string, { readCapacityPerSec: number; writeCapacityPerSec: number; monthlyCostUsd: number }> = {
  Small: { readCapacityPerSec: 10000, writeCapacityPerSec: 5000, monthlyCostUsd: 120 },
  Medium: { readCapacityPerSec: 40000, writeCapacityPerSec: 20000, monthlyCostUsd: 400 },
  Large: { readCapacityPerSec: 120000, writeCapacityPerSec: 60000, monthlyCostUsd: 1100 },
  XL: { readCapacityPerSec: 300000, writeCapacityPerSec: 150000, monthlyCostUsd: 2600 },
};

export const GPU_TABLE: Record<string, { samplesPerSec: number; tokensPerSec: number; monthlyCostUsd: number }> = {
  T4: { samplesPerSec: 120, tokensPerSec: 400, monthlyCostUsd: 260 },
  A100: { samplesPerSec: 600, tokensPerSec: 1800, monthlyCostUsd: 1900 },
  H100: { samplesPerSec: 1400, tokensPerSec: 3600, monthlyCostUsd: 3300 },
};

/** Flat monthly prices for components without a size table. */
export const FLAT_COST: Record<string, number> = {
  "web-client": 0,
  "mobile-client": 0,
  "load-balancer": LOAD_BALANCER_MONTHLY_COST_USD,
  "api-gateway": 90,
  cdn: 120,
  dns: 20,
  "rate-limiter": 40,
  "traffic-router": 60,
  "cell-router": 80,
  "waiting-room": 150,
  "payment-gateway": 0,
  "email-provider": 30,
  "push-provider": 25,
  "sms-provider": 60,
  "egress-proxy": 70,
  "llm-gateway": 120,
  "connection-pool": 40,
  "message-queue": 50,
  "pub-sub": 60,
  "labeling-queue": 0,
  "health-check": 0,
  "auto-scaling": 0,
  "multi-az": 150,
  backup: 45,
  "circuit-breaker": 0,
  "retry-policy": 0,
  bulkhead: 0,
  replica: 0,
  "availability-zone": 0,
  "disaster-recovery-region": 400,
  "upload-service": 90,
  "manifest-generator": 40,
  "presence-service": 120,
  "ranking-service": 220,
  "chunking-service": 120,
  "key-generator": 60,
  "edge-compute": 80,
  "job-scheduler": 60,
  "feature-flag-service": 50,
  "configuration-service": 40,
  "authz-service": 120,
  "notification-orchestrator": 120,
  "collaboration-engine": 300,
  "telemetry-collector": 80,
  "media-packager": 140,
  "model-registry": 50,
  "experiment-tracker": 60,
  "data-validator": 70,
  "embedding-service": 300,
  "eval-harness": 150,
  "tool-sandbox": 120,
  "search-indexer": 140,
  "object-storage": 25,
  "shared-filesystem": 300,
  "geo-index": 220,
  ledger: 300,
  "feature-store": 260,
  "dataset-store": 80,
  "vector-database": 280,
  "audit-log": 60,
  "log-store": 180,
  "metrics-store": 140,
  "trace-store": 120,
  "session-registry": 90,
  "graph-store": 250,
  "elasticsearch": 0,
  "search-index": 0,
};

export const WORKER_INSTANCE_COST_USD = 60;
export const IMAGE_PROCESSOR_INSTANCE_COST_USD = 90;
export const VIDEO_ENCODER_INSTANCE_COST_USD = 240;
export const TRANSCODER_INSTANCE_COST_USD = 200;
export const BATCH_INSTANCE_COST_USD = 70;
export const WEBSOCKET_INSTANCE_COST_USD = 150;
export const FEED_INSTANCE_COST_USD = 180;
export const SEARCH_INDEXER_INSTANCE_COST_USD = 140;
export const STREAM_PARTITION_COST_USD = 11;
export const OBJECT_STORE_PREFIX_RPS = 5500;
export const SERVERLESS_COST_PER_CONCURRENCY_USD = 4;
