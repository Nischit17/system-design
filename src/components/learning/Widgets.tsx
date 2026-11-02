"use client";

import { useEffect, useMemo, useState } from "react";
import { Server } from "lucide-react";
import type { WidgetName } from "@/lib/content/learning/types";

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted";
const INPUT =
  "figures mt-1.5 w-full rounded-xl border border-border bg-background-elevated px-3 py-2 text-sm text-text-primary outline-none transition-colors duration-fast focus:border-accent focus:ring-2 focus:ring-accent/25";

function Field({ label, value, onChange, step = 1, min = 0, suffix }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; suffix?: string }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <div className="flex items-center gap-2">
        <input type="number" value={value} min={min} step={step} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))} className={INPUT} />
        {suffix && <span className="mt-1 shrink-0 figures text-xs text-text-muted">{suffix}</span>}
      </div>
    </label>
  );
}

function Stat({ label, value, tone = "text-text-primary" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background-elevated p-3">
      <div className={LABEL}>{label}</div>
      <div className={`mt-1 figures text-lg font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-background-elevated px-4 py-3 sm:px-5">
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
          <span className="status-dot !h-1.5 !w-1.5" aria-hidden="true" />
          Interactive
        </span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

function CapacityCalculator() {
  const [peak, setPeak] = useState(2400);
  const [perServer, setPerServer] = useState(800);
  const [target, setTarget] = useState(75);
  const [spare, setSpare] = useState(1);
  const usable = (perServer * target) / 100;
  const needed = usable > 0 ? Math.ceil(peak / usable) : 0;
  const total = needed + spare;
  const util = total > 0 ? (peak / (total * perServer)) * 100 : 0;
  return (
    <Frame title="Capacity calculator">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Peak load" value={peak} onChange={setPeak} step={100} suffix="RPS" />
        <Field label="Server capacity" value={perServer} onChange={setPerServer} step={10} suffix="RPS" />
        <Field label="Target utilization" value={target} onChange={(n) => setTarget(Math.min(100, n))} suffix="%" />
        <Field label="Spare servers (N+k)" value={spare} onChange={setSpare} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Usable per server" value={`${Math.round(usable).toLocaleString()} RPS`} />
        <Stat label="Servers to provision" value={String(total)} tone="text-accent" />
        <Stat label="Utilization at peak" value={`${util.toFixed(1)}%`} tone={util > target ? "text-danger" : "text-success"} />
      </div>
      <p className="mt-3 figures text-xs text-text-muted">
        ceil({peak.toLocaleString()} / ({perServer} x {target}%)) + {spare} = {total}
      </p>
    </Frame>
  );
}

const SERVERS = [
  { name: "A", cap: 4 },
  { name: "B", cap: 4 },
  { name: "C", cap: 2 },
];
function LoadBalancerDemo() {
  const [alg, setAlg] = useState<"rr" | "wrr" | "lc">("rr");
  const [tick, setTick] = useState(0);
  const [load, setLoad] = useState([0, 0, 0]);
  const [flash, setFlash] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 700);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setLoad((cur) => {
      const drained = cur.map((l, i) => Math.max(0, l - SERVERS[i].cap * 0.35));
      let target = 0;
      if (alg === "rr") target = tick % 3;
      else if (alg === "wrr") target = [0, 1, 0, 1, 2][tick % 5];
      else target = drained.reduce((best, l, i) => (l / SERVERS[i].cap < drained[best] / SERVERS[best].cap ? i : best), 0);
      setFlash(target);
      return drained.map((l, i) => (i === target ? l + 1.6 : l));
    });
  }, [tick, alg]);
  return (
    <Frame title="Load balancing demo">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["rr", "Round Robin"],
            ["wrr", "Weighted Round Robin"],
            ["lc", "Least Connections"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setAlg(k);
              setLoad([0, 0, 0]);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-fast ${alg === k ? "border-accent/50 bg-accent/15 text-text-primary" : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {SERVERS.map((s, i) => {
          const pct = Math.min(140, (load[i] / s.cap) * 100);
          const hot = pct > 100;
          return (
            <div key={s.name} className={`rounded-xl border p-3 transition-colors ${flash === i ? "border-accent" : "border-border"} bg-background-elevated`}>
              <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <Server className="h-4 w-4 text-info" aria-hidden="true" />
                Server {s.name}
                <span className="ml-auto figures text-[10px] font-semibold text-text-muted">{s.cap === 4 ? "Large" : "Small"}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-active">
                <div className={`h-full rounded-full transition-[width] duration-500 ${hot ? "bg-danger" : "bg-success"}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <div className={`mt-1.5 figures text-xs ${hot ? "text-danger" : "text-text-muted"}`}>{Math.round(pct)}% busy</div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-text-muted">
        Server C has half the capacity of A and B. Watch which algorithm keeps it out of the red: an even split ignores size, weights encode it up front,
        and least connections discovers it from work in flight.
      </p>
    </Frame>
  );
}

function LittlesLaw() {
  const [rate, setRate] = useState(40);
  const [duration, setDuration] = useState(3);
  const [memory, setMemory] = useState(256);
  const [ram, setRam] = useState(32);
  const concurrency = rate * duration;
  const gb = (concurrency * memory) / 1024;
  const servers = Math.ceil(gb / (ram * 0.8));
  return (
    <Frame title="Little's Law sizing">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Arrival rate" value={rate} onChange={setRate} suffix="/s" />
        <Field label="Time in system" value={duration} onChange={setDuration} step={0.5} suffix="s" />
        <Field label="Memory per item" value={memory} onChange={setMemory} step={16} suffix="MB" />
        <Field label="RAM per server" value={ram} onChange={setRam} step={8} suffix="GB" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="In flight (L = λW)" value={concurrency.toLocaleString()} />
        <Stat label="Memory needed" value={`${gb.toFixed(1)} GB`} />
        <Stat label="Servers at 80% RAM" value={String(servers)} tone="text-accent" />
      </div>
    </Frame>
  );
}

function CacheHit() {
  const [ttl, setTtl] = useState(300);
  const [reuse, setReuse] = useState(20);
  const [size, setSize] = useState(16);
  const [ws, setWs] = useState(24);
  const [reads, setReads] = useState(50000);
  const hit = Math.min(0.99, 0.98 * Math.min(1, size / ws) * (ttl / (ttl + reuse)));
  const db = reads * (1 - hit);
  return (
    <Frame title="Cache hit-rate explorer">
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="TTL" value={ttl} onChange={setTtl} step={30} suffix="s" />
        <Field label="Re-read interval" value={reuse} onChange={setReuse} suffix="s" />
        <Field label="Cache memory" value={size} onChange={setSize} suffix="GB" />
        <Field label="Working set" value={ws} onChange={setWs} suffix="GB" />
        <Field label="Reads" value={reads} onChange={setReads} step={1000} suffix="/s" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Stat label="Hit rate" value={`${(hit * 100).toFixed(1)}%`} tone="text-success" />
        <Stat label="Reads reaching the database" value={`${Math.round(db).toLocaleString()}/s`} tone={db > reads * 0.3 ? "text-warning" : "text-text-primary"} />
      </div>
    </Frame>
  );
}

function QueueDrain() {
  const [arrival, setArrival] = useState(400);
  const [workers, setWorkers] = useState(10);
  const [rate, setRate] = useState(50);
  const [backlog, setBacklog] = useState(200000);
  const service = workers * rate;
  const net = service - arrival;
  const minutes = net > 0 ? backlog / net / 60 : Infinity;
  return (
    <Frame title="Backlog drain calculator">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Arrival rate" value={arrival} onChange={setArrival} step={10} suffix="/s" />
        <Field label="Worker instances" value={workers} onChange={setWorkers} />
        <Field label="Jobs per worker" value={rate} onChange={setRate} suffix="/s" />
        <Field label="Backlog" value={backlog} onChange={setBacklog} step={10000} suffix="jobs" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Service rate" value={`${service.toLocaleString()}/s`} />
        <Stat label="Worker utilization" value={`${service > 0 ? Math.round((arrival / service) * 100) : 0}%`} tone={arrival >= service ? "text-danger" : "text-text-primary"} />
        <Stat label="Time to drain" value={Number.isFinite(minutes) ? `${minutes.toFixed(1)} min` : "never"} tone={Number.isFinite(minutes) ? "text-success" : "text-danger"} />
      </div>
    </Frame>
  );
}

function ReplicaLag() {
  const [writes, setWrites] = useState(1200);
  const [apply, setApply] = useState(1500);
  const [burst, setBurst] = useState(60);
  const backlog = Math.max(0, (writes - apply) * burst);
  const lag = writes > apply ? burst + backlog / apply : Math.max(0.2, writes / apply);
  return (
    <Frame title="Replication lag">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Primary writes" value={writes} onChange={setWrites} step={100} suffix="/s" />
        <Field label="Replica apply rate" value={apply} onChange={setApply} step={100} suffix="/s" />
        <Field label="Burst length" value={burst} onChange={setBurst} step={10} suffix="s" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Stat label="Queued changes after burst" value={backlog.toLocaleString()} />
        <Stat label="Worst-case staleness" value={`${lag.toFixed(1)} s`} tone={lag > 5 ? "text-danger" : "text-success"} />
      </div>
    </Frame>
  );
}

function ShardSkew() {
  const [shards, setShards] = useState(8);
  const [key, setKey] = useState<"user" | "time" | "tenant">("user");
  const shares = useMemo(() => {
    if (key === "time") return Array.from({ length: shards }, (_, i) => (i === shards - 1 ? 100 : 0));
    if (key === "tenant") return Array.from({ length: shards }, (_, i) => (i === 0 ? 46 : 54 / Math.max(1, shards - 1)));
    return Array.from({ length: shards }, (_, i) => 100 / shards + ((i * 7) % 3) - 1);
  }, [shards, key]);
  return (
    <Frame title="Partition key skew">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Field label="Shards" value={shards} onChange={(n) => setShards(Math.min(16, Math.max(2, n)))} />
        </div>
        {(
          [
            ["user", "user_id (hash)"],
            ["tenant", "tenant_id (hash)"],
            ["time", "created_at (range)"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKey(k)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-fast ${key === k ? "border-accent/50 bg-accent/15 text-text-primary" : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="mt-4 flex h-32 items-end gap-1.5">
        {shares.map((s, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className={`w-full rounded-t-md transition-all duration-500 ${s > 100 / shards * 1.8 ? "bg-danger" : "bg-info"}`} style={{ height: `${Math.max(2, s)}%` }} />
            <span className="figures text-[9px] text-text-muted">{i + 1}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-text-muted">Share of new writes landing on each shard.</p>
    </Frame>
  );
}

function RetryStorm() {
  const [attempts, setAttempts] = useState(5);
  const [backoff, setBackoff] = useState<"immediate" | "exponential">("immediate");
  const [breaker, setBreaker] = useState(false);
  const base = 1000;
  const mult = breaker ? 1.05 : backoff === "immediate" ? attempts : 1 + (attempts - 1) * 0.15;
  return (
    <Frame title="Retry amplification">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Field label="Max attempts" value={attempts} onChange={(n) => setAttempts(Math.min(10, Math.max(1, n)))} />
        </div>
        {(["immediate", "exponential"] as const).map((b) => (
          <button key={b} type="button" onClick={() => setBackoff(b)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-fast capitalize ${backoff === b ? "border-accent/50 bg-accent/15 text-text-primary" : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"}`}>
            {b === "exponential" ? "Exponential + jitter" : "Immediate"}
          </button>
        ))}
        <button type="button" onClick={() => setBreaker((v) => !v)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-fast ${breaker ? "border-accent/50 bg-accent/15 text-text-primary" : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"}`}>
          Circuit breaker {breaker ? "on" : "off"}
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Stat label="Load on the failing dependency" value={`${Math.round(base * mult).toLocaleString()} RPS`} tone={mult > 2 ? "text-danger" : "text-success"} />
        <Stat label="Amplification" value={`x${mult.toFixed(2)}`} />
      </div>
    </Frame>
  );
}

const WIDGETS: Record<WidgetName, () => React.ReactElement> = {
  "capacity-calculator": CapacityCalculator,
  "lb-demo": LoadBalancerDemo,
  "littles-law": LittlesLaw,
  "cache-hit": CacheHit,
  "queue-drain": QueueDrain,
  "replica-lag": ReplicaLag,
  "shard-skew": ShardSkew,
  "retry-storm": RetryStorm,
};

export function GuideWidget({ name }: { name: WidgetName }) {
  const W = WIDGETS[name];
  return W ? <W /> : null;
}
