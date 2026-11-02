import { defaultConfigFor, getComponent, type Category, type ConfigValue } from "@/lib/catalog/components";

export interface GraphNode {
  id: string;
  type: string;
  category: Category;
  x: number;
  y: number;
  config: Record<string, ConfigValue>;
  locked?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Compact authoring format used by problem definitions. */
export interface GraphSpec {
  nodes: { id: string; type: string; x: number; y: number; config?: Record<string, ConfigValue>; locked?: boolean }[];
  edges: { source: string; target: string }[];
}

export const EMPTY_GRAPH: Graph = { nodes: [], edges: [] };
export const NODE_WIDTH = 208;
export const NODE_HEIGHT = 68;

let seq = 0;
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function createNode(type: string, x: number, y: number): GraphNode | null {
  const def = getComponent(type);
  if (!def) return null;
  return { id: uid("node"), type, category: def.category, x, y, config: defaultConfigFor(type) };
}

export function duplicateNode(node: GraphNode): GraphNode {
  return { ...node, id: uid("node"), x: node.x + 40, y: node.y + 40, config: { ...node.config }, locked: undefined };
}

export function connect(graph: Graph, source: string, target: string): Graph {
  if (source === target || graph.edges.some((e) => e.source === source && e.target === target)) return graph;
  return { ...graph, edges: [...graph.edges, { id: uid("edge"), source, target }] };
}

export function removeNode(graph: Graph, id: string): Graph {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node || node.locked) return graph;
  return {
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
  };
}

export function removeEdge(graph: Graph, id: string): Graph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== id) };
}

export function graphFromSpec(spec: GraphSpec, idPrefix = ""): Graph {
  return {
    nodes: spec.nodes.flatMap((n) => {
      const def = getComponent(n.type);
      if (!def) return [];
      return [
        {
          id: idPrefix + n.id,
          type: n.type,
          category: def.category,
          x: n.x,
          y: n.y,
          config: { ...defaultConfigFor(n.type), ...(n.config ?? {}) },
          locked: n.locked || undefined,
        },
      ];
    }),
    edges: spec.edges.map((e, i) => ({ id: `${idPrefix}edge-${i}`, source: idPrefix + e.source, target: idPrefix + e.target })),
  };
}
