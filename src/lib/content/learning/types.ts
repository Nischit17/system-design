/** Long-form learning guide content model. One guide per roadmap section. */

export type Tone = "info" | "success" | "warning" | "danger" | "accent" | "neutral";

export type Block =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "key"; text: string; label?: string }
  | { type: "warn"; text: string; label?: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "terms"; items: [string, string][] }
  | { type: "formula"; lines: string[]; caption?: string }
  | { type: "table"; head: string[]; rows: string[][]; caption?: string }
  /** Request/data path drawn as connected boxes. */
  | { type: "flow"; steps: { label: string; sub?: string; tone?: Tone }[]; caption: string; vertical?: boolean }
  /** Side-by-side comparison panels. */
  | { type: "compare"; items: { title: string; tone?: Tone; points: string[] }[]; caption?: string }
  /** Horizontal bars, e.g. utilization per server. */
  | { type: "bars"; items: { label: string; value: number; max?: number; tone?: Tone; note?: string }[]; caption: string; unit?: string }
  | { type: "widget"; name: WidgetName; caption?: string };

export type WidgetName = "capacity-calculator" | "lb-demo" | "littles-law" | "cache-hit" | "queue-drain" | "replica-lag" | "shard-skew" | "retry-storm";

export interface Chapter {
  id: string;
  kicker: string;
  title: string;
  /** Short label used in the "What's in this guide" list and sidebar. */
  navTitle: string;
  summary: string;
  intro: string[];
  blocks: Block[];
}

export interface Guide {
  sectionId: string;
  kicker: string;
  title: string;
  intro: string;
  byTheEnd: string;
  chapters: Chapter[];
}
