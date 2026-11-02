import type { ProblemDef } from "../types";
import {
  budget,
  capacityAtLeast,
  column,
  cpuCeiling,
  dbBehindServers,
  fanIn,
  fanOut,
  fmt,
  healthChecksOn,
  ids,
  lbEntry,
  pct,
  rule,
  serversBehindLb,
  survivesServerLoss,
} from "../builders";
import * as E from "@/lib/sim/engine";

const SC = "/tracks/compute-traffic-foundations/sections/software-system-architecture-section-1";
const LB = "/tracks/compute-traffic-foundations/sections/software-system-architecture-section-2";
const ST = "/tracks/compute-traffic-foundations/sections/software-system-architecture-section-3";
const TIER = ["load-balancer", "application-server"];

/* ------------------------------------------------------------------ */
/* Section 1: Servers & Compute                                         */
/* ------------------------------------------------------------------ */

const flashSaleServers = column("app", "application-server", 3, 360, 170, { size: "Large" });
const flashSale: ProblemDef = {
  code: "SSA0001",
  slug: "flash-sale-sizing",
  title: "Flash Sale Sizing",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Tidewater Market is running a two-hour flash sale. Marketing forecasts 1,800 requests per second for the whole window, with short bursts up to 2,200 RPS when new deals drop. Build the application tier that sits between the internet and the existing PostgreSQL database. The database already has plenty of headroom and must stay as it is.",
  guide: {
    title: "Required request path",
    description:
      "Build the server-side path below. You decide how many application servers to run, which size they are, and how the load balancer spreads traffic.",
    flow: ["load-balancer", "application-server", "postgresql"],
    notes: [
      "The internet is implicit on the left of the canvas; you don't need a Web Client.",
      "PostgreSQL must be on the canvas, but its cost and capacity are outside this exercise.",
      "Only the load balancer, application servers and PostgreSQL are needed.",
    ],
  },
  concepts: ["Vertical vs. horizontal scaling", "Headroom and compute sizing", "Basic request distribution", "Cost vs. capacity"],
  reading: [
    {
      title: "Servers & Compute learning path",
      description: "Review headroom, server sizing, horizontal scaling and the cost of capacity.",
      href: `${SC}#throughput`,
    },
  ],
  components: ["load-balancer", "application-server", "postgresql"],
  sim: { sustainedRps: 1800, peakRps: 2200, cpuMaxPercent: 75, budgetMaxUsd: 2100, budgetTypes: TIER },
  checks: [
    capacityAtLeast(1800, "the sustained sale traffic"),
    cpuCeiling(1800, 75),
    capacityAtLeast(2200, "the deal-drop bursts"),
    lbEntry(),
    serversBehindLb(),
    dbBehindServers("postgresql"),
    budget(2100, "the load balancer and application servers", 15, TIER),
  ],
  reference: {
    config: [
      "Three Large application servers (800 RPS, $620/mo each) give 2,400 RPS of combined capacity.",
      "Round Robin is the right algorithm here: every server is the same size, so an even split is also a fair split.",
      "Cost: 3 x $620 + $180 for the load balancer = $2,040/month, under the $2,100 budget.",
    ],
    explanation: [
      "No single server can do this alone. Even the largest size tops out at about 1,850 RPS, below the sustained forecast.",
      "At 1,800 RPS each Large server receives 600 RPS: 600 / 800 = 75%, exactly at the CPU ceiling.",
      "During a 2,200 RPS burst each server takes about 733 RPS (92%). Bursts may exceed the sustained CPU target, but they stay inside real capacity.",
      "Cheaper-looking mixes fail one constraint or another: five Medium servers run at 84% CPU, and two XL servers blow the budget.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 170, config: { algorithm: "Round Robin", healthChecks: "Enabled" } },
        ...flashSaleServers,
        { id: "db", type: "postgresql", x: 660, y: 170 },
      ],
      edges: [...fanOut("lb", ids(flashSaleServers)), ...fanIn(ids(flashSaleServers), "db")],
    },
  },
  fix: {
    description:
      "Tidewater Market's API runs on a single XL application server connected to the existing PostgreSQL database. At today's 900 RPS it already sits at 67% CPU. Tomorrow's flash sale is forecast at 1,800 RPS sustained with bursts to 2,200 RPS. Repair the application tier before the sale starts. You may resize, replace or add servers and introduce a load balancer; the locked database must stay exactly as it is.",
    guideDescription:
      "Turn the direct server-to-database path into the path below. Keep the locked database and decide how to resize or grow the fleet.",
    notes: [
      "The internet is implicit; you don't need a Web Client.",
      "Keep the locked PostgreSQL node and connect every serving application server to it.",
      "You may keep, resize, duplicate, replace or remove the existing server.",
    ],
    starting: {
      nodes: [
        { id: "fx-app", type: "application-server", x: 100, y: 170, config: { size: "XL" } },
        { id: "fx-db", type: "postgresql", x: 460, y: 170, locked: true },
      ],
      edges: [{ source: "fx-app", target: "fx-db" }],
    },
    metrics: { rps: 900, appCpuPercent: 67, appMemoryPercent: 48, monthlyCostUsd: 1120 },
    reference: {
      config: [
        "Replace the XL server with three Large servers behind one Layer 7 load balancer using Round Robin.",
        "Keep every server connected directly to the locked PostgreSQL database.",
        "Cost: 3 x $620 + $180 = $2,040/month.",
      ],
    },
  },
};

const memoryServers = column("app", "application-server", 2, 360, 170, { size: "2XL" });
const memoryWall: ProblemDef = {
  code: "SSA0002",
  slug: "the-memory-wall",
  title: "The Memory Wall",
  difficulty: "Hard",
  minutes: 18,
  description:
    "Ledgerly's export service turns account history into PDF statements. It receives 5 export jobs per second; each job runs for 36 seconds on average and holds about 1,000 MB of memory until it finishes. CPU barely moves, but memory is local to each server and cannot be shared. Design the compute tier from scratch so no server runs out of memory, within budget.",
  guide: {
    title: "Required job path",
    description:
      "Build the compute path below. Pick server sizes and counts from what each job holds in memory, not from requests per second.",
    flow: ["load-balancer", "application-server"],
    notes: [
      "The job producer is implicit on the left; you don't need a Web Client.",
      "No database, cache or queue is needed for this exercise.",
      "Concurrency = arrival rate x time in system (Little's Law).",
    ],
  },
  concepts: ["CPU-bound vs. memory-bound workloads", "Concurrency and Little's Law", "Resource shape selection", "Cost per gigabyte"],
  reading: [
    {
      title: "Servers & Compute learning path",
      description: "Review Little's Law, memory-bound workloads and choosing server shapes.",
      href: `${SC}#memory`,
    },
  ],
  components: ["load-balancer", "application-server"],
  sim: {
    sustainedRps: 5,
    peakRps: 5,
    cpuMaxPercent: 80,
    budgetMaxUsd: 4500,
    budgetTypes: TIER,
    trafficUnit: "jobs/s",
    memory: { jobsPerSec: 5, avgJobDurationSec: 36, memoryPerJobMb: 1000, maxMemoryPercent: 80 },
  },
  checks: [
    lbEntry(),
    serversBehindLb(),
    capacityAtLeast(5, "the export rate", "jobs/s", 10),
    {
      text: "Keep every application server at or below 80% memory for 180 concurrent exports under the configured routing.",
      category: "Memory Capacity",
      label: "Memory Capacity",
      points: 35,
      test: (c) => c.topology().servers.length > 0 && c.memory().memoryUtilizationPercent <= 80,
      pass: (c) => `Peak memory use is ${pct(c.memory().memoryUtilizationPercent)} on the fullest server (${fmt(c.memory().demandGb)} GB of jobs in flight).`,
      fail: (c) => {
        const m = c.memory();
        if (!m.perServer.length) return "No server receives jobs.";
        const worst = m.perServer.reduce((a, b) => (b.memoryUtilizationPercent > a.memoryUtilizationPercent ? b : a));
        return `${worst.label} needs ${fmt(worst.demandGb)} GB but has ${fmt(worst.ramGb)} GB (${pct(worst.memoryUtilizationPercent)}).`;
      },
      fix: "Size by memory: 5 jobs/s x 36 s = 180 jobs in flight, each holding ~1 GB. Provision RAM for that with 20% headroom.",
    },
    budget(4500, "the load balancer and application servers", 15, TIER),
  ],
  reference: {
    config: [
      "Two 2XL servers (128 GB RAM, $2,100/mo each) behind a load balancer using Round Robin.",
      "Concurrency: 5 jobs/s x 36 s = 180 exports in flight. Memory: 180 x 1,000 MB / 1,024 = 175.8 GB.",
      "Cost: 2 x $2,100 + $180 = $4,380/month.",
    ],
    explanation: [
      "Throughput is not the problem: one Small server's rated throughput is far above 5 jobs per second.",
      "Memory is. 175.8 GB across 256 GB of RAM is 68.7%, comfortably under the 80% ceiling.",
      "2XL has the best memory-per-dollar in the size table. Seven Large servers would also fit, but cost $4,520 before the load balancer.",
      "Because both servers are identical, an even Round Robin split also splits memory evenly.",
    ],
    graph: {
      nodes: [{ id: "lb", type: "load-balancer", x: 60, y: 170, config: { algorithm: "Round Robin", healthChecks: "Enabled" } }, ...memoryServers],
      edges: fanOut("lb", ids(memoryServers)),
    },
  },
  fix: {
    description:
      "Ledgerly's export service runs on four Medium application servers behind a load balancer. CPU stays under 5%, yet servers keep crashing with out-of-memory errors and exports fail. Each job runs for 36 seconds on average and holds about 1,000 MB until it finishes; 5 jobs arrive every second. Repair the fleet by resizing, removing or adding servers and adjusting routing.",
    notes: [
      "Do not add a database, cache or queue; the failure is inside the compute fleet.",
      "Memory is local to each server; total RAM only helps if routing respects it.",
    ],
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 200, config: { algorithm: "Round Robin" } },
        ...column("fx-app", "application-server", 4, 360, 200, { size: "Medium" }, 100),
      ],
      edges: fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3", "fx-app-4"]),
    },
    metrics: { rps: 5, trafficUnit: "jobs/s", appCpuPercent: 4, appMemoryPercent: 100, monthlyCostUsd: 1500, errorRatePercent: 46 },
    reference: {
      config: [
        "Resize two servers to 2XL and remove the other two: 256 GB of RAM for 175.8 GB of in-flight jobs (68.7%).",
        "Round Robin is fine once the fleet is uniform. Cost: $4,380/month.",
      ],
    },
  },
};

const isoApi = column("api", "application-server", 5, 360, 160, { size: "Medium" }, 95);
const reportsVsRequests: ProblemDef = {
  code: "SSA0003",
  slug: "reports-vs-requests",
  title: "Reports vs. Requests",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Brightline's API serves 1,500 requests per second around the clock. Every night it must also render 360,000 usage reports within 30 minutes. When reports run on the API servers they add roughly 40 points of CPU and customers see timeouts. Design separate compute for interactive traffic and for batch work. Each worker instance renders 25 reports per second.",
  guide: {
    title: "API request path",
    description:
      "Build two independent paths: a right-sized application tier for interactive traffic, and a scheduler that triggers a dedicated worker pool.",
    flow: ["load-balancer", "application-server"],
    secondary: { title: "Batch job path", flow: ["job-scheduler", "worker"] },
    notes: [
      "The internet and the nightly trigger are implicit; you don't need a Web Client.",
      "Keep workers out of the load balancer's rotation.",
      "One worker instance renders 25 reports/second.",
    ],
  },
  concepts: ["Workload isolation", "Dedicated compute pools", "Interactive vs. background work"],
  reading: [
    {
      title: "Servers & Compute learning path",
      description: "Review workload isolation and sizing a batch pool against a deadline.",
      href: `${SC}#isolation`,
    },
  ],
  components: ["load-balancer", "application-server", "job-scheduler", "worker"],
  sim: {
    sustainedRps: 1500,
    peakRps: 1500,
    cpuMaxPercent: 75,
    budgetMaxUsd: 2400,
    isolation: {
      workerRatePerSec: 25,
      apiRequestsPerSec: 1500,
      batchLoadPercent: 40,
      maxUtilizationPercent: 75,
      batchTotalJobs: 360000,
      batchDeadlineMinutes: 30,
    },
  },
  checks: [
    lbEntry(),
    serversBehindLb(),
    capacityAtLeast(1500, "interactive traffic"),
    {
      text: "Keep every API server at or below 75% CPU while serving 1,500 RPS, including any batch work it runs.",
      category: "capacity",
      label: "API headroom",
      points: 15,
      test: (c) => {
        const iso = c.isolation();
        const t = c.load(1500, 75);
        return t.perServer.length > 0 && t.perServer.every((r) => r.cpuPercent + (iso.workerPoolSeparated ? 0 : 40) <= 75);
      },
      pass: "API servers stay inside the 75% CPU ceiling because batch work never lands on them.",
      fail: (c) =>
        c.isolation().workerPoolSeparated
          ? "The API fleet is too small for 1,500 RPS at 75% CPU."
          : "Reports still run on the API servers, adding ~40 points of CPU on top of interactive traffic.",
      fix: "Move batch work to a separate pool, then size the API fleet for interactive traffic alone.",
    },
    {
      text: "Use a job scheduler to trigger a dedicated worker pool that is separate from the API traffic path.",
      category: "Workload Isolation",
      label: "Workload Isolation",
      points: 20,
      test: (c) => c.isolation().workerPoolSeparated && c.edge("job-scheduler", "worker"),
      pass: "A scheduler triggers workers that never receive interactive traffic.",
      fail: "There is no scheduler-driven worker pool separate from the load balancer.",
      fix: "Add a Job Scheduler connected to Worker nodes, and keep the load balancer away from the workers.",
    },
    {
      text: "Provide enough worker throughput to finish 360,000 reports within 30 minutes.",
      category: "Workload Isolation",
      label: "Batch deadline",
      points: 15,
      test: (c) => c.isolation().batchDrainMinutes <= 30,
      pass: (c) => `The worker pool finishes the batch in ${fmt(c.isolation().batchDrainMinutes)} minutes.`,
      fail: (c) => `At ${fmt(c.isolation().workerRatePerSec)} reports/s the batch takes ${fmt(c.isolation().batchDrainMinutes)} minutes.`,
      fix: "360,000 reports in 30 minutes is 200 reports/s; at 25 per instance that is 8 worker instances.",
    },
    budget(2400, "the load balancer, application servers, scheduler and workers"),
  ],
  reference: {
    config: [
      "Five Medium API servers (2,150 RPS total) behind a Round Robin load balancer: 1,500 RPS is 70% CPU.",
      "A Job Scheduler triggers one Worker node with 8 instances: 8 x 25 = 200 reports/s, so the batch drains in 30 minutes.",
      "Cost: $1,650 servers + $180 LB + $60 scheduler + $480 workers = $2,370/month.",
    ],
    explanation: [
      "Isolation turns one hard problem into two easy ones: interactive traffic is sized by latency headroom, batch work by its deadline.",
      "Three Large servers would also carry the API traffic, but they push the total over budget once the workers are paid for.",
      "Workers have no path from the load balancer, so a slow night of reports can never steal API capacity.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 160, config: { healthChecks: "Enabled" } },
        ...isoApi,
        { id: "sched", type: "job-scheduler", x: 60, y: 560, config: { durability: "Durable store" } },
        { id: "workers", type: "worker", x: 360, y: 560, config: { instances: 8 } },
      ],
      edges: [...fanOut("lb", ids(isoApi)), { source: "sched", target: "workers" }],
    },
  },
  fix: {
    description:
      "Brightline runs its nightly report job directly on the API servers. Five Medium servers handle 1,500 RPS at about 70% CPU during the day, but at night the reports push them past 100% and customers time out. Repair the design so interactive traffic and batch work no longer compete, and the 360,000 reports still finish in 30 minutes. Each worker instance renders 25 reports per second.",
    notes: [
      "Keep the existing API path and add an independent path for batch execution.",
      "Workers must not receive traffic from the load balancer.",
    ],
    starting: {
      nodes: [{ id: "fx-lb", type: "load-balancer", x: 60, y: 160 }, ...column("fx-api", "application-server", 5, 360, 160, { size: "Medium" }, 95)],
      edges: fanOut("fx-lb", ["fx-api-1", "fx-api-2", "fx-api-3", "fx-api-4", "fx-api-5"]),
    },
    metrics: { rps: 1500, appCpuPercent: 110, monthlyCostUsd: 1830, p95Ms: 3400, errorRatePercent: 9 },
  },
};

/** Effective monthly price of an autoscaled fleet: base instances all month, extra instances for 4 peak hours a day. */
function autoscaledCost(c: import("@/lib/sim/evaluate").Ctx): number {
  const lb = c.nodes("load-balancer").length * 180;
  const servers = c.nodes("application-server");
  const scaler = c.first("auto-scaling");
  return (
    lb +
    servers.reduce((sum, s) => {
      const unit = E.nodeCostUsd({ ...s, config: { ...s.config, instances: 1 } });
      const base = E.instancesOf(s);
      const attached = scaler && E.linkedEitherWay(c.g, scaler.id, s.id);
      const max = attached ? Math.max(base, E.num(scaler.config.max, base)) : base;
      return sum + unit * base + unit * (max - base) * (4 / 24);
    }, 0)
  );
}
function peakCapacity(c: import("@/lib/sim/evaluate").Ctx): number {
  const scaler = c.first("auto-scaling");
  return c.topology().servers.reduce((sum, s) => {
    const per = E.serverCapacityRps({ ...s, config: { ...s.config, instances: 1 } });
    const attached = scaler && E.linkedEitherWay(c.g, scaler.id, s.id);
    const n = attached ? Math.max(E.instancesOf(s), E.num(scaler.config.max, 1)) : E.instancesOf(s);
    return sum + per * n;
  }, 0);
}

const payingForPeaks: ProblemDef = {
  code: "SSA0004",
  slug: "paying-for-peaks",
  title: "Paying for Peaks",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Quillbox, a note-taking app, serves about 600 RPS for twenty hours a day and 2,400 RPS during a four-hour evening rush. A fleet sized for the rush sits mostly idle the rest of the day. Design an application tier that stays under 75% CPU at both levels while keeping the effective monthly compute bill at or below $1,500. Scaled-out instances are billed only for the hours they run.",
  guide: {
    title: "Required request path",
    description:
      "Build a load-balanced tier whose always-on size covers the baseline, and let an autoscaling policy add instances for the evening rush.",
    flow: ["load-balancer", "application-server"],
    secondary: { title: "Scaling policy", flow: ["auto-scaling", "application-server"] },
    notes: [
      "The application server's Instances field is the always-on (minimum) fleet.",
      "The autoscaler's Max instances is the fleet size during the rush.",
      "Extra instances are billed for 4 of every 24 hours.",
    ],
  },
  concepts: ["Baseline vs. peak provisioning", "Capacity economics", "Autoscaling ranges"],
  reading: [
    {
      title: "Servers & Compute learning path",
      description: "Review baseline, peaks and bursts, and the cost of idle capacity.",
      href: `${SC}#bursts`,
    },
  ],
  components: ["load-balancer", "application-server", "auto-scaling"],
  sim: { sustainedRps: 600, peakRps: 600, cpuMaxPercent: 75, budgetMaxUsd: 1500, costFn: autoscaledCost },
  checks: [
    lbEntry(),
    serversBehindLb(),
    cpuCeiling(600, 75),
    {
      text: "Reach at least 3,200 RPS of capacity during the evening rush so 2,400 RPS stays at or below 75% CPU.",
      category: "capacity",
      label: "Rush capacity",
      points: 20,
      test: (c) => peakCapacity(c) >= 3200,
      pass: (c) => `At full scale the fleet provides ${fmt(peakCapacity(c))} RPS.`,
      fail: (c) => `At full scale the fleet provides only ${fmt(peakCapacity(c))} RPS; 2,400 RPS at 75% needs 3,200.`,
      fix: "Attach an Auto Scaling policy to the servers and raise its max until rush capacity reaches 3,200 RPS.",
    },
    {
      text: "Attach an autoscaling policy that scales on CPU utilization.",
      category: "quality",
      label: "Scaling policy",
      points: 10,
      test: (c) => c.edge("auto-scaling", "application-server") && c.is("auto-scaling", "metric", "CPU utilization"),
      pass: "An autoscaling policy watches CPU and resizes the fleet.",
      fail: "No CPU-based autoscaling policy is attached to the servers.",
      fix: "Add Auto Scaling, connect it to the application servers, and scale on CPU utilization.",
    },
    budget(1500, "the tier (base instances all month plus rush instances for 4 hours a day)"),
  ],
  reference: {
    config: [
      "One Large application server node with 1 instance always on (800 RPS: 600 RPS is 75% CPU).",
      "Auto Scaling on CPU utilization with min 1, max 4: 4 x 800 = 3,200 RPS during the rush.",
      "Effective cost: $180 LB + $620 base + 3 x $620 x 4/24 = $1,110/month.",
    ],
    explanation: [
      "A fixed fleet sized for the rush (four Large servers) costs $2,660/month and idles at 19% for twenty hours a day.",
      "Autoscaling pays for peak capacity only while the peak is happening.",
      "Medium servers also work (2 base, 8 max) at $1,170, but they leave less headroom per instance.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 170, config: { healthChecks: "Enabled" } },
        { id: "app", type: "application-server", x: 360, y: 170, config: { size: "Large", instances: 1 } },
        { id: "as", type: "auto-scaling", x: 360, y: 20, config: { metric: "CPU utilization", min: 1, max: 4, targetPercent: 70 } },
      ],
      edges: [
        { source: "lb", target: "app" },
        { source: "as", target: "app" },
      ],
    },
  },
  fix: {
    description:
      "Quillbox runs four Large servers around the clock so the 2,400 RPS evening rush stays healthy. For twenty hours a day traffic is only 600 RPS and the servers idle near 19% CPU, and finance wants the $2,660 bill cut to $1,500 or less. Repair the tier so both the baseline and the rush stay under 75% CPU at the lower cost.",
    notes: ["Instances on the application server node is the always-on fleet.", "Extra autoscaled instances are billed for 4 hours a day."],
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 170 },
        { id: "fx-app", type: "application-server", x: 360, y: 170, config: { size: "Large", instances: 4 } },
      ],
      edges: [{ source: "fx-lb", target: "fx-app" }],
    },
    metrics: { rps: 600, appCpuPercent: 19, monthlyCostUsd: 2660 },
  },
};

/* ------------------------------------------------------------------ */
/* Section 2: Load Balancers & Traffic Routing                          */
/* ------------------------------------------------------------------ */

const mixedFleetNodes = [
  { id: "xl-1", type: "application-server", x: 360, y: 20, config: { size: "XL", trafficWeight: 30 } },
  { id: "xl-2", type: "application-server", x: 360, y: 120, config: { size: "XL", trafficWeight: 30 } },
  { id: "md-1", type: "application-server", x: 360, y: 220, config: { size: "Medium", trafficWeight: 10 } },
  { id: "md-2", type: "application-server", x: 360, y: 320, config: { size: "Medium", trafficWeight: 10 } },
  { id: "md-3", type: "application-server", x: 360, y: 420, config: { size: "Medium", trafficWeight: 10 } },
];
const fleetIs = (c: import("@/lib/sim/evaluate").Ctx) => {
  const s = c.nodes("application-server");
  const xl = s.filter((n) => E.str(n.config.size) === "XL" && E.instancesOf(n) === 1).length;
  const md = s.filter((n) => E.str(n.config.size) === "Medium" && E.instancesOf(n) === 1).length;
  return s.length === 5 && xl === 2 && md === 3;
};
const mixedFleet: ProblemDef = {
  code: "SSA0005",
  slug: "mixed-hardware-fleet",
  title: "Mixed Hardware Fleet",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Fernway Travel already owns its servers: two XL machines and three Medium machines, and there is no budget for more. Search traffic averages 3,000 RPS. Put a load balancer in front of exactly this hardware and configure routing so no server runs above 80% CPU.",
  guide: {
    title: "Required request path",
    description: "Route traffic from one load balancer to the five purchased servers, then choose the algorithm and weights.",
    flow: ["load-balancer", "application-server"],
    notes: ["Use exactly two XL and three Medium application servers.", "Weights only matter with Weighted Round Robin."],
  },
  concepts: ["Weighted / capacity-aware routing", "Round Robin's blind spot"],
  reading: [{ title: "Load balancing learning path", description: "Review routing algorithms and weighted distribution.", href: `${LB}#weighted` }],
  components: ["load-balancer", "application-server"],
  sim: { sustainedRps: 3000, peakRps: 3000, cpuMaxPercent: 80 },
  checks: [
    lbEntry(),
    serversBehindLb(),
    rule("Use the purchased hardware: exactly two XL and three Medium application servers.", fleetIs, {
      category: "validity",
      label: "Fleet composition",
      pass: "The fleet matches the hardware Fernway already owns.",
      fail: "The fleet doesn't match the purchased hardware (two XL, three Medium, one instance each).",
      fix: "Keep exactly two XL and three Medium servers; this exercise is about routing, not buying.",
    }),
    capacityAtLeast(3000, "average search traffic"),
    cpuCeiling(3000, 80, "RPS", 25),
  ],
  reference: {
    config: [
      "Weighted Round Robin with weights 30, 30, 10, 10, 10 (roughly the 1,350 : 430 capacity ratio).",
      "Each XL server takes 1,000 RPS (74% CPU); each Medium takes 333 RPS (78%).",
      "Least Connections also works: it naturally sends more requests to servers that finish them faster.",
    ],
    explanation: [
      "Round Robin sends 600 RPS to every server. That is only 44% on an XL machine but 140% on a Medium one.",
      "Total capacity (3,990 RPS) was never the problem; the split was.",
      "Weights should follow capacity, not instance count. Weights don't need to add up to 100.",
    ],
    graph: {
      nodes: [{ id: "lb", type: "load-balancer", x: 60, y: 220, config: { algorithm: "Weighted Round Robin", healthChecks: "Enabled" } }, ...mixedFleetNodes],
      edges: fanOut("lb", ids(mixedFleetNodes)),
    },
  },
  fix: {
    description:
      "Fernway Travel's load balancer uses Round Robin across two XL and three Medium servers. At 3,000 RPS the Medium servers sit above 100% CPU and drop requests while the XL machines idle below half. The hardware is fixed. Repair the routing so every server stays at or below 80% CPU.",
    notes: ["The five servers are locked; only the load balancer can change."],
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 220, config: { algorithm: "Round Robin" } },
        ...mixedFleetNodes.map((n) => ({ ...n, id: `fx-${n.id}`, locked: true, config: { size: n.config.size } })),
      ],
      edges: fanOut("fx-lb", mixedFleetNodes.map((n) => `fx-${n.id}`)),
    },
    metrics: {
      rps: 3000,
      monthlyCostUsd: 3410,
      errorRatePercent: 12,
      perServer: [
        { label: "Application Server 3", cpuPercent: 140 },
        { label: "Application Server 1", cpuPercent: 44 },
      ],
    },
  },
};

const ghostServers = column("app", "application-server", 5, 360, 210, { size: "Large" }, 100);
const ghostServer: ProblemDef = {
  code: "SSA0006",
  slug: "ghost-server",
  title: "Ghost Server",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Pinecrest Bank's portal serves 2,000 RPS. Last month one application server froze and the load balancer kept sending it a quarter of all requests for forty minutes. Design a tier that keeps serving the full 2,000 RPS at or below 80% CPU even while its largest server is down, and routes around failed servers automatically.",
  guide: {
    title: "Required request path",
    description: "Build a load-balanced tier with enough spare capacity to lose its largest server, and make the load balancer notice failures.",
    flow: ["load-balancer", "application-server"],
    notes: ["Plan for N+1: the fleet minus its biggest server must still carry everything."],
  },
  concepts: ["Health checks", "Failover", "N+1 capacity"],
  reading: [{ title: "Load balancing learning path", description: "Review health checks and failover capacity.", href: `${LB}#health` }],
  components: ["load-balancer", "application-server", "health-check"],
  sim: { sustainedRps: 2000, peakRps: 2000, cpuMaxPercent: 80, failureTest: true, budgetMaxUsd: 3400 },
  checks: [
    lbEntry(),
    serversBehindLb(),
    cpuCeiling(2000, 80),
    healthChecksOn(),
    survivesServerLoss(2000, 80, 20),
    budget(3400, "the load balancer and application servers"),
  ],
  reference: {
    config: [
      "Five Large servers behind a load balancer with health checks enabled.",
      "Normal load: 400 RPS each (50%). With one down: 500 RPS each (62.5%).",
      "Cost: 5 x $620 + $180 = $3,280/month.",
    ],
    explanation: [
      "Four Large servers carry 2,000 RPS easily, but lose one and the rest run at 83%.",
      "Health checks are what turn spare capacity into availability: without them the frozen server keeps getting its share.",
      "Seven Medium servers are another valid answer ($2,490) with 77.5% CPU during a failure.",
    ],
    graph: {
      nodes: [{ id: "lb", type: "load-balancer", x: 60, y: 210, config: { healthChecks: "Enabled" } }, ...ghostServers],
      edges: fanOut("lb", ids(ghostServers)),
    },
  },
  fix: {
    description:
      "Pinecrest Bank runs four Large servers behind a load balancer with health checks turned off. When one server froze, the load balancer kept routing 25% of requests to it and customers saw errors for forty minutes. Repair the tier so it detects failures and still serves 2,000 RPS at or below 80% CPU with its largest server down.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 210, config: { healthChecks: "Disabled" } },
        ...column("fx-app", "application-server", 4, 360, 210, { size: "Large" }, 100),
      ],
      edges: fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3", "fx-app-4"]),
    },
    metrics: { rps: 2000, appCpuPercent: 63, monthlyCostUsd: 2660, errorRatePercent: 25 },
  },
};

const LONG_SKEW_RR = 1.35;
const LONG_SKEW_LC = 1.05;
const skewedWorst = (c: import("@/lib/sim/evaluate").Ctx) => {
  const t = c.load(1200, 80);
  if (!t.perServer.length) return Infinity;
  const entry = c.topology().entry;
  const skew = E.algorithmOf(entry) === "Least Connections" ? LONG_SKEW_LC : LONG_SKEW_RR;
  return Math.max(...t.perServer.map((r) => r.cpuPercent)) * skew;
};
const slowServers = column("app", "application-server", 4, 360, 170, { size: "Medium" }, 100);
const slowRequests: ProblemDef = {
  code: "SSA0007",
  slug: "slow-requests-even-split",
  title: "Slow Requests, Even Split",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Atlas Analytics serves 1,200 RPS. Nine in ten requests finish in about 50 ms, but one in ten builds a chart and takes around two seconds. With an even request split, chart requests pile up on whichever server is unlucky and that server spikes. Design the tier so the busiest server stays at or below 80% CPU within a $1,600 budget.",
  guide: {
    title: "Required request path",
    description: "Build a load-balanced tier and choose an algorithm that balances work in flight, not request counts.",
    flow: ["load-balancer", "application-server"],
    notes: ["Request count and actual work diverge when durations vary widely."],
  },
  concepts: ["Least-connections routing", "Request count vs. actual work"],
  reading: [{ title: "Load balancing learning path", description: "Review connection-aware algorithms.", href: `${LB}#connections` }],
  components: ["load-balancer", "application-server"],
  sim: { sustainedRps: 1200, peakRps: 1200, cpuMaxPercent: 80, budgetMaxUsd: 1600 },
  checks: [
    lbEntry(),
    serversBehindLb(),
    capacityAtLeast(1200, "average traffic"),
    {
      text: "Keep the busiest server at or below 80% CPU when one request in ten runs about forty times longer than the rest.",
      category: "capacity",
      label: "Busiest server",
      points: 25,
      test: (c) => skewedWorst(c) <= 80,
      pass: (c) => `With long requests in the mix, the busiest server peaks around ${pct(skewedWorst(c))}.`,
      fail: (c) => `Long requests cluster on one server, which peaks around ${pct(skewedWorst(c))}.`,
      fix: "Round Robin counts requests; Least Connections counts work in flight. Route on what actually loads the server.",
    },
    budget(1600, "the load balancer and application servers"),
  ],
  reference: {
    config: [
      "Four Medium servers (1,720 RPS) behind a load balancer using Least Connections.",
      "Average load is 300 RPS per server (70%); connection-aware routing keeps the busiest near 73%.",
      "Cost: 4 x $330 + $180 = $1,500/month.",
    ],
    explanation: [
      "Round Robin hands out requests in turn, so a server that just received two slow chart requests still gets its next turn.",
      "Least Connections sends the next request to whichever server has the fewest open connections, which tracks real work.",
      "Buying a fifth server to absorb the imbalance also works, but costs $1,830 and is over budget.",
    ],
    graph: {
      nodes: [{ id: "lb", type: "load-balancer", x: 60, y: 170, config: { algorithm: "Least Connections", healthChecks: "Enabled" } }, ...slowServers],
      edges: fanOut("lb", ids(slowServers)),
    },
  },
  fix: {
    description:
      "Atlas Analytics runs four Medium servers behind a Round Robin load balancer. Averages look fine at 70% CPU, but chart requests that take two seconds bunch up and push individual servers to 94%, and p99 latency has climbed past four seconds. Repair the tier so the busiest server stays at or below 80% CPU, within $1,600 a month.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 170, config: { algorithm: "Round Robin" } },
        ...column("fx-app", "application-server", 4, 360, 170, { size: "Medium" }, 100),
      ],
      edges: fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3", "fx-app-4"]),
    },
    metrics: { rps: 1200, appCpuPercent: 70, monthlyCostUsd: 1500, p99Ms: 4200, perServer: [{ label: "Application Server 2", cpuPercent: 94 }] },
  },
};

const pathCapacity = (c: import("@/lib/sim/evaluate").Ctx, path: string) =>
  c.topology().servers.filter((s) => E.str(s.config.servesPath) === path).reduce((sum, s) => sum + E.serverCapacityRps(s), 0);
const searchPool = column("search", "application-server", 3, 360, 110, { size: "Large", servesPath: "/search/*" }, 95);
const catalogPool = column("catalog", "application-server", 5, 660, 220, { size: "Medium", servesPath: "/catalog/*" }, 95);
const twoWorkloads: ProblemDef = {
  code: "SSA0008",
  slug: "two-workloads-one-door",
  title: "Two Workloads, One Door",
  difficulty: "Hard",
  minutes: 18,
  description:
    "Marigold's storefront has two very different endpoints behind one domain. /search/* receives 900 RPS and each request costs twice as much CPU as normal. /catalog/* receives 1,400 RPS of light reads. In a shared pool, search spikes slow down catalog pages. Give each path its own right-sized pool behind a single Layer 7 load balancer, at or below 75% CPU, within $3,800.",
  guide: {
    title: "Required request path",
    description: "Route by URL path at Layer 7 and size each pool for its own workload.",
    flow: ["load-balancer", "application-server"],
    notes: [
      "Set each server's Serves path field to /search/* or /catalog/*.",
      "Search costs 2 units of capacity per request: 900 RPS behaves like 1,800.",
    ],
  },
  concepts: ["Path-based (Layer 7) routing", "Per-route capacity planning"],
  reading: [{ title: "Load balancing learning path", description: "Review Layer 4 vs. Layer 7 and path routing.", href: `${LB}#paths` }],
  components: ["load-balancer", "application-server"],
  sim: { budgetMaxUsd: 3800 },
  checks: [
    lbEntry(),
    serversBehindLb(),
    rule("Use a Layer 7 load balancer with path-based routing enabled.", (c) => c.is("load-balancer", "layer", "Layer 7") && c.is("load-balancer", "pathRouting", "Enabled"), {
      label: "Path routing",
      pass: "The load balancer inspects URL paths and routes each prefix to its own pool.",
      fail: "The load balancer can't route by path (it needs Layer 7 with path-based routing on).",
      fix: "Set the load balancer to Layer 7 and enable path-based routing.",
    }),
    rule("Give /search/* its own pool with at least 2,400 RPS of capacity (1,800 effective RPS at 75%).", (c) => pathCapacity(c, "/search/*") >= 2400, {
      category: "capacity",
      label: "Search pool",
      points: 15,
      pass: (c) => `The search pool provides ${fmt(pathCapacity(c, "/search/*"))} RPS.`,
      fail: (c) => `The search pool provides ${fmt(pathCapacity(c, "/search/*"))} RPS; it needs 2,400.`,
      fix: "Size search for 900 x 2 = 1,800 effective RPS at 75%, which is 2,400 RPS of capacity.",
    }),
    rule("Give /catalog/* its own pool with at least 1,867 RPS of capacity (1,400 RPS at 75%).", (c) => pathCapacity(c, "/catalog/*") >= 1867, {
      category: "capacity",
      label: "Catalog pool",
      points: 15,
      pass: (c) => `The catalog pool provides ${fmt(pathCapacity(c, "/catalog/*"))} RPS.`,
      fail: (c) => `The catalog pool provides ${fmt(pathCapacity(c, "/catalog/*"))} RPS; it needs 1,867.`,
    }),
    rule("Keep every server dedicated to one path; no shared 'All paths' servers.", (c) => c.nodes("application-server").length > 0 && c.nodes("application-server").every((s) => E.str(s.config.servesPath) !== "All paths"), {
      label: "Pool isolation",
      pass: "No server mixes search and catalog traffic.",
      fail: "Some servers still accept every path, so search spikes can reach catalog capacity.",
    }),
    budget(3800, "the load balancer and both pools"),
  ],
  reference: {
    config: [
      "One Layer 7 load balancer with path routing: /search/* to three Large servers, /catalog/* to five Medium servers.",
      "Search: 1,800 effective RPS over 2,400 capacity = 75%. Catalog: 1,400 over 2,150 = 65%.",
      "Cost: $180 + 3 x $620 + 5 x $330 = $3,690/month.",
    ],
    explanation: [
      "Pools isolate failure and latency: a search surge saturates only the search pool.",
      "Each pool can use the size that is cheapest for its own load profile.",
      "A single shared pool big enough for both peaks would cost more and still let search hurt catalog latency.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 220, config: { layer: "Layer 7", pathRouting: "Enabled", healthChecks: "Enabled" } },
        ...searchPool,
        ...catalogPool,
      ],
      edges: [...fanOut("lb", ids(searchPool)), ...fanOut("lb", ids(catalogPool))],
    },
  },
  fix: {
    description:
      "Marigold runs six Large servers in one shared pool behind a Layer 7 load balancer without path routing. When search traffic surges, catalog pages slow to nearly a second, and the $3,900 bill is over the $3,800 budget. Repair the design so /search/* and /catalog/* each get their own right-sized pool.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 260, config: { layer: "Layer 7", pathRouting: "Disabled" } },
        ...column("fx-app", "application-server", 6, 360, 260, { size: "Large" }, 95),
      ],
      edges: fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3", "fx-app-4", "fx-app-5", "fx-app-6"]),
    },
    metrics: { rps: 2300, appCpuPercent: 67, monthlyCostUsd: 3900, p95Ms: 940 },
  },
};

/* ------------------------------------------------------------------ */
/* Section 3: Application State & Sessions                              */
/* ------------------------------------------------------------------ */

const stickyServers = column("app", "application-server", 4, 360, 170, { size: "Medium", sessionStorage: "Local memory" }, 100);
const loggedOut: ProblemDef = {
  code: "SSA0009",
  slug: "logged-out-on-every-click",
  title: "Logged Out on Every Click",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Cobalt Learning keeps login sessions in each application server's local memory, and security hasn't approved an external session store yet. Traffic is 1,000 RPS and one server is no longer enough. Scale the tier to at least two servers at or below 75% CPU, and make sure each user's later requests keep landing on the server that created their session.",
  guide: {
    title: "Required request path",
    description: "Build a load-balanced tier that keeps local session state and routes each client back to the same server.",
    flow: ["load-balancer", "application-server", "postgresql"],
    notes: ["Sessions must stay in local memory for now; no Redis.", "PostgreSQL already exists and is out of scope for sizing."],
  },
  concepts: ["Local state vs. shared state", "Session affinity"],
  reading: [{ title: "Sessions learning path", description: "Review where session state lives and sticky routing.", href: `${ST}#affinity` }],
  components: ["load-balancer", "application-server", "postgresql", "redis"],
  sim: { sustainedRps: 1000, peakRps: 1000, cpuMaxPercent: 75, budgetMaxUsd: 1700, budgetTypes: TIER },
  checks: [
    lbEntry(),
    serversBehindLb(),
    rule("Run at least two application servers.", (c) => c.topology().servers.length >= 2, {
      category: "capacity",
      label: "Scale out",
      pass: "The tier runs more than one server.",
      fail: "A single server is still a capacity ceiling and a single point of failure.",
    }),
    cpuCeiling(1000, 75),
    rule("Enable session affinity so each client returns to the server holding its session.", (c) => c.is("load-balancer", "sessionAffinity", "Enabled"), {
      label: "Session affinity",
      points: 15,
      pass: "Sticky sessions keep each user on the server that created their session.",
      fail: "Without affinity, a user's next request can land on a server that has never seen their session.",
      fix: "Turn on session affinity (sticky sessions) on the load balancer.",
    }),
    rule("Keep sessions in local memory: no external session store yet.", (c) => !c.has("redis") && c.all("application-server", "sessionStorage", "Local memory"), {
      category: "validity",
      label: "Local sessions",
      pass: "Sessions stay in each server's memory, as security requires for now.",
      fail: "The design uses an external session store or stateless servers, which isn't approved yet.",
    }),
    dbBehindServers("postgresql"),
    budget(1700, "the load balancer and application servers", 15, TIER),
  ],
  reference: {
    config: [
      "Two Large servers (1,600 RPS) with session state in local memory: 1,000 RPS is 62.5% CPU.",
      "Load balancer with session affinity enabled.",
      "Cost: 2 x $620 + $180 = $1,420/month.",
    ],
    explanation: [
      "Local sessions only work if the same server sees every request from a user. Round Robin breaks that on the second click.",
      "Session affinity pins each client to one backend, typically with a cookie set by the load balancer.",
      "Affinity fixes routing, not durability: if a server dies, the sessions in its memory die too. The next problem deals with that.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 170, config: { sessionAffinity: "Enabled", healthChecks: "Enabled" } },
        ...column("app", "application-server", 2, 360, 170, { size: "Large", sessionStorage: "Local memory" }, 120),
        { id: "db", type: "postgresql", x: 660, y: 170 },
      ],
      edges: [...fanOut("lb", ["app-1", "app-2"]), ...fanIn(["app-1", "app-2"], "db")],
    },
  },
  fix: {
    description:
      "Cobalt Learning added a load balancer and three Medium servers last week. Since then, two out of three clicks log users out: sessions live in each server's memory and Round Robin keeps sending users somewhere new. CPU is also tight at 78%. Repair the tier without adding an external session store.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 170, config: { algorithm: "Round Robin" } },
        ...column("fx-app", "application-server", 3, 360, 170, { size: "Medium", sessionStorage: "Local memory" }, 110),
        { id: "fx-db", type: "postgresql", x: 660, y: 170, locked: true },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3"]), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3"], "fx-db")],
    },
    metrics: { rps: 1000, appCpuPercent: 78, monthlyCostUsd: 1170, errorRatePercent: 66 },
  },
};
void stickyServers;

const sessionStore = (c: import("@/lib/sim/evaluate").Ctx) => c.nodes("redis").find((r) => E.str(r.config.usage) === "Session store");
const durableServers = column("app", "application-server", 4, 360, 170, { size: "Medium", sessionStorage: "Stateless" }, 100);
const stickyNotDurable: ProblemDef = {
  code: "SSA0010",
  slug: "sticky-isnt-durable",
  title: "Sticky Isn't Durable",
  difficulty: "Medium",
  minutes: 15,
  description:
    "Cobalt Learning's sticky sessions work until a server dies; then every user pinned to it is logged out at once. Security has now approved Redis as a session store. Redesign the 1,000 RPS tier so losing any single application server logs nobody out and the survivors stay at or below 80% CPU.",
  guide: {
    title: "Required request path",
    description: "Make the servers stateless, move sessions to a shared store, and keep N+1 capacity.",
    flow: ["load-balancer", "application-server", "redis"],
    notes: ["Set Redis to be used as a session store.", "A session store with no replica is its own single point of failure."],
  },
  concepts: ["Sticky-session limitations", "Durable vs. routing-only state"],
  reading: [{ title: "Sessions learning path", description: "Review shared session stores and their durability.", href: `${ST}#durability` }],
  components: ["load-balancer", "application-server", "redis", "postgresql"],
  sim: { sustainedRps: 1000, peakRps: 1000, cpuMaxPercent: 80, failureTest: true, budgetMaxUsd: 2100 },
  checks: [
    lbEntry(),
    serversBehindLb(),
    healthChecksOn(),
    survivesServerLoss(1000, 80),
    rule("Make every application server stateless.", (c) => c.all("application-server", "sessionStorage", "Stateless"), {
      category: "reliability",
      label: "Stateless servers",
      pass: "No session lives only in one server's memory.",
      fail: "Some servers still keep sessions in local memory.",
    }),
    rule("Store sessions in Redis (used as a session store) connected from every application server.", (c) => {
      const store = sessionStore(c);
      return !!store && c.topology().servers.length > 0 && c.topology().servers.every((s) => E.linked(c.g, s.id, store.id));
    }, {
      category: "reliability",
      label: "Shared session store",
      points: 15,
      pass: "Every server reads and writes sessions in one shared store.",
      fail: "There is no shared session store reachable from every server.",
      fix: "Add Redis, set 'Used as' to Session store, and connect every application server to it.",
    }),
    rule("Give the session store at least one replica.", (c) => E.num(sessionStore(c)?.config.replicas) >= 1, {
      category: "reliability",
      label: "Store redundancy",
      pass: "The session store has a replica, so it isn't a single point of failure.",
      fail: "The session store has no replica; losing it would log everyone out.",
    }),
    budget(2100, "the whole design"),
  ],
  reference: {
    config: [
      "Four stateless Medium servers behind a load balancer with health checks (1,720 RPS; 1,290 RPS with one down = 77.5%).",
      "Redis used as a session store with 1 replica, connected from every server.",
      "Cost: $1,320 servers + $180 LB + $120 Redis = $1,620/month.",
    ],
    explanation: [
      "Sticky routing decides where a request goes; it cannot keep a session alive when that server disappears.",
      "With sessions in a shared store, any server can handle any request, so affinity is no longer needed at all.",
      "A shared store is now critical infrastructure, so it needs its own redundancy.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 170, config: { healthChecks: "Enabled" } },
        ...durableServers,
        { id: "redis", type: "redis", x: 660, y: 120, config: { usage: "Session store", replicas: 1, ttlSeconds: 3600, evictionPolicy: "noeviction" } },
      ],
      edges: [...fanOut("lb", ids(durableServers)), ...fanIn(ids(durableServers), "redis")],
    },
  },
  fix: {
    description:
      "Cobalt Learning runs four Medium servers with sticky sessions and sessions in local memory. Yesterday one server crashed and a quarter of all users were logged out mid-lesson. Redis is now approved. Repair the design so a single server failure logs nobody out.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 170, config: { sessionAffinity: "Enabled", healthChecks: "Enabled" } },
        ...column("fx-app", "application-server", 4, 360, 170, { size: "Medium", sessionStorage: "Local memory" }, 100),
      ],
      edges: fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3", "fx-app-4"]),
    },
    metrics: { rps: 1000, appCpuPercent: 58, monthlyCostUsd: 1500, errorRatePercent: 25 },
  },
};

const LOGINS_PER_HOUR = 300_000;
const SESSION_KB = 4;
const TOTAL_USERS = 3_000_000;
const sessionMemoryGb = (ttlSeconds: number) => (Math.min(TOTAL_USERS, LOGINS_PER_HOUR * (ttlSeconds / 3600)) * SESSION_KB) / 1024 / 1024;
const storeUtil = (c: import("@/lib/sim/evaluate").Ctx) => {
  const s = sessionStore(c);
  if (!s) return Infinity;
  return (sessionMemoryGb(E.num(s.config.ttlSeconds, 300)) / E.cacheMemoryGb(s)) * 100;
};
const growingServers = column("app", "application-server", 3, 360, 150, { size: "Large", sessionStorage: "Stateless" }, 110);
const forgetfulStore: ProblemDef = {
  code: "SSA0011",
  slug: "the-session-store-keeps-forgetting",
  title: "The Session Store Keeps Forgetting",
  difficulty: "Hard",
  minutes: 18,
  description:
    "Cobalt Learning now handles 1,500 RPS with sessions in Redis. Product wants idle users to stay signed in for at least 8 hours. About 300,000 people sign in every hour, each session is roughly 4 KB, and there are 3 million accounts in total. Design the tier and a session store that never silently evicts a live session, survives a restart and a node failure, and stays at or below 80% memory.",
  guide: {
    title: "Required request path",
    description: "Size the application tier, then size the session store from login rate, TTL and session size.",
    flow: ["load-balancer", "application-server", "redis"],
    notes: [
      "Live sessions = min(total users, logins per hour x TTL hours).",
      "Eviction is fine for a cache, but evicting a session silently logs someone out.",
    ],
  },
  concepts: ["Session-store scaling", "Memory sizing from TTL"],
  reading: [{ title: "Sessions learning path", description: "Review session-store scaling and expiry.", href: `${ST}#scaling` }],
  components: ["load-balancer", "application-server", "redis"],
  sim: { sustainedRps: 1500, peakRps: 1500, cpuMaxPercent: 80, budgetMaxUsd: 2600 },
  checks: [
    lbEntry(),
    serversBehindLb(),
    cpuCeiling(1500, 80),
    rule("Store sessions in Redis (used as a session store) connected from every stateless application server.", (c) => {
      const store = sessionStore(c);
      return !!store && c.all("application-server", "sessionStorage", "Stateless") && c.topology().servers.every((s) => E.linked(c.g, s.id, store.id));
    }, { category: "reliability", label: "Shared session store", points: 10 }),
    rule("Keep idle sessions for at least 8 hours and at most 24 hours.", (c) => {
      const ttl = E.num(sessionStore(c)?.config.ttlSeconds, 0);
      return ttl >= 28800 && ttl <= 86400;
    }, {
      label: "Session TTL",
      pass: "Session TTL meets the 8-hour product requirement without keeping sessions forever.",
      fail: (c) => `Session TTL is ${fmt(E.num(sessionStore(c)?.config.ttlSeconds, 0))} seconds; it must be between 28,800 and 86,400.`,
    }),
    rule("Keep the session store at or below 80% memory at that TTL.", (c) => storeUtil(c) <= 80, {
      category: "capacity",
      label: "Store memory",
      points: 20,
      pass: (c) => `Live sessions use ${pct(storeUtil(c))} of the store's memory.`,
      fail: (c) => `Live sessions would need ${pct(storeUtil(c))} of the store's memory.`,
      fix: "At an 8-hour TTL: 2.4M live sessions x 4 KB = about 9.2 GB. Pick a size with room to spare.",
    }),
    rule("Never evict live sessions: use the noeviction policy.", (c) => E.str(sessionStore(c)?.config.evictionPolicy) === "noeviction", {
      category: "reliability",
      label: "No silent eviction",
      pass: "The store refuses writes instead of silently dropping a live session.",
      fail: "An LRU/LFU policy will quietly log out the least active users whenever memory fills.",
    }),
    rule("Persist sessions with an append-only file and keep at least one replica.", (c) => {
      const s = sessionStore(c);
      return E.str(s?.config.persistence) === "Append-only file" && E.num(s?.config.replicas) >= 1;
    }, { category: "reliability", label: "Durability", pass: "Sessions survive a restart and a node failure.", fail: "A restart or a node failure would wipe sessions." }),
    budget(2600, "the whole design"),
  ],
  reference: {
    config: [
      "Three Large stateless servers (2,400 RPS): 1,500 RPS is 62.5% CPU.",
      "Redis Medium (16 GB) used as a session store, TTL 28,800 s, noeviction, append-only file, 1 replica.",
      "Live sessions: 300,000/h x 8 h = 2.4M x 4 KB = 9.2 GB, 57% of 16 GB. Cost: $1,860 + $180 + $320 = $2,360.",
    ],
    explanation: [
      "TTL drives memory: longer sessions mean more live keys. At 24 hours every one of the 3 million users would be resident.",
      "A cache may evict; a session store must not. noeviction turns 'memory full' into a visible error instead of mystery logouts.",
      "Persistence covers restarts; the replica covers node loss.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 150, config: { healthChecks: "Enabled" } },
        ...growingServers,
        { id: "redis", type: "redis", x: 660, y: 150, config: { size: "Medium", usage: "Session store", ttlSeconds: 28800, evictionPolicy: "noeviction", persistence: "Append-only file", replicas: 1 } },
      ],
      edges: [...fanOut("lb", ids(growingServers)), ...fanIn(ids(growingServers), "redis")],
    },
  },
  fix: {
    description:
      "Cobalt Learning's session store is a Redis Small node with a 24-hour TTL and the default LRU eviction. Memory sits at 100% and Redis evicts sessions all day, so users are randomly signed out; a restart last week logged out everyone. Product needs idle sessions to last at least 8 hours. Repair the session tier.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 150, config: { healthChecks: "Enabled" } },
        ...column("fx-app", "application-server", 3, 360, 150, { size: "Large", sessionStorage: "Stateless" }, 110),
        { id: "fx-redis", type: "redis", x: 660, y: 150, config: { size: "Small", usage: "Session store", ttlSeconds: 86400 } },
      ],
      edges: [...fanOut("fx-lb", ["fx-app-1", "fx-app-2", "fx-app-3"]), ...fanIn(["fx-app-1", "fx-app-2", "fx-app-3"], "fx-redis")],
    },
    metrics: { rps: 1500, appCpuPercent: 63, monthlyCostUsd: 2100, errorRatePercent: 7 },
  },
};

const CONNECTIONS = 400_000;
const gatewayUtil = (c: import("@/lib/sim/evaluate").Ctx, lose = 0) => {
  const gws = c.nodes("websocket-gateway").filter((g) => c.nodes("load-balancer").some((lb) => E.linked(c.g, lb.id, g.id)));
  const instances = gws.reduce((s, g) => s + E.instancesOf(g), 0) - lose;
  return instances > 0 ? (CONNECTIONS / (instances * E.GATEWAY_CONNECTIONS_PER_INSTANCE)) * 100 : Infinity;
};
const socketsThatStick: ProblemDef = {
  code: "SSA0012",
  slug: "sockets-that-stick",
  title: "Sockets That Stick",
  difficulty: "Hard",
  minutes: 18,
  description:
    "Relay, a team chat app, holds 400,000 concurrent WebSocket connections. Any backend service must be able to push a message to a specific user no matter which gateway instance holds that user's socket. Each gateway instance safely holds 50,000 connections. Design the realtime tier so gateways stay at or below 70% of connection capacity, reconnects after losing one instance stay at or below 85%, and any service can find any socket.",
  guide: {
    title: "Required connection path",
    description: "Put gateways behind a load balancer and give them a shared registry of which gateway holds which user.",
    flow: ["load-balancer", "websocket-gateway", "redis"],
    notes: ["One gateway instance = 50,000 connections.", "Use Redis as a connection registry."],
  },
  concepts: ["Ephemeral vs. shared connection state", "Connection registries"],
  reading: [{ title: "Sessions learning path", description: "Review stateful connections and registries.", href: `${ST}#websockets` }],
  components: ["load-balancer", "websocket-gateway", "redis", "application-server"],
  sim: { budgetMaxUsd: 2200 },
  checks: [
    rule("Put WebSocket gateways behind a load balancer.", (c) => c.edge("load-balancer", "websocket-gateway"), { label: "Entry point" }),
    rule("Keep gateways at or below 70% of connection capacity.", (c) => gatewayUtil(c) <= 70, {
      category: "capacity",
      label: "Connection capacity",
      points: 20,
      pass: (c) => `Gateways run at ${pct(gatewayUtil(c))} of connection capacity.`,
      fail: (c) => `Gateways would run at ${pct(gatewayUtil(c))} of connection capacity.`,
      fix: "400,000 connections at 70% need 571,429 slots: 12 instances of 50,000.",
    }),
    rule("After losing one gateway instance, keep survivors at or below 85% as clients reconnect.", (c) => gatewayUtil(c, 1) <= 85, {
      category: "reliability",
      label: "Instance loss",
      points: 15,
      pass: (c) => `After a failure, survivors absorb reconnects at ${pct(gatewayUtil(c, 1))}.`,
      fail: (c) => `After a failure, survivors would reach ${pct(gatewayUtil(c, 1))}.`,
    }),
    rule("Register every connection in Redis (used as a connection registry) and set gateways to use the shared registry.", (c) => {
      const reg = c.nodes("redis").find((r) => E.str(r.config.usage) === "Connection registry");
      return !!reg && c.all("websocket-gateway", "connectionState", "Shared registry") && c.nodes("websocket-gateway").every((g) => E.linked(c.g, g.id, reg.id));
    }, {
      category: "quality",
      label: "Connection registry",
      points: 20,
      pass: "Any service can look up which gateway holds a user's socket.",
      fail: "Gateways only know about their own sockets, so other services can't reach most users.",
      fix: "Add Redis used as a connection registry, connect every gateway to it, and switch gateways to Shared registry.",
    }),
    budget(2200, "the realtime tier"),
  ],
  reference: {
    config: [
      "One gateway node with 12 instances (600,000 slots): 400,000 connections = 66.7%.",
      "Losing one instance leaves 550,000 slots: 72.7% after reconnects.",
      "Redis Small as a connection registry. Cost: $1,800 gateways + $180 LB + $60 Redis = $2,040/month.",
    ],
    explanation: [
      "A socket lives on exactly one gateway. Without a registry, a service has to broadcast to every gateway to reach one user.",
      "The registry maps user -> gateway, so a push is one lookup and one targeted send.",
      "Connections are ephemeral; when a gateway dies its clients reconnect elsewhere and re-register.",
    ],
    graph: {
      nodes: [
        { id: "lb", type: "load-balancer", x: 60, y: 160, config: { healthChecks: "Enabled" } },
        { id: "gw", type: "websocket-gateway", x: 360, y: 160, config: { instances: 12, connectionState: "Shared registry" } },
        { id: "reg", type: "redis", x: 660, y: 160, config: { usage: "Connection registry", ttlSeconds: 120 } },
      ],
      edges: [
        { source: "lb", target: "gw" },
        { source: "gw", target: "reg" },
      ],
    },
  },
  fix: {
    description:
      "Relay's 400,000 WebSocket connections run on 9 gateway instances that only track their own sockets. Messages to users on other gateways are silently dropped, and a single instance failure pushes the rest past 100%. Repair the realtime tier. Each instance safely holds 50,000 connections.",
    starting: {
      nodes: [
        { id: "fx-lb", type: "load-balancer", x: 60, y: 160 },
        { id: "fx-gw", type: "websocket-gateway", x: 360, y: 160, config: { instances: 9, connectionState: "Local only" } },
      ],
      edges: [{ source: "fx-lb", target: "fx-gw" }],
    },
    metrics: { rps: 400000, trafficUnit: "connections", monthlyCostUsd: 1530, errorRatePercent: 88 },
  },
};

export const COMPUTE_TRAFFIC: ProblemDef[] = [
  flashSale,
  memoryWall,
  reportsVsRequests,
  payingForPeaks,
  mixedFleet,
  ghostServer,
  slowRequests,
  twoWorkloads,
  loggedOut,
  stickyNotDurable,
  forgetfulStore,
  socketsThatStick,
];
