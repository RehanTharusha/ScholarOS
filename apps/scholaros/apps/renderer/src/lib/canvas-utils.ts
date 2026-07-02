import { nanoid } from "nanoid";
import type {
  CanvasData,
  CanvasNode,
  CanvasEdge,
  CanvasTextNode,
  CanvasFileNode,
  CanvasLinkNode,
  CanvasGroupNode,
  NodeSide,
} from "@scholaros/shared/src/canvas.js";

export type { CanvasData, CanvasNode, CanvasEdge, NodeSide };

export function parseCanvas(json: string): CanvasData {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    const nodes = Array.isArray(data.nodes)
      ? (data.nodes as CanvasNode[]).filter(isValidNode)
      : [];
    const edges = Array.isArray(data.edges)
      ? (data.edges as CanvasEdge[]).filter(isValidEdge)
      : [];
    return { nodes, edges };
  } catch {
    return { nodes: [], edges: [] };
  }
}

export function serializeCanvas(data: CanvasData): string {
  return JSON.stringify(data, null, 2);
}

export function createEmptyCanvas(): CanvasData {
  return { nodes: [], edges: [] };
}

export function createTextNode(
  text: string,
  x: number,
  y: number,
): CanvasTextNode {
  return { id: nanoid(), type: "text", text, x, y, width: 300, height: 180 };
}

export function createFileNode(
  file: string,
  x: number,
  y: number,
): CanvasFileNode {
  return { id: nanoid(), type: "file", file, x, y, width: 320, height: 240 };
}

export function createLinkNode(
  url: string,
  x: number,
  y: number,
): CanvasLinkNode {
  return { id: nanoid(), type: "link", url, x, y, width: 300, height: 160 };
}

export function createGroupNode(
  x: number,
  y: number,
  label?: string,
): CanvasGroupNode {
  return { id: nanoid(), type: "group", x, y, width: 500, height: 400, label };
}

export function createEdge(
  fromNode: string,
  toNode: string,
  options?: {
    fromSide?: CanvasEdge["fromSide"];
    toSide?: CanvasEdge["toSide"];
    label?: string;
  },
): CanvasEdge {
  return {
    id: nanoid(),
    fromNode,
    toNode,
    fromSide: options?.fromSide,
    toSide: options?.toSide,
    label: options?.label,
  };
}

// --- Mutation helpers ---

export function addNode(data: CanvasData, node: CanvasNode): CanvasData {
  return { ...data, nodes: [...(data.nodes ?? []), node] };
}

export function addEdge(data: CanvasData, edge: CanvasEdge): CanvasData {
  return { ...data, edges: [...(data.edges ?? []), edge] };
}

export function removeNodes(
  data: CanvasData,
  ids: string[],
): CanvasData {
  const idSet = new Set(ids);
  return {
    nodes: (data.nodes ?? []).filter((n) => !idSet.has(n.id)),
    edges: (data.edges ?? []).filter(
      (e) => !idSet.has(e.fromNode) && !idSet.has(e.toNode),
    ),
  };
}

export function removeEdges(
  data: CanvasData,
  ids: string[],
): CanvasData {
  const idSet = new Set(ids);
  return { ...data, edges: (data.edges ?? []).filter((e) => !idSet.has(e.id)) };
}

export function updateNodeFields(
  data: CanvasData,
  id: string,
  fields: Partial<CanvasNode>,
): CanvasData {
  return {
    ...data,
    nodes: (data.nodes ?? []).map((n) =>
      n.id === id ? { ...n, ...fields } : n,
    ) as CanvasNode[],
  };
}

export function duplicateNodes(
  data: CanvasData,
  ids: string[],
  offset = 40,
): CanvasData {
  const idMap = new Map<string, string>();
  const newNodes: CanvasNode[] = [];
  for (const n of data.nodes ?? []) {
    if (!ids.includes(n.id)) continue;
    const newId = nanoid();
    idMap.set(n.id, newId);
    newNodes.push({ ...n, id: newId, x: n.x + offset, y: n.y + offset });
  }
  const newEdges: CanvasEdge[] = [];
  for (const e of data.edges ?? []) {
    const newFrom = idMap.get(e.fromNode);
    const newTo = idMap.get(e.toNode);
    if (newFrom && newTo) {
      newEdges.push({ ...e, id: nanoid(), fromNode: newFrom, toNode: newTo });
    }
  }
  return {
    nodes: [...(data.nodes ?? []), ...newNodes],
    edges: [...(data.edges ?? []), ...newEdges],
  };
}

// --- Color system (Obsidian preset colors) ---

const PRESET_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  "1": { bg: "rgba(255, 100, 100, 0.12)", border: "rgb(255, 100, 100)", label: "Red" },
  "2": { bg: "rgba(255, 165, 60, 0.12)", border: "rgb(255, 165, 60)", label: "Orange" },
  "3": { bg: "rgba(255, 220, 70, 0.12)", border: "rgb(255, 220, 70)", label: "Yellow" },
  "4": { bg: "rgba(100, 210, 100, 0.12)", border: "rgb(100, 210, 100)", label: "Green" },
  "5": { bg: "rgba(80, 200, 230, 0.12)", border: "rgb(80, 200, 230)", label: "Cyan" },
  "6": { bg: "rgba(180, 130, 255, 0.12)", border: "rgb(180, 130, 255)", label: "Purple" },
};

export function getNodeColorStyle(color?: string): {
  bg: string;
  border: string;
} {
  if (!color) return { bg: "", border: "" };
  const preset = PRESET_COLORS[color];
  if (preset) return { bg: preset.bg, border: preset.border };
  // Hex color
  return {
    bg: color + "1F",
    border: color,
  };
}

export const COLOR_PRESETS = Object.entries(PRESET_COLORS).map(
  ([id, c]) => ({ id, ...c }),
);

// --- Validation ---

function isValidNode(node: unknown): node is CanvasNode {
  if (typeof node !== "object" || node === null) return false;
  const n = node as Record<string, unknown>;
  if (typeof n.id !== "string") return false;
  if (typeof n.x !== "number" || typeof n.y !== "number") return false;
  if (typeof n.width !== "number" || typeof n.height !== "number") return false;
  if (!["text", "file", "link", "group"].includes(n.type as string))
    return false;
  if (n.type === "text" && typeof n.text !== "string") return false;
  if (n.type === "file" && typeof n.file !== "string") return false;
  if (n.type === "link" && typeof n.url !== "string") return false;
  return true;
}

function isValidEdge(edge: unknown): edge is CanvasEdge {
  if (typeof edge !== "object" || edge === null) return false;
  const e = edge as Record<string, unknown>;
  if (typeof e.id !== "string") return false;
  if (typeof e.fromNode !== "string") return false;
  if (typeof e.toNode !== "string") return false;
  return true;
}
