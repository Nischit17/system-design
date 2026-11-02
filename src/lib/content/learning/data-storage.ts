import type { Guide } from "./types";

export const RELATIONAL_GUIDE: Guide = {
  sectionId: "software-system-architecture-section-4",
  kicker: "Section 01 · Foundation",
  title: "Relational Databases",
  intro:
    "Most systems keep their source of truth in a relational database. This guide covers how queries find rows, why indexes matter more than hardware, why connections run out before CPU does, how to keep analytics from hurting checkout, and how to model relationships that stay correct.",
  byTheEnd: "You can explain a slow query from its access pattern, size connection pools against a database's limit, isolate heavy read workloads, and sketch a schema with the right keys.",
  chapters: [
    {
      id: "basics",
      kicker: "The source of truth",
      title: "What a relational database gives you",
      navTitle: "What You Get",
      summary: "Tables, transactions and a query planner, in one box.",
      intro: [
        "A relational database stores data as rows in tables, enforces the relationships between them, and lets many clients change data at once without corrupting it. SQL describes what you want; the query planner decides how to fetch it.",
      ],
      blocks: [
        {
          type: "terms",
          items: [
            ["Transaction", "A group of changes that commit together or not at all."],
            ["ACID", "Atomic, consistent, isolated and durable: the guarantees a transaction makes."],
            ["Primary key", "The column that uniquely identifies a row."],
            ["Foreign key", "A column that must match a primary key in another table."],
            ["Query plan", "The steps the database chooses to answer a query: scans, index lookups, joins."],
          ],
        },
        { type: "key", text: "The database is usually the hardest component to scale and the slowest to replace. Every chapter in this section is about not wasting it." },
      ],
    },
    {
      id: "indexes",
      kicker: "Finding rows fast",
      title: "Indexes and query plans",
      navTitle: "Indexes & Query Plans",
      summary: "The difference between reading ten rows and ten million.",
      intro: [
        "Without an index, the only way to find a customer's orders is to read every order and keep the matching ones: a full table scan. An index is a sorted structure, usually a B-tree, that jumps straight to the matching rows.",
        "A composite index on `(customer_id, created_at)` answers 'this customer's orders, newest first' by reading exactly the rows it returns, already in order.",
      ],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "Full scan of 40M orders", value: 40000000, max: 40000000, tone: "danger" },
            { label: "Index on customer_id", value: 1200, max: 40000000, tone: "success", note: "then sort" },
            { label: "Index on (customer_id, created_at)", value: 20, max: 40000000, tone: "success", note: "no sort" },
          ],
          unit: " rows read",
          caption: "Same query, same hardware. The access path decides the cost.",
        },
        {
          type: "table",
          head: ["Query shape", "Index that helps"],
          rows: [
            ["WHERE customer_id = ?", "(customer_id)"],
            ["WHERE customer_id = ? ORDER BY created_at DESC", "(customer_id, created_at)"],
            ["WHERE status = ? AND created_at > ?", "(status, created_at)"],
            ["WHERE created_at > ? only", "(created_at); an index starting with customer_id won't help"],
          ],
          caption: "A composite index is usable from its leftmost column onward.",
        },
        { type: "key", text: "Index the access pattern, not the column list. Start from the queries that run most often and work backwards." },
      ],
    },
    {
      id: "index-cost",
      kicker: "Nothing is free",
      title: "The cost of an index",
      navTitle: "The Cost of an Index",
      summary: "Every index speeds up reads and slows down writes.",
      intro: ["Each insert or update must also update every index on the table. Indexes take disk and memory, and an unused index costs write performance for nothing."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Too few indexes", tone: "danger", points: ["Full scans on hot queries", "CPU and I/O spikes", "Latency grows with table size"] },
            { title: "Too many indexes", tone: "warning", points: ["Slower inserts and updates", "Wasted memory and disk", "More work during migrations"] },
          ],
        },
        { type: "list", items: ["Check the query plan for your top queries.", "Add the index that turns a scan into a lookup.", "Remove indexes no query uses."] },
      ],
    },
    {
      id: "connections",
      kicker: "The limit you hit first",
      title: "Connections are a limited resource",
      navTitle: "Connection Limits",
      summary: "App instances times pool size, against the database's maximum.",
      intro: [
        "Each database connection costs memory and a backend process or thread, so databases cap how many they accept. Every app instance keeps its own pool, which means scaling out the app tier multiplies connections even when queries are cheap.",
      ],
      blocks: [
        { type: "formula", lines: ["connections = app instances x pool size per instance", "must stay below the database's max_connections, with room for admin and failover"] },
        {
          type: "bars",
          items: [
            { label: "10 instances x 20", value: 200, max: 600, tone: "success" },
            { label: "20 instances x 20", value: 400, max: 600, tone: "warning" },
            { label: "30 instances x 20", value: 600, max: 600, tone: "danger", note: "over a 500 limit" },
          ],
          unit: " connections",
          caption: "Autoscaling the app tier can exhaust the database without a single slow query.",
        },
        {
          type: "table",
          head: ["Pooler mode", "A server connection is held for", "Good for"],
          rows: [
            ["Session", "The whole client session", "Apps that rely on session state, prepared statements"],
            ["Transaction", "One transaction", "Many short requests sharing few connections"],
          ],
          caption: "A transaction-mode pooler lets hundreds of app connections share a few dozen database connections.",
        },
      ],
    },
    {
      id: "transactions",
      kicker: "Correct under concurrency",
      title: "Transactions and locking",
      navTitle: "Transactions & Locking",
      summary: "Isolation levels decide what concurrent transactions can see.",
      intro: [
        "Two checkouts buying the last unit at the same time is a concurrency problem, not a capacity one. Transactions and row locks make one of them wait or fail instead of both succeeding.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Isolation level", "Prevents", "Cost"],
          rows: [
            ["Read committed", "Reading uncommitted data", "Lowest; the common default"],
            ["Repeatable read", "Rows changing under a running transaction", "More conflicts and retries"],
            ["Serializable", "Every anomaly, as if transactions ran one by one", "Highest; more aborts"],
          ],
        },
        { type: "key", text: "Lock or check exactly what must stay consistent (the stock count, the seat) and keep those transactions short. Long transactions hold locks and block everyone behind them." },
      ],
    },
    {
      id: "isolation",
      kicker: "Protecting the hot path",
      title: "Keeping analytics off the primary",
      navTitle: "Workload Isolation",
      summary: "Heavy reports and checkout should not share a CPU.",
      intro: [
        "A dashboard query that scans a year of orders can pin the primary's CPU for minutes. Checkout queries queue behind it. The fix is the same idea as isolating compute: give the heavy reader its own copy of the data.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Checkout", sub: "Short transactions", tone: "info" },
            { label: "Primary", sub: "Reads and writes", tone: "success" },
          ],
          caption: "The interactive path keeps the primary to itself.",
        },
        {
          type: "flow",
          steps: [
            { label: "Analytics", sub: "Long scans", tone: "warning" },
            { label: "Read replica", sub: "Seconds behind", tone: "accent" },
          ],
          caption: "Reports read a replica. A little lag is fine for a dashboard.",
        },
        { type: "warn", text: "A replica copies every write, so it can't absorb more writes. It only takes read load off the primary." },
      ],
    },
    {
      id: "modeling",
      kicker: "Shape the data",
      title: "Modeling relationships",
      navTitle: "Modeling Relationships",
      summary: "Tables, keys and the relationships between them.",
      intro: [
        "Good schemas mirror how the business works: a seller has many listings, a listing appears in many orders, an order has many line items. Keys make those relationships explicit, so the database can reject data that breaks them.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Table", "Primary key", "Foreign keys", "Relationship"],
          rows: [
            ["sellers", "id", "none", "One seller has many listings"],
            ["listings", "id", "seller_id -> sellers", "Many listings per seller"],
            ["orders", "id", "buyer_id -> buyers", "One buyer has many orders"],
            ["order_items", "id", "order_id -> orders, listing_id -> listings", "Join table: many-to-many"],
          ],
        },
        {
          type: "list",
          items: [
            "One-to-many: put the foreign key on the 'many' side.",
            "Many-to-many: add a join table with a foreign key to each side.",
            "Store each fact once; derive totals with queries or maintained summaries.",
            "Index foreign keys you join or filter on.",
          ],
        },
      ],
    },
    {
      id: "sizing",
      kicker: "Choosing a size",
      title: "Sizing a database",
      navTitle: "Sizing a Database",
      summary: "Reads, writes and cost per instance size.",
      intro: ["Database sizes in the labs scale reads and writes together. Size for the peak of whichever one binds first, with headroom."],
      blocks: [
        {
          type: "table",
          head: ["Size", "Reads/s", "Writes/s", "Monthly cost"],
          rows: [
            ["Small", "6,000", "2,500", "$90"],
            ["Medium", "18,000", "7,000", "$220"],
            ["Large", "45,000", "16,000", "$480"],
            ["XL", "90,000", "30,000", "$960"],
          ],
          caption: "The database size table used throughout the labs.",
        },
        { type: "key", text: "Reads can be offloaded to replicas and caches. Writes can't, so the write rate usually decides how big the primary must be." },
      ],
    },
  ],
};

export const REPLICATION_GUIDE: Guide = {
  sectionId: "software-system-architecture-section-5",
  kicker: "Section 02 · Foundation",
  title: "Database Scaling & Replication",
  intro:
    "One database server eventually runs out of room. This guide covers scaling up, adding read replicas, the replication lag that comes with them, keeping bulk writes from drowning replicas, and failing over when the primary dies.",
  byTheEnd: "You can scale a read-heavy database, explain and contain replication lag, and choose a replication mode from the data loss and downtime a business can accept.",
  chapters: [
    {
      id: "vertical",
      kicker: "The simplest move",
      title: "Scaling up first",
      navTitle: "Scaling Up",
      summary: "A bigger instance is easy, until there's no bigger instance.",
      intro: [
        "Moving to a larger instance needs no application changes and keeps everything consistent. It is the right first step, but it has a ceiling and it doesn't help when the primary fails.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Scale up", tone: "info", points: ["No code changes", "Strong consistency stays simple", "Hard ceiling, single point of failure"] },
            { title: "Scale out reads", tone: "success", points: ["Replicas multiply read capacity", "Survives losing a node", "Introduces replication lag"] },
          ],
        },
      ],
    },
    {
      id: "replicas",
      kicker: "More copies, more reads",
      title: "Read replicas",
      navTitle: "Read Replicas",
      summary: "Replicas add read capacity; every replica still replays every write.",
      intro: [
        "A replica receives the primary's stream of changes and applies them to its own copy. Reads can go to any copy; writes still go to the primary. Read capacity grows with each replica, write capacity doesn't.",
      ],
      blocks: [
        { type: "formula", lines: ["read capacity = primary reads + replicas x replica reads", "write capacity = primary writes   (replicas don't help)"] },
        {
          type: "flow",
          steps: [
            { label: "App servers", tone: "info" },
            { label: "Primary", sub: "All writes", tone: "success" },
            { label: "Replicas", sub: "Spread reads", tone: "accent" },
          ],
          caption: "Read/write splitting: writes and critical reads go to the primary, everything else to replicas.",
        },
        { type: "key", text: "A catalog read 30,000 times per second and written 50 times per second is a perfect replica workload. A system that writes heavily needs partitioning instead." },
      ],
    },
    {
      id: "lag",
      kicker: "Copies are a little behind",
      title: "Replication lag",
      navTitle: "Replication Lag",
      summary: "Asynchronous replicas trail the primary, sometimes by seconds.",
      intro: [
        "With asynchronous replication the primary acknowledges a write before replicas have it. Normally the gap is milliseconds; under bursts of writes or a slow replica it can grow to seconds or minutes.",
        "The visible symptom: a user saves a change, the next page reads from a replica, and the change seems to have vanished.",
      ],
      blocks: [
        { type: "widget", name: "replica-lag", caption: "Raise the write rate past what the replica can apply and watch the lag grow." },
        {
          type: "table",
          head: ["Strategy", "How it works", "Trade-off"],
          rows: [
            ["Read your writes from the primary", "Route a user's reads to the primary for a short window after they write", "Slightly more primary load"],
            ["Wait for position", "Replica serves the read only once it has applied the user's last write", "Occasional extra latency"],
            ["Accept staleness", "Fine for feeds, counts, dashboards", "Users may see old data briefly"],
          ],
        },
      ],
    },
    {
      id: "backpressure",
      kicker: "Bulk jobs and replicas",
      title: "Bulk writes and backpressure",
      navTitle: "Bulk Writes & Backpressure",
      summary: "A nightly import can outrun the replicas' apply rate.",
      intro: [
        "A replica applies changes at a finite rate. When a bulk import writes faster than that, the lag grows for as long as the import runs, and every read from a replica gets staler.",
      ],
      blocks: [
        { type: "formula", lines: ["lag growth per second = write rate - replica apply rate", "lag at the end = (write rate - apply rate) x import duration / apply rate"] },
        {
          type: "bars",
          items: [
            { label: "Import at 9,000 writes/s", value: 300, max: 300, tone: "danger", note: "lag keeps climbing" },
            { label: "Import throttled to 4,500/s", value: 2, max: 300, tone: "success", note: "replicas keep up" },
          ],
          unit: " s lag",
          caption: "With replicas applying 5,000 writes/s, throttling the import just under that keeps lag near zero.",
        },
        { type: "key", text: "Backpressure means the producer slows down when the consumer can't keep up. Batch and throttle bulk writes against the replicas' apply rate, not the primary's write capacity." },
      ],
    },
    {
      id: "failover",
      kicker: "When the primary dies",
      title: "Failover",
      navTitle: "Failover",
      summary: "Promoting a replica, and what can be lost on the way.",
      intro: [
        "When the primary fails, a replica must be promoted and the application pointed at it. Automatic failover does this in seconds; manual failover depends on someone waking up.",
        "With asynchronous replication, writes the primary acknowledged but hadn't shipped yet are lost. Synchronous replication waits for a replica before acknowledging, so nothing acknowledged is lost, at the cost of write latency.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Asynchronous", tone: "warning", points: ["Fast writes", "May lose the last seconds of writes", "RPO of seconds"] },
            { title: "Synchronous", tone: "success", points: ["Every write waits for a replica", "No acknowledged write is lost", "RPO of zero, higher latency"] },
          ],
        },
        {
          type: "terms",
          items: [
            ["RPO", "Recovery point objective: how much recent data you can afford to lose."],
            ["RTO", "Recovery time objective: how long you can afford to be down."],
            ["Split brain", "Two nodes both acting as primary after a bad failover. Fencing prevents it."],
          ],
        },
        { type: "warn", text: "Failover you've never tested is a plan, not a capability. Rehearse it." },
      ],
    },
    {
      id: "next-steps",
      kicker: "When replicas aren't enough",
      title: "Beyond replication",
      navTitle: "Beyond Replication",
      summary: "Write-heavy growth needs a different tool.",
      intro: ["Replicas solve read scale and availability. When the write rate itself outgrows the largest primary, the data has to be split across several primaries: partitioning, covered in the next section."],
      blocks: [
        {
          type: "table",
          head: ["Problem", "Tool"],
          rows: [
            ["Too many reads", "Read replicas, caching"],
            ["Reads must be fresh after writes", "Read-your-writes routing"],
            ["Primary may fail", "Replica plus automatic failover"],
            ["Too many writes", "Partitioning and sharding"],
          ],
        },
      ],
    },
  ],
};

export const SHARDING_GUIDE: Guide = {
  sectionId: "software-system-architecture-section-6",
  kicker: "Section 03 · Foundation",
  title: "Partitioning & Sharding",
  intro:
    "When writes outgrow one primary, the data has to be split. This guide covers why sharding works, how to choose a partition key, what makes one shard hot, hash versus range partitioning, and how to avoid queries and transactions that span shards.",
  byTheEnd: "You can pick a partition key that spreads load evenly, spot keys that create hot shards, and design data so most operations touch a single shard.",
  chapters: [
    {
      id: "partitioning",
      kicker: "Many primaries",
      title: "Why shard",
      navTitle: "Why Shard",
      summary: "Split the data so each primary owns a fraction of the writes.",
      intro: [
        "Sharding splits one logical table across several databases. Each shard holds a subset of the rows and takes the writes for that subset, so total write capacity grows with the number of shards, as long as the load spreads evenly.",
      ],
      blocks: [
        { type: "formula", lines: ["writes per shard = total writes x share of the hottest shard", "ideal share = 1 / number of shards"] },
        {
          type: "flow",
          steps: [
            { label: "App", tone: "info" },
            { label: "Shard router", sub: "hash(key)", tone: "warning" },
            { label: "Shards 1..N", sub: "Each owns a slice", tone: "success" },
          ],
          caption: "Every request carries the partition key, so the router knows which shard owns the row.",
        },
      ],
    },
    {
      id: "keys",
      kicker: "The most important decision",
      title: "Choosing a partition key",
      navTitle: "Choosing a Partition Key",
      summary: "High cardinality, even access, and aligned with your queries.",
      intro: ["A good partition key has many distinct values, spreads traffic evenly across them, and appears in the queries you run most often, so each query goes to one shard."],
      blocks: [
        {
          type: "table",
          head: ["Candidate key", "Verdict", "Why"],
          rows: [
            ["user_id", "Good", "Millions of values, traffic spread across users"],
            ["order_id", "Good for orders", "Even spread, but 'orders by user' becomes a fan-out"],
            ["country", "Bad", "Few values; one large country becomes one hot shard"],
            ["created_at (range)", "Bad", "All new writes land on the newest shard"],
            ["tenant_id", "Depends", "Fine unless one tenant is enormous"],
          ],
        },
        { type: "key", text: "Choose the key from the access pattern. The best key makes your most common reads and writes single-shard operations." },
      ],
    },
    {
      id: "skew",
      kicker: "When one shard melts",
      title: "Hot partitions and skew",
      navTitle: "Hot Partitions",
      summary: "One key with outsized traffic overloads its shard.",
      intro: [
        "Even with a good key, real traffic is lumpy. A celebrity account, a giant tenant or a viral product can send a large share of writes to a single key, and everything on that shard slows down.",
        "Compound keys spread a hot entity across shards, for example `(tenant_id, bucket)` where bucket is a small hash of the row id.",
      ],
      blocks: [
        { type: "widget", name: "shard-skew", caption: "Change the key and see how evenly writes land across shards." },
        {
          type: "bars",
          items: [
            { label: "Shard 1", value: 92, max: 100, tone: "danger", note: "big tenant" },
            { label: "Shard 2", value: 21, max: 100, tone: "success" },
            { label: "Shard 3", value: 18, max: 100, tone: "success" },
            { label: "Shard 4", value: 23, max: 100, tone: "success" },
          ],
          unit: "%",
          caption: "Average load is 39%, but the system is only as healthy as shard 1.",
        },
      ],
    },
    {
      id: "strategies",
      kicker: "How keys map to shards",
      title: "Hash vs. range partitioning",
      navTitle: "Hash vs. Range",
      summary: "Even spread versus efficient range scans.",
      intro: ["Range partitioning assigns contiguous key ranges to shards, which keeps range scans on one shard. Hash partitioning scatters keys by their hash, which spreads load but turns ranges into fan-outs."],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Range", tone: "warning", points: ["Efficient range queries", "Monotonic keys hit the last shard", "Manual rebalancing as ranges grow"] },
            { title: "Hash", tone: "success", points: ["Even spread for most keys", "Range queries touch every shard", "Rebalancing via consistent hashing"] },
          ],
        },
        { type: "warn", text: "Timestamps, auto-increment ids and other monotonic keys under range partitioning send every new write to the newest shard. Hash them, or prefix them with a well-spread key." },
      ],
    },
    {
      id: "cross-shard",
      kicker: "Keep related data together",
      title: "Cross-shard operations",
      navTitle: "Cross-Shard Operations",
      summary: "Joins and transactions across shards are slow and fragile.",
      intro: [
        "A checkout that writes an order on one shard and a payment on another needs a distributed transaction, which is slow and has awkward failure modes. Most of the time the better answer is to co-locate data that changes together under the same key.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Data", "Partition key", "Result"],
          rows: [
            ["orders", "customer_id", "A customer's orders live together"],
            ["order_items", "customer_id", "Same shard as their order"],
            ["payments", "customer_id", "Checkout is a single-shard transaction"],
          ],
        },
        { type: "key", text: "When a workflow truly spans shards, use a saga: a sequence of local transactions with compensating steps if a later step fails." },
      ],
    },
    {
      id: "resharding",
      kicker: "Growing later",
      title: "Adding shards later",
      navTitle: "Resharding",
      summary: "Consistent hashing moves only a fraction of the data.",
      intro: [
        "With naive `hash(key) mod N`, changing N moves almost every key. Consistent hashing places shards on a ring, often as many virtual nodes each, so adding a shard moves only the keys from its neighbours.",
      ],
      blocks: [
        {
          type: "compare",
          items: [
            { title: "hash mod N", tone: "danger", points: ["Simple to compute", "Adding a shard remaps most keys", "Massive data movement"] },
            { title: "Consistent hashing", tone: "success", points: ["Keys mapped onto a ring", "Adding a shard moves about 1/N of keys", "Virtual nodes smooth the spread"] },
          ],
        },
      ],
    },
  ],
};

export const OBJECT_STORAGE_GUIDE: Guide = {
  sectionId: "software-system-architecture-section-7",
  kicker: "Section 04 · Foundation",
  title: "Object Storage & File Systems",
  intro:
    "Files, images, videos and backups belong somewhere other than database rows. This guide covers when to use object storage, how direct uploads keep app servers out of the data path, how key layout affects throughput, when a shared file system fits, and how lifecycle rules control cost.",
  byTheEnd: "You can move binary data out of the database, design key layouts that scale, choose between object storage and shared file systems, and set retention that matches each kind of data.",
  chapters: [
    {
      id: "blobs",
      kicker: "Bytes don't belong in rows",
      title: "Blobs vs. rows",
      navTitle: "Blobs vs. Rows",
      summary: "Keep metadata in the database and bytes in object storage.",
      intro: [
        "Storing videos or images inside a relational database bloats it, slows backups and replication, and makes every app server stream large files through its memory. Object storage is built for exactly this: cheap, durable, effectively unlimited.",
        "The database keeps the metadata (owner, size, object key); the bytes live in a bucket. With signed URLs, clients upload and download directly, and app servers never touch the bytes.",
      ],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Client", sub: "Asks to upload", tone: "info" },
            { label: "App server", sub: "Returns signed URL", tone: "warning" },
            { label: "Object storage", sub: "Client PUTs bytes", tone: "success" },
          ],
          caption: "The app issues a short-lived permission; the bytes go straight to storage.",
        },
        {
          type: "compare",
          items: [
            { title: "Proxy through the app", tone: "danger", points: ["App bandwidth and memory per upload", "Slow uploads hold server threads", "App tier scales with bytes"] },
            { title: "Signed direct upload", tone: "success", points: ["App handles a tiny request", "Storage absorbs the bandwidth", "URLs expire in minutes"] },
          ],
        },
      ],
    },
    {
      id: "object-model",
      kicker: "How it works",
      title: "The object storage model",
      navTitle: "The Object Model",
      summary: "Buckets, keys and whole-object writes.",
      intro: ["Object storage is a flat namespace of keys inside buckets. You write whole objects, read them by key, and the service replicates them across failure domains for durability."],
      blocks: [
        {
          type: "terms",
          items: [
            ["Bucket", "A container of objects with its own access and lifecycle rules."],
            ["Key", "The object's name, e.g. users/42/avatar.png. Slashes are just characters."],
            ["Object", "Immutable bytes plus metadata. Updating means writing a new version."],
            ["Versioning", "Keeps previous versions so overwrites and deletes can be undone."],
            ["Multipart upload", "Splits a large upload into parts that can be retried individually."],
          ],
        },
      ],
    },
    {
      id: "prefixes",
      kicker: "Throughput is per prefix",
      title: "Key layout and request rates",
      navTitle: "Key Layout & Prefixes",
      summary: "Spread hot keys across prefixes to multiply throughput.",
      intro: [
        "Object stores partition their index by key prefix, and each partition serves a limited request rate. Millions of tiny files under one prefix all compete for the same partition.",
        "Spreading keys across hashed prefixes multiplies throughput, and putting a CDN in front of public files removes most of the reads entirely.",
      ],
      blocks: [
        { type: "formula", lines: ["request capacity ≈ number of busy prefixes x requests per prefix"], caption: "The labs assume about 5,500 requests per second per prefix." },
        {
          type: "table",
          head: ["Key layout", "Example", "Effect"],
          rows: [
            ["Flat date prefix", "2026/11/02/img123.jpg", "Today's uploads share one hot prefix"],
            ["Hashed prefix", "a7/f3/img123.jpg", "Load spreads across many prefixes"],
          ],
        },
      ],
    },
    {
      id: "filesystems",
      kicker: "When you need a file system",
      title: "Shared file systems",
      navTitle: "Shared File Systems",
      summary: "POSIX semantics, at the cost of throughput contention.",
      intro: [
        "Some software needs real files: legacy applications, tools that seek within files, ML training jobs reading datasets. A shared network file system mounts the same directory on many servers.",
        "Throughput is the catch. Bursting file systems earn credits while idle and spend them under load; when credits run out, throughput drops to a baseline and every client slows down together.",
      ],
      blocks: [
        {
          type: "bars",
          items: [
            { label: "Bursting, credits available", value: 100, max: 100, tone: "success" },
            { label: "Bursting, credits exhausted", value: 15, max: 100, tone: "danger", note: "baseline only" },
            { label: "Provisioned throughput", value: 80, max: 100, tone: "info", note: "steady" },
          ],
          unit: "% of peak throughput",
          caption: "Bursting looks great in short tests and falls off a cliff in long jobs.",
        },
        { type: "key", text: "Use object storage by default. Reach for a shared file system only when the software truly needs file semantics, and provision throughput for sustained workloads." },
      ],
    },
    {
      id: "lifecycle",
      kicker: "Keep it or let it go",
      title: "Lifecycle rules",
      navTitle: "Lifecycle Rules",
      summary: "Move data to cheaper tiers, then delete it on schedule.",
      intro: [
        "Not all data is equally valuable over time. Last week's uploads are read constantly; three-year-old logs are read never. Lifecycle rules move objects to cheaper storage classes after a set age and expire them when they're no longer needed.",
      ],
      blocks: [
        {
          type: "table",
          head: ["Class", "Relative cost", "Retrieval", "Good for"],
          rows: [
            ["Standard", "Highest", "Instant", "Active content"],
            ["Infrequent access", "About half", "Instant, per-GB fee", "Backups, older media"],
            ["Archive", "About a quarter", "Minutes to hours", "Compliance retention"],
          ],
        },
        {
          type: "list",
          items: [
            "Temporary data (exports, thumbnails in progress): expire in days.",
            "User content: keep, transition to infrequent access when it goes cold.",
            "Compliance data: archive, then expire exactly when the policy ends.",
          ],
        },
      ],
    },
    {
      id: "delivery",
      kicker: "Getting files to users",
      title: "Serving files at scale",
      navTitle: "Serving Files",
      summary: "CDNs for public files, signed URLs for private ones.",
      intro: ["Public assets belong behind a CDN so object storage sees only misses. Private files can still be served directly from storage with short-lived signed download URLs, keeping app servers out of the path."],
      blocks: [
        {
          type: "flow",
          steps: [
            { label: "Browser", tone: "info" },
            { label: "CDN edge", sub: "Most requests end here", tone: "accent" },
            { label: "Object storage", sub: "Misses only", tone: "success" },
          ],
          caption: "The CDN absorbs reads close to users; storage pays only for misses.",
        },
      ],
    },
  ],
};
