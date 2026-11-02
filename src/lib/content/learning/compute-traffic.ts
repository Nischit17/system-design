import type { Guide } from "./types";

export const SERVERS_GUIDE: Guide = {
  sectionId: "software-system-architecture-section-1",
  kicker: "Section 01 · Foundation",
  title: "Servers & Compute",
  intro:
    "How a stream of requests turns into a number of machines. This guide starts with what a server actually does, then builds the arithmetic engineers use to size a compute tier: throughput, headroom, concurrency, memory, isolation and cost.",
  byTheEnd: "You can justify every number in a compute design, find the real bottleneck instead of the obvious one, and reject designs that only look right on a diagram.",
  chapters: [
    {
      id: "server",
      kicker: "Before we scale anything",
      title: "What a server is (and isn't)",
      navTitle: "What Is a Server?",
      summary: "Clients, servers and instances, without the jargon.",
      intro: [
        "A server is any computer that answers requests from other computers. The word is used for the machine and for the program running on it; context usually tells you which.",
        "A client sends a request, the server does some work, and a response comes back. Browsers, mobile apps and other services are all clients.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Client", sub: "Browser or app", tone: "info" },
            { label: "Network", sub: "Request travels", tone: "neutral" },
            { label: "Server", sub: "Does the work", tone: "success" },
          ],
          caption: "Every interaction is a request out and a response back. Capacity planning is about how many of those a fleet can finish per second.",
        },
        {
          type: "key",
          text: "Production servers are not magical hardware. They are ordinary machines, usually virtual, that are expected to answer a predictable volume of requests all day.",
        },
        { type: "h3", text: "Physical, virtual and cloud" },
        {
          type: "p",
          text: "Most infrastructure runs on virtual machines: slices of a physical host with their own CPU, memory and disk. In this course, \"server\" simply means one unit of compute capacity; the sizing math is the same either way.",
        },
        {
          type: "terms",
          items: [
            ["Instance", "One running copy of a server. Two instances of the same app share nothing but the code."],
            ["Fleet", "All the instances that perform the same role. Fleets can be uniform or mixed in size."],
            ["Throughput", "Work finished per unit of time: requests per second (RPS) or jobs per second."],
            ["Latency", "How long one request takes from start to finish."],
            ["Stateless", "A service that keeps no per-user state only in its own memory, so any instance can serve any request."],
            ["Headroom", "Capacity deliberately left unused so spikes and failures don't push a server over the edge."],
          ],
        },
      ],
    },
    {
      id: "throughput",
      kicker: "Three numbers that get confused",
      title: "Throughput, latency and concurrency",
      navTitle: "Throughput, Latency & Concurrency",
      summary: "RPS, response time, and why in-flight work is its own number.",
      intro: [
        "Throughput is how many requests finish per second. Latency is how long each one takes. Concurrency is how many are in progress at the same instant. They are related, but improving one does not automatically improve the others.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Throughput", tone: "info", points: ["Volume per second", "Limited by CPU, I/O, locks", "What capacity tables quote"] },
            { title: "Latency", tone: "warning", points: ["Time per request", "Grows sharply near saturation", "What users feel"] },
            { title: "Concurrency", tone: "success", points: ["Requests in flight", "Equals throughput x latency", "Drives memory use"] },
          ],
          caption: "The same fleet can have healthy throughput and terrible latency if it runs too close to its limit.",
        },
        {
          type: "bars",
          items: [
            { label: "50% utilization", value: 44, max: 400, tone: "success", note: "fast" },
            { label: "75% utilization", value: 88, max: 400, tone: "success" },
            { label: "90% utilization", value: 220, max: 400, tone: "warning" },
            { label: "97% utilization", value: 380, max: 400, tone: "danger", note: "queues form" },
          ],
          unit: " ms",
          caption: "Response time stays flat until a server is nearly saturated, then climbs steeply as requests start waiting in line.",
        },
        {
          type: "key",
          text: "Latency is non-linear in utilization. That is the entire reason headroom exists: the last 20% of a server's capacity is where response times fall apart.",
        },
      ],
    },
    {
      id: "headroom",
      kicker: "Rated vs. usable",
      title: "Capacity and headroom",
      navTitle: "Server Capacity & Headroom",
      summary: "Why you plan to 70-80% of a server, not 100%.",
      intro: [
        "A server's rated capacity is the most it can do in a load test. Its usable capacity is what you can safely run every day while still absorbing spikes, deploys and the loss of a neighbour.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Size", "Rated capacity", "Usable at 75%", "Monthly cost"],
          rows: [
            ["Small", "220 RPS", "165 RPS", "$180"],
            ["Medium", "430 RPS", "323 RPS", "$330"],
            ["Large", "800 RPS", "600 RPS", "$620"],
            ["XL", "1,350 RPS", "1,013 RPS", "$1,120"],
            ["2XL", "1,850 RPS", "1,388 RPS", "$2,100"],
          ],
          caption: "The size table used throughout the labs.",
        },
        {
          type: "warn",
          text: "Sizing to 100% of rated capacity means the first traffic spike or failed instance turns into errors. A design that only works at exactly the forecast isn't finished.",
        },
      ],
    },
    {
      id: "planning",
      kicker: "The core formula",
      title: "Capacity planning",
      navTitle: "Capacity Planning",
      summary: "The sizing formula, plus an interactive calculator.",
      intro: ["Every compute sizing exercise reduces to one line of arithmetic, applied to the right peak and the right target utilization."],
      blocks: [
        {
          type: "formula",
          lines: ["servers = ceil( peak load / (capacity per server x target utilization) )", "provision = servers + spares for failures (N+1, N+2 ...)"],
          caption: "Always round up. Half a server is a whole server.",
        },
        { type: "widget", name: "capacity-calculator", caption: "Try the flash-sale numbers: 1,800 RPS on Large servers at a 75% target." },
        {
          type: "p",
          text: "Two designs with the same total capacity can behave very differently. Three Large servers and one 2XL plus one Medium both reach about 2,300 RPS, but the second only works if traffic is split in proportion to capacity.",
        },
      ],
    },
    {
      id: "scaling",
      kicker: "Up or out",
      title: "Vertical vs. horizontal scaling",
      navTitle: "Vertical vs. Horizontal Scaling",
      summary: "Bigger machines vs. more machines, and when each wins.",
      intro: [
        "Vertical scaling means moving to a bigger machine. Horizontal scaling means adding more machines behind a load balancer. Vertical is simpler; horizontal is the only option once one machine is not enough, and the only one that survives a machine failure.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Scale up", tone: "info", points: ["No load balancer needed", "Hard ceiling at the largest size", "Single point of failure"] },
            { title: "Scale out", tone: "success", points: ["Near-linear capacity growth", "Survives losing one node", "Needs stateless servers and routing"] },
          ],
          caption: "Most production tiers scale out, then pick the instance size with the best price for the job.",
        },
        { type: "key", text: "If even the largest server can't carry the peak, the decision is already made: you need a load balancer and more than one server." },
      ],
    },
    {
      id: "balancing",
      kicker: "Who gets the next request",
      title: "Load balancing and distribution",
      navTitle: "Load Balancing & Distribution",
      summary: "Routing algorithms, with an interactive demo.",
      intro: [
        "A load balancer decides which server receives each request. Round Robin takes turns. Weighted Round Robin takes turns in proportion to weights you set. Least Connections sends work to whichever server is least busy right now.",
      ],
      blocks: [
        { type: "widget", name: "lb-demo", caption: "With a mixed fleet, an even split overloads the small server long before the large ones are busy." },
        {
          type: "table",
          head: ["Algorithm", "Splits by", "Good for"],
          rows: [
            ["Round Robin", "Turns", "Identical servers, uniform requests"],
            ["Weighted Round Robin", "Configured weights", "Known, unequal server sizes"],
            ["Least Connections", "Work in flight", "Variable request durations"],
          ],
        },
      ],
    },
    {
      id: "memory",
      kicker: "Little's Law",
      title: "Concurrency and memory sizing",
      navTitle: "Concurrency & Memory Sizing",
      summary: "Little's Law and why memory is local to each server.",
      intro: [
        "Some workloads barely touch the CPU but hold a lot of memory while they run: rendering, exports, media processing. For these, the limit is how many jobs are in flight at once, and that number comes from Little's Law.",
      ],
      blocks: [
        { type: "formula", lines: ["in flight = arrival rate x time in system   (L = λ x W)", "memory needed = in flight x memory per job"] },
        { type: "widget", name: "littles-law", caption: "5 jobs per second that each run for 36 seconds means 180 jobs in memory at any moment." },
        {
          type: "warn",
          text: "Adding up RAM across the fleet is not enough. Memory belongs to each server, so routing must send each server a share of jobs it can actually hold.",
        },
      ],
    },
    {
      id: "isolation",
      kicker: "Don't let batch work steal from users",
      title: "Workload isolation",
      navTitle: "Workload Isolation",
      summary: "Separating interactive traffic from background batch work.",
      intro: [
        "Interactive requests need low latency; batch jobs need to finish by a deadline. When both share the same servers, a heavy batch run eats the headroom customers depend on.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Load balancer", tone: "warning" },
            { label: "API servers", sub: "Sized for latency", tone: "info" },
          ],
          caption: "The interactive path is sized for peak traffic plus headroom.",
        },
        {
          type: "flow",
          steps: [
            { label: "Scheduler", tone: "accent" },
            { label: "Worker pool", sub: "Sized for the deadline", tone: "success" },
          ],
          caption: "The batch path is sized so the backlog clears in time, and never touches API capacity.",
        },
        { type: "formula", lines: ["workers = ceil( total jobs / (deadline seconds x jobs per worker per second) )"] },
      ],
    },
    {
      id: "bursts",
      kicker: "Quiet hours and rush hours",
      title: "Baseline, peaks and bursts",
      navTitle: "Baseline, Peaks & Bursts",
      summary: "Paying for peak capacity only while the peak lasts.",
      intro: [
        "Traffic is rarely flat. A fleet sized for the evening rush idles most of the day. Autoscaling keeps a small always-on baseline and adds instances when utilization climbs, so you pay for peak capacity only during the peak.",
      ],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "Fixed fleet sized for peak", value: 2660, max: 3000, tone: "danger" },
            { label: "Baseline + autoscaled rush", value: 1110, max: 3000, tone: "success" },
          ],
          unit: " $/mo",
          caption: "Same peak capacity, very different bill.",
        },
        { type: "key", text: "Scale-out is not instant. New instances need time to start, so the baseline must cover the ramp until they arrive." },
      ],
    },
    {
      id: "cost",
      kicker: "The cheapest design that still passes",
      title: "Cost vs. capacity",
      navTitle: "Cost vs. Capacity",
      summary: "Picking the cheapest mix that meets every constraint.",
      intro: [
        "Once a design meets its capacity and reliability targets, cost becomes the tie-breaker. Compare price per unit of the resource that actually limits you: per RPS for CPU-bound work, per GB for memory-bound work.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Size", "$ per RPS", "$ per GB RAM"],
          rows: [
            ["Small", "0.82", "22.5"],
            ["Medium", "0.77", "20.6"],
            ["Large", "0.78", "19.4"],
            ["XL", "0.83", "17.5"],
            ["2XL", "1.14", "16.4"],
          ],
          caption: "Mid sizes are cheapest per request; the largest size is cheapest per gigabyte.",
        },
        {
          type: "list",
          ordered: true,
          items: [
            "Find the binding constraint (CPU, memory, connections, deadline).",
            "Size for the peak with headroom and the required spares.",
            "Compare a few mixes by total monthly cost.",
            "Check that routing can actually use the capacity you bought.",
          ],
        },
      ],
    },
  ],
};

export const LOAD_BALANCING_GUIDE: Guide = {
  sectionId: "software-system-architecture-section-2",
  kicker: "Section 02 · Foundation",
  title: "Load Balancers & Traffic Routing",
  intro:
    "As soon as a tier has more than one server, something has to decide where each request goes. This guide covers what a load balancer actually does, the routing algorithms and their blind spots, health checks and failover, and routing by path so each workload gets the capacity it needs.",
  byTheEnd: "You can pick a routing algorithm for a given fleet and workload, size a tier that survives losing a server, and split traffic by route without starving either side.",
  chapters: [
    {
      id: "role",
      kicker: "One address, many servers",
      title: "What a load balancer does",
      navTitle: "What a Load Balancer Does",
      summary: "The front door of a scaled-out tier, and the two layers it can work at.",
      intro: [
        "Clients talk to one stable address. Behind it, the load balancer keeps a pool of servers, picks one for each request or connection, and quietly stops using servers that stop answering.",
        "That makes it the place where traffic policy lives: how requests are spread, which servers count as healthy, and which paths go to which pool.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Clients", sub: "One address", tone: "info" },
            { label: "Load balancer", sub: "Picks a target", tone: "warning" },
            { label: "Server pool", sub: "Any healthy server", tone: "success" },
          ],
          caption: "Clients never learn how many servers exist. The pool can grow, shrink or lose a member without anyone noticing.",
        },
        {
          type: "compare",
          items: [
            { title: "Layer 4", tone: "info", points: ["Routes TCP/UDP connections", "Sees addresses and ports only", "Very fast, protocol-agnostic"] },
            { title: "Layer 7", tone: "accent", points: ["Routes individual HTTP requests", "Sees paths, headers and cookies", "Enables path routing and affinity"] },
          ],
          caption: "Most web tiers use Layer 7. Long-lived connections such as WebSockets often sit behind Layer 4.",
        },
        {
          type: "terms",
          items: [
            ["Target pool", "The set of servers a load balancer may send traffic to."],
            ["Health check", "A periodic probe that decides whether a server stays in the pool."],
            ["Algorithm", "The rule that picks the next target: turns, weights or current load."],
            ["Session affinity", "Pinning a client to the same server, usually with a cookie."],
          ],
        },
      ],
    },
    {
      id: "round-robin",
      kicker: "Taking turns",
      title: "Round Robin and its blind spot",
      navTitle: "Round Robin's Blind Spot",
      summary: "Equal turns work only when servers and requests are equal.",
      intro: [
        "Round Robin hands each new request to the next server in the list. With identical servers and similar requests it spreads load perfectly, and it needs no knowledge of the servers at all.",
        "That ignorance is also the problem. In a mixed fleet every server gets the same share, so the smallest machine saturates long before the large ones are busy.",
      ],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "XL server 1 (1,350 RPS)", value: 30, max: 100, tone: "success", note: "400 RPS" },
            { label: "XL server 2 (1,350 RPS)", value: 30, max: 100, tone: "success", note: "400 RPS" },
            { label: "Medium server 1 (430 RPS)", value: 93, max: 100, tone: "danger", note: "400 RPS" },
            { label: "Medium server 2 (430 RPS)", value: 93, max: 100, tone: "danger", note: "400 RPS" },
            { label: "Medium server 3 (430 RPS)", value: 93, max: 100, tone: "danger", note: "400 RPS" },
          ],
          unit: "% CPU",
          caption: "2,000 RPS split evenly across a mixed fleet: the XLs coast at 30% while every Medium runs at 93%.",
        },
        { type: "key", text: "Total capacity is not the same as usable capacity. A fleet is only as healthy as its most loaded server, and Round Robin decides who that is." },
      ],
    },
    {
      id: "weighted",
      kicker: "Shares that match capacity",
      title: "Weighted routing",
      navTitle: "Weighted Routing",
      summary: "Give each server a share proportional to what it can carry.",
      intro: [
        "Weighted Round Robin still takes turns, but each server takes as many turns as its weight. Set the weights in proportion to capacity and every server ends up at the same utilization, whatever its size.",
      ],
      blocks: [
        { type: "formula", lines: ["share(server) = weight(server) / sum of all weights", "utilization(server) = share x total RPS / capacity(server)"], caption: "With weight = capacity, utilization is identical across the fleet." },
        { type: "widget", name: "lb-demo", caption: "Switch algorithms on the same mixed fleet and watch the hottest server." },
        {
          type: "table",
          head: ["Server", "Capacity", "Weight", "Share of 2,000 RPS", "CPU"],
          rows: [
            ["XL", "1,350 RPS", "30", "758 RPS", "56%"],
            ["XL", "1,350 RPS", "30", "758 RPS", "56%"],
            ["Medium", "430 RPS", "10", "161 RPS", "37%"],
          ],
          caption: "Weights of 30:10 approximate the 1,350:430 capacity ratio; exact proportional weights would put every server at the same CPU.",
        },
        { type: "warn", text: "Weights are configuration, not magic. Resize a server and forget its weight, and the imbalance quietly comes back." },
      ],
    },
    {
      id: "connections",
      kicker: "Counting work, not requests",
      title: "Least connections and uneven requests",
      navTitle: "Least Connections",
      summary: "When request costs vary, route by work in flight.",
      intro: [
        "Some requests take 50 ms, others take two seconds. An even split by count can hand one server all the slow ones, and that server's queue grows while its neighbours idle.",
        "Least Connections sends each request to the server with the fewest requests in flight. Slow requests stay in flight longer, so busy servers naturally get fewer new ones.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Round Robin", tone: "warning", points: ["Equal request counts", "Blind to request duration", "Hot spots under mixed workloads"] },
            { title: "Least Connections", tone: "success", points: ["Equal work in flight", "Adapts to slow requests", "Needs the balancer to track connections"] },
          ],
        },
        { type: "formula", lines: ["requests in flight = arrival rate x average duration   (Little's Law)"], caption: "A server receiving 100 RPS of two-second reports holds 200 requests at once; the same rate of 50 ms pages holds 5." },
        { type: "key", text: "Least Connections shines when request durations vary widely. With uniform, fast requests it behaves almost exactly like Round Robin." },
      ],
    },
    {
      id: "health",
      kicker: "Noticing failure",
      title: "Health checks and failover",
      navTitle: "Health Checks & Failover",
      summary: "How fast a balancer stops sending traffic to a dead server.",
      intro: [
        "Without health checks a load balancer keeps sending a dead server its normal share, and that share turns straight into errors. Health checks probe each server on an interval and remove it after a number of consecutive failures.",
      ],
      blocks: [
        { type: "formula", lines: ["time to detect = probe interval x unhealthy threshold", "failed requests ≈ RPS x share of dead server x time to detect"], caption: "Faster probes shrink the error window but add probe traffic and false alarms." },
        {
          type: "table",
          head: ["Interval", "Threshold", "Detection time", "Errors at 1,000 RPS, 1 of 4 servers down"],
          rows: [
            ["30 s", "3", "90 s", "about 22,500"],
            ["10 s", "3", "30 s", "about 7,500"],
            ["5 s", "2", "10 s", "about 2,500"],
          ],
        },
        { type: "warn", text: "A health check that only proves the process is alive can pass while the server returns errors. Probe an endpoint that exercises the real dependencies, cheaply." },
      ],
    },
    {
      id: "n-plus-one",
      kicker: "Planning for the loss",
      title: "N+1: surviving the loss of a server",
      navTitle: "N+1 Capacity",
      summary: "Removing a dead server only helps if the survivors can carry its load.",
      intro: [
        "Health checks move a failed server's traffic onto the others. If the survivors were already near their limit, failover just spreads the outage. N+1 means sizing the tier so it still meets its target with the largest server gone.",
      ],
      blocks: [
        { type: "formula", lines: ["capacity after failure = total capacity - largest server", "required: peak load / capacity after failure <= target utilization"] },
        {
          type: "bars",
          items: [
            { label: "3 Large, all healthy", value: 63, max: 100, tone: "success", note: "1,500 of 2,400 RPS" },
            { label: "3 Large, one lost", value: 94, max: 100, tone: "danger", note: "1,500 of 1,600 RPS" },
            { label: "4 Large, one lost", value: 63, max: 100, tone: "success", note: "1,500 of 2,400 RPS" },
          ],
          unit: "% CPU",
          caption: "At 1,500 RPS, three Large servers look fine until one fails. The fourth server is what failover actually needs.",
        },
        { type: "key", text: "Many small servers waste less spare capacity than a few big ones: losing one of ten costs 10% of capacity, losing one of two costs half." },
      ],
    },
    {
      id: "paths",
      kicker: "Different routes, different pools",
      title: "Routing by path (Layer 7)",
      navTitle: "Path-Based Routing",
      summary: "Give each workload its own fleet behind one address.",
      intro: [
        "Not every route costs the same. A search request might burn ten times the CPU of a product page. Sharing one pool means a search spike slows everything; path routing sends each route to a pool sized for it.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Load balancer", sub: "/search/*", tone: "warning" },
            { label: "Search pool", sub: "Sized for search", tone: "accent" },
          ],
          caption: "Search traffic gets its own servers, so a spike only consumes search capacity.",
        },
        {
          type: "flow",
          steps: [
            { label: "Load balancer", sub: "everything else", tone: "warning" },
            { label: "Core pool", sub: "Sized for the site", tone: "success" },
          ],
          caption: "The rest of the site keeps its headroom no matter what search is doing.",
        },
        {
          type: "table",
          head: ["Route", "Peak RPS", "Target CPU", "Capacity needed", "Fleet"],
          rows: [
            ["/search/*", "1,400", "80%", "1,750 RPS", "3 Large (2,400)"],
            ["Everything else", "1,000", "80%", "1,250 RPS", "2 Large (1,600)"],
          ],
          caption: "Plan each pool separately: the routes don't share headroom any more.",
        },
      ],
    },
    {
      id: "choosing",
      kicker: "Putting it together",
      title: "Choosing a routing setup",
      navTitle: "Choosing a Setup",
      summary: "A short decision path for any tier.",
      intro: ["Most tiers need two or three of these decisions, not all of them. Start from the fleet and the workload, then add failure handling."],
      blocks: [
        {
          type: "table",
          head: ["Situation", "Use"],
          rows: [
            ["Identical servers, uniform requests", "Round Robin"],
            ["Mixed server sizes", "Weighted Round Robin (weights = capacity)"],
            ["Request durations vary a lot", "Least Connections"],
            ["Routes with very different costs", "Path routing to separate pools"],
            ["Any production tier", "Health checks plus N+1 capacity"],
          ],
        },
        {
          type: "list",
          ordered: true,
          items: [
            "Size the tier for peak at your target utilization.",
            "Pick the algorithm that keeps the hottest server close to the average.",
            "Turn on health checks and add enough spare capacity to lose the largest server.",
            "Split routes with different costs into their own pools.",
          ],
        },
      ],
    },
  ],
};

export const SESSIONS_GUIDE: Guide = {
  sectionId: "software-system-architecture-section-3",
  kicker: "Section 03 · Foundation",
  title: "Application State & Sessions",
  intro:
    "Horizontal scaling assumes any server can handle any request. State kept in one server's memory breaks that promise. This guide covers where session state should live, why sticky sessions only paper over the problem, how to size a shared session store, and what changes for long-lived WebSocket connections.",
  byTheEnd: "You can make a tier stateless, size the store that holds its sessions, and route real-time messages to whichever server holds a user's connection.",
  chapters: [
    {
      id: "stateless",
      kicker: "Any server, any request",
      title: "Stateless servers",
      navTitle: "Stateless Servers",
      summary: "Why the scaling story depends on servers forgetting.",
      intro: [
        "A stateless server keeps nothing about a user between requests that another server couldn't also see. That's what lets a load balancer send each request anywhere, and what lets you add, remove or restart servers freely.",
        "State doesn't disappear; it moves to a shared place that every server can reach.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Stateful servers", tone: "danger", points: ["Sessions live in local memory", "Requests must return to the same server", "Restarts and scale-in lose data"] },
            { title: "Stateless servers", tone: "success", points: ["Sessions live in a shared store", "Any server can serve any request", "Servers are disposable"] },
          ],
        },
        {
          type: "terms",
          items: [
            ["Session", "Data that identifies a signed-in user and their recent context across requests."],
            ["Local state", "Anything held only in one server's memory or disk."],
            ["Shared store", "A database or cache every server reads the same state from."],
          ],
        },
      ],
    },
    {
      id: "affinity",
      kicker: "Pinning users to servers",
      title: "Session affinity",
      navTitle: "Session Affinity",
      summary: "Sticky sessions fix the symptom, not the cause.",
      intro: [
        "When sessions live in local memory, users get logged out as soon as a request lands on a different server. Session affinity tells the load balancer to send each user back to the same server, usually with a cookie.",
        "It works until that server goes away, and it skews load: a server that collected a few heavy users stays heavy.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "User", sub: "Cookie: server-2", tone: "info" },
            { label: "Load balancer", sub: "Honours the pin", tone: "warning" },
            { label: "server-2", sub: "Holds the session", tone: "accent" },
          ],
          caption: "Affinity is a routing rule. The session still exists in exactly one place.",
        },
        { type: "key", text: "Affinity decides where a request goes. It does nothing to keep the data alive. Treat it as a performance hint, never as storage." },
      ],
    },
    {
      id: "durability",
      kicker: "What sticky sessions can't survive",
      title: "Sticky isn't durable",
      navTitle: "Sticky Isn't Durable",
      summary: "Every routine operation that removes a server logs users out.",
      intro: ["Servers disappear all the time in a healthy system: deploys, autoscaling, crashes, hardware maintenance. With sessions in memory, each of those becomes a user-visible logout."],
      blocks: [
        {
          type: "table",
          head: ["Event", "Sessions in local memory", "Sessions in a shared store"],
          rows: [
            ["Rolling deploy", "Each restarted server logs out its users", "No effect"],
            ["Scale-in", "Removed server's users logged out", "No effect"],
            ["Server crash", "Its users logged out, carts lost", "No effect"],
            ["Uneven load", "Pinned heavy users stay on one server", "Balancer spreads freely"],
          ],
        },
        { type: "warn", text: "If a design needs affinity to stay correct, it isn't horizontally scalable yet. Move the state out first, then decide whether affinity still helps cache locality." },
      ],
    },
    {
      id: "session-stores",
      kicker: "Where sessions should live",
      title: "Shared session stores",
      navTitle: "Shared Session Stores",
      summary: "A fast key-value store keyed by session id.",
      intro: [
        "Sessions are small, read on almost every request, and expire on their own. An in-memory store such as Redis fits that shape: a key per session, a TTL that matches the sign-in lifetime, and replicas so a node failure doesn't log everyone out.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Load balancer", sub: "Any server", tone: "warning" },
            { label: "App servers", sub: "Stateless", tone: "info" },
            { label: "Session store", sub: "Key: session id", tone: "success" },
          ],
          caption: "Every server reads the same session, so the balancer can route freely.",
        },
        {
          type: "terms",
          items: [
            ["TTL", "How long a session survives without activity; expiry is how sign-outs happen automatically."],
            ["Eviction policy", "What the store throws away when memory is full. For sessions, eviction means surprise logouts."],
            ["Replica", "A copy of the store that takes over if the primary node fails."],
          ],
        },
      ],
    },
    {
      id: "scaling",
      kicker: "Memory from first principles",
      title: "Sizing the session store",
      navTitle: "Sizing the Session Store",
      summary: "Little's Law turns sign-in rate and TTL into memory.",
      intro: [
        "How many sessions exist at once is an arrival rate times a lifetime, exactly Little's Law. Multiply by the bytes per session and add overhead for the store's own bookkeeping.",
      ],
      blocks: [
        { type: "formula", lines: ["live sessions = new sessions per second x TTL in seconds", "memory = live sessions x bytes per session x overhead (about 1.5)"] },
        {
          type: "table",
          head: ["Input", "Value"],
          rows: [
            ["Sign-ins per second", "40"],
            ["Session TTL", "8 hours (28,800 s)"],
            ["Live sessions", "1,152,000"],
            ["Bytes per session", "2 KB"],
            ["Memory with overhead", "about 3.5 GB"],
          ],
          caption: "A 4 GB node would run nearly full; a 16 GB node leaves room for growth and a longer TTL.",
        },
        { type: "warn", text: "Shortening the TTL saves memory but signs people out sooner. Size the store for the session lifetime product wants, not the other way round." },
      ],
    },
    {
      id: "websockets",
      kicker: "Connections that stay open",
      title: "WebSockets and long-lived connections",
      navTitle: "WebSockets",
      summary: "A connection lives on one gateway; messages must find it.",
      intro: [
        "A WebSocket is held open by one specific gateway server for minutes or hours. When a message for that user arrives on some other server, it has to know which gateway holds the connection.",
        "A shared connection registry answers that: each gateway records 'user 42 is connected to gateway-7' when the socket opens and removes it when it closes.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Sender", tone: "info" },
            { label: "App server", sub: "Who holds user 42?", tone: "warning" },
            { label: "Registry", sub: "gateway-7", tone: "accent" },
            { label: "gateway-7", sub: "Pushes the message", tone: "success" },
          ],
          caption: "With a local-only registry, a message reaches the user only if it happens to arrive on the right gateway.",
        },
        {
          type: "compare",
          items: [
            { title: "Local-only state", tone: "danger", points: ["Each gateway knows only its own sockets", "Cross-gateway messages get lost", "Works only with one gateway"] },
            { title: "Shared registry", tone: "success", points: ["Any server can find any connection", "Gateways scale out freely", "Entries expire with heartbeats"] },
          ],
        },
      ],
    },
    {
      id: "connection-capacity",
      kicker: "Sizing for open sockets",
      title: "Connection capacity",
      navTitle: "Connection Capacity",
      summary: "Gateways are sized by concurrent connections, not RPS.",
      intro: [
        "An idle WebSocket costs memory and a file descriptor even when no messages flow. Gateway fleets are planned around how many connections are open at peak, with headroom for reconnect storms.",
      ],
      blocks: [
        { type: "formula", lines: ["gateways = peak concurrent connections / (connections per gateway x target utilization)"], caption: "The labs assume about 50,000 connections per gateway instance." },
        { type: "key", text: "When a gateway restarts, all of its clients reconnect at once. Add jitter to client reconnect delays so the surge spreads over seconds instead of arriving in one spike." },
      ],
    },
    {
      id: "checklist",
      kicker: "Before you scale out",
      title: "A stateless checklist",
      navTitle: "Stateless Checklist",
      summary: "What to move out of server memory, and where.",
      intro: ["Go through this list for any tier you plan to run on more than one server."],
      blocks: [
        {
          type: "table",
          head: ["State", "Move it to"],
          rows: [
            ["Login sessions", "Shared session store with a TTL"],
            ["Shopping carts", "Database, or a store with persistence"],
            ["Uploaded files", "Object storage, never local disk"],
            ["WebSocket ownership", "Shared connection registry"],
            ["Cached data", "Shared cache, or accept per-server cache misses"],
          ],
        },
        { type: "list", items: ["Restart any server: nobody should notice.", "Scale in by one: nobody should be logged out.", "Send a user's next request elsewhere: it should just work."] },
      ],
    },
  ],
};
