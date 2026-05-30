/**
 * JSON Canvas 1.0 type definitions.
 * Spec: https://jsoncanvas.org/spec/1.0/
 */

/** The side of a node that an edge connects to */
export type NodeSide = "top" | "right" | "bottom" | "left";

/** What to display at the end of an edge */
export type EdgeEnd = "none" | "arrow";

/** Background image rendering style for group nodes */
export type BackgroundStyle = "cover" | "ratio" | "repeat" | "center";

/**
 * Color for nodes and edges.
 * Can be a preset number ("1"-"6") or a hex color string ("#FF0000").
 */
export type CanvasColor = string;

/** Common attributes for all node types */
export interface CanvasNodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
}

/** A node that contains text with Markdown syntax */
export interface CanvasTextNode extends CanvasNodeBase {
  type: "text";
  text: string;
}

/** A node that references a file in the vault */
export interface CanvasFileNode extends CanvasNodeBase {
  type: "file";
  file: string;
  /** Optional subpath linking to a heading or block. Always starts with "#" */
  subpath?: string;
}

/** A node that references an external URL */
export interface CanvasLinkNode extends CanvasNodeBase {
  type: "link";
  url: string;
}

/** A node that acts as a visual container for other nodes */
export interface CanvasGroupNode extends CanvasNodeBase {
  type: "group";
  label?: string;
  background?: string;
  backgroundStyle?: BackgroundStyle;
}

/** Any canvas node */
export type CanvasNode =
  | CanvasTextNode
  | CanvasFileNode
  | CanvasLinkNode
  | CanvasGroupNode;

/** An edge connecting two nodes */
export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: NodeSide;
  fromEnd?: EdgeEnd;
  toNode: string;
  toSide?: NodeSide;
  toEnd?: EdgeEnd;
  color?: CanvasColor;
  label?: string;
}

/** The root data structure stored in .canvas files */
export interface CanvasData {
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
}
