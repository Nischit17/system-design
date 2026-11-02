import { componentLabel } from "@/lib/catalog/components";
import type { Check, CategoryKey } from "./types";
import type { Ctx } from "@/lib/sim/evaluate";
import * as E from "@/lib/sim/engine";

/** Builders for the requirement checks most problems share. */

export const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : "unbounded");
export const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n)}%` : "no capacity");
const label = (type: string) => componentLabel(type);
const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

export function lbEntry(points = 10): Check {
  return {
    text: "Use a load balancer as the entry point for incoming traffic.",
    category: "quality",
    label: "Entry point",
    points,
    test: (c) => c.topology().entry?.type === "load-balancer",
    pass: "Traffic enters through a load balancer that can spread it across the fleet.",
    fail: (c) =>
      c.topology().entry
        ? `Traffic enters at ${label(c.topology().entry!.type)}, so nothing can spread it across servers.`
        : "There is no entry point for traffic yet.",
    fix: "Put a load balancer in front of the application tier and route the internet to it.",
  };
}

export function serversBehindLb(points = 10): Check {
  return {
    text: "Connect every application server to the load balancer so it receives traffic.",
    category: "quality",
    label: "Request distribution",
    points,
    test: (c) => {
      const t = c.topology();
      return t.entry?.type === "load-balancer" && t.servers.length > 0 && t.unreachable.length === 0;
    },
    pass: (c) => `Traffic is distributed across ${c.topology().servers.length} healthy application server node(s).`,
    fail: (c) => {
      const t = c.topology();
      if (!t.servers.length) return "No application server receives traffic from the entry point.";
      return `${t.unreachable.length} application server(s) have no path from the load balancer and sit idle.`;
    },
    fix: "Draw an edge from the load balancer to every application server you added.",
  };
}

export function capacityAtLeast(rps: number, what = "sustained traffic", unit = "RPS", points = 15): Check {
  return {
    text: `Provide at least ${fmt(rps)} ${unit} of aggregate application-server capacity for ${what}.`,
    category: "capacity",
    label: "Capacity",
    points,
    test: (c) => c.load(rps).totalCapacityRps >= rps,
    pass: (c) => `Reachable servers provide ${fmt(c.load(rps).totalCapacityRps)} ${unit} against the ${fmt(rps)} ${unit} target.`,
    fail: (c) => `Reachable servers provide only ${fmt(c.load(rps).totalCapacityRps)} ${unit}; ${what} needs ${fmt(rps)} ${unit}.`,
    fix: `Add servers or move to larger sizes until reachable capacity covers ${fmt(rps)} ${unit}.`,
  };
}

export function cpuCeiling(rps: number, cpuMax: number, unit = "RPS", points = 15): Check {
  return {
    text: `Keep every application server at or below ${cpuMax}% CPU during the ${fmt(rps)} ${unit} test.`,
    category: "capacity",
    label: "Per-server load",
    points,
    test: (c) => {
      const t = c.load(rps, cpuMax);
      return t.perServer.length > 0 && t.perServer.every((r) => r.passed);
    },
    pass: (c) => {
      const worst = c.load(rps, cpuMax).perServer.reduce((m, r) => Math.max(m, r.cpuPercent), 0);
      return `Traffic is served within every server's capacity at ${fmt(rps)} ${unit}; the busiest server runs at ${worst}% CPU.`;
    },
    fail: (c) => {
      const t = c.load(rps, cpuMax);
      if (!t.perServer.length) return "No server receives traffic, so the load test fails outright.";
      const worst = t.perServer.reduce((m, r) => (r.cpuPercent > m.cpuPercent ? r : m));
      return `${worst.label} (${worst.sizeLabel}) receives ${fmt(worst.trafficRps)} ${unit} and runs at ${worst.cpuPercent}% CPU, over the ${cpuMax}% ceiling.`;
    },
    fix: `Check the busiest server: either give it more capacity or change the routing so its share matches what it can handle.`,
  };
}

export function dbBehindServers(type = "postgresql", points = 10): Check {
  return {
    text: `Add ${label(type)} and connect every traffic-serving application server directly to it.`,
    category: "validity",
    label: "Data path",
    points,
    test: (c) => {
      const t = c.topology();
      const db = c.nodes(type);
      return db.length > 0 && t.servers.length > 0 && t.servers.every((s) => db.some((d) => E.linked(c.g, s.id, d.id)));
    },
    pass: `Every serving application server has a path to ${label(type)}.`,
    fail: (c) =>
      c.has(type) ? `Not every application server has a path to ${label(type)}.` : `${label(type)} is missing from the canvas.`,
    fix: `Connect each application server to ${label(type)}; servers without a data path cannot complete requests.`,
  };
}

export function budget(max: number, what = "the design", points = 15, types?: string[]): Check {
  return {
    text: `Keep the combined monthly cost of ${what} at or below $${fmt(max)}.`,
    category: "cost",
    label: "Cost Efficiency",
    points,
    test: (c) => c.g.nodes.length > 0 && c.cost(types) <= max,
    pass: (c) => `Monthly cost $${fmt(c.cost(types))} is within the $${fmt(max)} budget.`,
    fail: (c) => `Monthly cost $${fmt(c.cost(types))} is over the $${fmt(max)} budget.`,
    fix: `Look for over-provisioned components; the same capacity is often cheaper as a different mix of sizes.`,
  };
}

export function healthChecksOn(points = 10): Check {
  return {
    text: "Enable health checks on the load balancer so failed servers stop receiving traffic.",
    category: "reliability",
    label: "Failure detection",
    points,
    test: (c) => c.is("load-balancer", "healthChecks", "Enabled") || (c.has("health-check") && c.has("load-balancer")),
    pass: "The load balancer probes its backends and removes failed instances from rotation.",
    fail: "Health checks are off; a crashed server keeps receiving its share of requests.",
    fix: "Turn on health checks in the load balancer's configuration.",
  };
}

export function survivesServerLoss(rps: number, cpuMax: number, points = 15): Check {
  return {
    text: `Keep serving ${fmt(rps)} RPS at or below ${cpuMax}% CPU when the largest application server fails.`,
    category: "reliability",
    label: "Server failure test",
    points,
    test: (c) => c.failure(rps, cpuMax).passed,
    pass: (c) => {
      const f = c.failure(rps, cpuMax);
      return `With ${f.unhealthyLabel} down, the remaining servers absorb all ${fmt(rps)} RPS.`;
    },
    fail: (c) => {
      const f = c.failure(rps, cpuMax);
      if (!f.healthChecksEnabled) return `With ${f.unhealthyLabel} down and no health checks, ${fmt(f.failedRps)} RPS keeps going to the dead server.`;
      return `With ${f.unhealthyLabel} down, survivors drop or overload ${fmt(f.failedRps)} RPS.`;
    },
    fix: "Plan for N+1: the fleet minus its largest server must still carry the full load, and health checks must route around the failure.",
  };
}

export function hasComponent(type: string, text?: string, category: CategoryKey = "quality", points = 10, min = 1): Check {
  const name = label(type);
  return {
    text: text ?? `Include ${min > 1 ? `at least ${min}` : article(name)} ${name}${min > 1 ? " nodes" : ""} in the design.`,
    category,
    label: name,
    points,
    test: (c) => c.has(type, min),
    pass: `${name} is part of the design.`,
    fail: `The design has no ${name}${min > 1 ? ` (needs ${min})` : ""}.`,
    fix: `Add ${article(name)} ${name} from the component library.`,
  };
}

export function noComponent(type: string, text: string, category: CategoryKey = "quality", points = 10): Check {
  const name = label(type);
  return {
    text,
    category,
    label: `No ${name}`,
    points,
    test: (c) => !c.has(type),
    pass: `No ${name} where it doesn't belong.`,
    fail: `${name} adds cost and complexity without serving this requirement.`,
    fix: `Remove the ${name}; this requirement is met without it.`,
  };
}

export function connects(from: string, to: string, text: string, category: CategoryKey = "quality", points = 10): Check {
  return {
    text,
    category,
    label: `${label(from)} -> ${label(to)}`,
    points,
    test: (c) => c.edge(from, to),
    pass: `${label(from)} connects to ${label(to)}.`,
    fail: `${label(from)} is not connected to ${label(to)}.`,
    fix: `Drag from the ${label(from)}'s right handle to the ${label(to)}.`,
  };
}

export function flowExists(types: string[], text: string, category: CategoryKey = "quality", points = 10): Check {
  const names = types.map(label).join(" -> ");
  return {
    text,
    category,
    label: "Request path",
    points,
    test: (c) => c.path(...types),
    pass: `The path ${names} exists.`,
    fail: `The path ${names} is incomplete.`,
    fix: `Wire the components in this order: ${names}.`,
  };
}

export function configIs(
  type: string,
  key: string,
  value: string | string[],
  text: string,
  category: CategoryKey = "quality",
  points = 10,
  opts: { all?: boolean; pass?: string; fail?: string; fix?: string; label?: string } = {},
): Check {
  const values = Array.isArray(value) ? value : [value];
  const name = label(type);
  return {
    text,
    category,
    label: opts.label ?? name,
    points,
    test: (c) => {
      const list = c.nodes(type);
      if (!list.length) return false;
      return opts.all ? list.every((n) => values.includes(E.str(n.config[key]))) : list.some((n) => values.includes(E.str(n.config[key])));
    },
    pass: opts.pass ?? `${name} is configured correctly.`,
    fail: opts.fail ?? (c => c.has(type) ? `${name} is not configured as required.` : `The design has no ${name}.`),
    fix: opts.fix ?? text,
  };
}

export function numberAtLeast(
  type: string,
  key: string,
  min: number,
  text: string,
  category: CategoryKey = "quality",
  points = 10,
  opts: { fix?: string; label?: string } = {},
): Check {
  const name = label(type);
  return {
    text,
    category,
    label: opts.label ?? name,
    points,
    test: (c) => c.nodes(type).some((n) => E.num(n.config[key]) >= min),
    pass: `${name} meets the required setting.`,
    fail: (c) => (c.has(type) ? `${name} is set to ${E.num(c.first(type)!.config[key])}; it needs at least ${min}.` : `The design has no ${name}.`),
    fix: opts.fix ?? text,
  };
}

export function numberAtMost(
  type: string,
  key: string,
  max: number,
  text: string,
  category: CategoryKey = "quality",
  points = 10,
  opts: { fix?: string; label?: string; allowZero?: boolean } = {},
): Check {
  const name = label(type);
  return {
    text,
    category,
    label: opts.label ?? name,
    points,
    test: (c) =>
      c.nodes(type).some((n) => {
        const v = E.num(n.config[key]);
        return v <= max && (opts.allowZero !== false || v > 0);
      }),
    pass: `${name} meets the required setting.`,
    fail: (c) => (c.has(type) ? `${name} is set to ${E.num(c.first(type)!.config[key])}; it must be ${max} or lower.` : `The design has no ${name}.`),
    fix: opts.fix ?? text,
  };
}

/** Custom check with consistent defaults. */
export function rule(
  text: string,
  test: (c: Ctx) => boolean,
  opts: Partial<Omit<Check, "text" | "test">> = {},
): Check {
  return { text, test, category: "quality", points: 10, ...opts };
}

export const SERVER_SIZES_TEXT = "Small 220 RPS ($180), Medium 430 ($330), Large 800 ($620), XL 1,350 ($1,120), 2XL 1,850 ($2,100)";

/* ---------- graph authoring helpers ---------- */
import type { GraphSpec } from "@/lib/sim/graph";
type NodeSpec = GraphSpec["nodes"][number];

/** A vertical column of identical nodes: ids prefix-1..n, centered on `centerY`. */
export function column(
  prefix: string,
  type: string,
  count: number,
  x: number,
  centerY: number,
  config: NodeSpec["config"] = {},
  gap = 110,
): NodeSpec[] {
  const top = centerY - ((count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i + 1}`, type, x, y: Math.round(top + i * gap), config: { ...config } }));
}

/** Edges from one node to many, or many to one. */
export const fanOut = (from: string, to: string[]) => to.map((t) => ({ source: from, target: t }));
export const fanIn = (from: string[], to: string) => from.map((f) => ({ source: f, target: to }));
export const ids = (nodes: NodeSpec[]) => nodes.map((n) => n.id);
/** Shorthand node spec. */
export const node = (id: string, type: string, x: number, y: number, config: NodeSpec["config"] = {}): NodeSpec => ({ id, type, x, y, config });
/** Edges from chains like "a>b>c". */
export const wire = (...chains: string[]) =>
  chains.flatMap((ch) => {
    const s = ch.split(">");
    return s.slice(1).map((t, i) => ({ source: s[i], target: t }));
  });

/** Common app-tier checks: LB entry, all servers reachable, capacity and CPU ceiling. */
export function appTier(rps: number, cpuMax: number): import("./types").Check[] {
  return [lbEntry(), serversBehindLb(), capacityAtLeast(rps, "the stated traffic"), cpuCeiling(rps, cpuMax)];
}

/** Case-insensitive "contains all" over a free-text config field. */
export const textHas = (value: unknown, ...needles: string[]) => {
  const v = String(value ?? "").toLowerCase().replace(/\s+/g, "");
  return needles.every((n) => v.includes(n.toLowerCase().replace(/\s+/g, "")));
};
