import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CanvasData,
  CanvasNode,
  CanvasEdge,
  CanvasTextNode,
  NodeSide,
} from "@scholaros/shared/src/canvas.js";
import {
  addEdge,
  addNode,
  createFileNode,
  createTextNode,
  duplicateNodes,
  getNodeColorStyle,
  removeNodes,
  updateNodeFields,
  COLOR_PRESETS,
  createEdge,
} from "@/lib/canvas-utils";
import { cn } from "@/lib/utils";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Type,
  Trash2,
  Copy,
  Palette,
  X,
} from "lucide-react";

interface CanvasViewProps {
  data: CanvasData;
  onDataChange?: (data: CanvasData) => void;
  readOnly?: boolean;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ZOOM_SENS = 0.001;
const GRID_SIZE = 24;

type Interaction =
  | { type: "idle" }
  | { type: "panning"; sx: number; sy: number; vx: number; vy: number }
  | { type: "dragging"; nodeId: string; ox: number; oy: number }
  | {
      type: "resizing";
      nodeId: string;
      handle: string;
      sx: number;
      sy: number;
      nx: number;
      ny: number;
      nw: number;
      nh: number;
    }
  | {
      type: "connecting";
      fromNode: string;
      fromSide: NodeSide;
      worldX: number;
      worldY: number;
    };

function worldPos(
  clientX: number,
  clientY: number,
  container: HTMLElement,
  viewport: { x: number; y: number; zoom: number },
) {
  const rect = container.getBoundingClientRect();
  return {
    x: (clientX - rect.left - viewport.x) / viewport.zoom,
    y: (clientY - rect.top - viewport.y) / viewport.zoom,
  };
}

function sideCenter(n: CanvasNode, side: NodeSide) {
  switch (side) {
    case "top":
      return { x: n.x + n.width / 2, y: n.y };
    case "right":
      return { x: n.x + n.width, y: n.y + n.height / 2 };
    case "bottom":
      return { x: n.x + n.width / 2, y: n.y + n.height };
    case "left":
      return { x: n.x, y: n.y + n.height / 2 };
  }
}

function sideDir(side: NodeSide) {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
  }
}

function closestSide(nx: number, ny: number, n: CanvasNode): NodeSide {
  const cx = n.x + n.width / 2;
  const cy = n.y + n.height / 2;
  const dx = nx - cx;
  const dy = ny - cy;
  const aw = n.width / 2;
  const ah = n.height / 2;
  const ox = dx / aw;
  const oy = dy / ah;
  if (Math.abs(ox) > Math.abs(oy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

const RESIZE_HANDLES = [
  { id: "nw", x: 0, y: 0, cx: -1, cy: -1 },
  { id: "n", x: 0.5, y: 0, cx: 0, cy: -1 },
  { id: "ne", x: 1, y: 0, cx: 1, cy: -1 },
  { id: "w", x: 0, y: 0.5, cx: -1, cy: 0 },
  { id: "e", x: 1, y: 0.5, cx: 1, cy: 0 },
  { id: "sw", x: 0, y: 1, cx: -1, cy: 1 },
  { id: "s", x: 0.5, y: 1, cx: 0, cy: 1 },
  { id: "se", x: 1, y: 1, cx: 1, cy: 1 },
];

const SIDES: NodeSide[] = ["top", "right", "bottom", "left"];

const HANDLE_SIZE = 8;
const DOT_SIZE = 10;

export function CanvasView({
  data,
  onDataChange,
  readOnly = false,
}: CanvasViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [history, setHistory] = useState<CanvasData[]>(() => [data]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
  } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const [interaction, setInteraction] = useState<Interaction>({ type: "idle" });
  const interactionRef = useRef<Interaction>({ type: "idle" });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const dataRef = useRef(data);
  dataRef.current = data;

  const nodes = data.nodes ?? [];
  const edges = data.edges ?? [];

  const commitMutation = useCallback(
    (next: CanvasData) => {
      if (!onDataChange || readOnly) return;
      const stack = history.slice(0, historyIdx + 1);
      stack.push(next);
      if (stack.length > 50) stack.shift();
      setHistory(stack);
      setHistoryIdx(stack.length - 1);
      onDataChange(next);
    },
    [history, historyIdx, onDataChange, readOnly],
  );

  const pushDataChange = useCallback(
    (next: CanvasData) => {
      if (!onDataChange || readOnly) return;
      onDataChange(next);
    },
    [onDataChange, readOnly],
  );

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const prev = history[historyIdx - 1];
    setHistoryIdx(historyIdx - 1);
    pushDataChange(prev);
  }, [history, historyIdx, pushDataChange]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const next = history[historyIdx + 1];
    setHistoryIdx(historyIdx + 1);
    pushDataChange(next);
  }, [history, historyIdx, pushDataChange]);

  // -- zoom / pan --
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const c = containerRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const delta = -e.deltaY * ZOOM_SENS;
      const nz = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, viewport.zoom * (1 + delta)),
      );
      const s = nz / viewport.zoom;
      setViewport({
        x: cx - (cx - viewport.x) * s,
        y: cy - (cy - viewport.y) * s,
        zoom: nz,
      });
    },
    [viewport],
  );

  const zoomTo = useCallback((factor: number) => {
    setViewport((v) => ({
      ...v,
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor)),
    }));
  }, []);

  const zoomToFit = useCallback(() => {
    if (nodes.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const c = containerRef.current;
    if (!c) return;
    const { width: cw, height: ch } = c.getBoundingClientRect();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + n.width > maxX) maxX = n.x + n.width;
      if (n.y + n.height > maxY) maxY = n.y + n.height;
    }
    const pad = 80;
    const bw = maxX - minX + pad * 2;
    const bh = maxY - minY + pad * 2;
    const zoom = Math.min(cw / bw, ch / bh, 1.5);
    setViewport({
      x: (cw - bw * zoom) / 2 + (minX - pad) * zoom,
      y: (ch - bh * zoom) / 2 + (minY - pad) * zoom,
      zoom,
    });
  }, [nodes]);

  // -- pointer --
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readOnly) return;
      const c = containerRef.current;
      if (!c) return;
      setContextMenu(null);
      setEditingNodeId(null);
      const currentViewport = viewportRef.current;
      const currentSelected = selectedIdsRef.current;
      const currentNodes = dataRef.current.nodes ?? [];

      const wp = worldPos(e.clientX, e.clientY, c, currentViewport);
      const target = e.target as HTMLElement;

      const setInteractionBoth = (val: Interaction) => {
        interactionRef.current = val;
        setInteraction(val);
      };

      const connectDot = target.closest("[data-connect-dot]");
      if (connectDot) {
        const nodeId = connectDot.getAttribute("data-node-id")!;
        const side = connectDot.getAttribute("data-side")! as NodeSide;
        setInteractionBoth({
          type: "connecting",
          fromNode: nodeId,
          fromSide: side,
          worldX: wp.x,
          worldY: wp.y,
        });
        e.stopPropagation();
        return;
      }

      const resizeHandle = target.closest("[data-resize-handle]");
      if (resizeHandle) {
        const nodeId = resizeHandle.getAttribute("data-node-id")!;
        const handle = resizeHandle.getAttribute("data-handle")!;
        const n = currentNodes.find((nd: CanvasNode) => nd.id === nodeId);
        if (!n) return;
        setInteractionBoth({
          type: "resizing",
          nodeId,
          handle,
          sx: e.clientX,
          sy: e.clientY,
          nx: n.x,
          ny: n.y,
          nw: n.width,
          nh: n.height,
        });
        setSelectedIds(new Set([nodeId]));
        e.stopPropagation();
        return;
      }

      const nodeEl = target.closest("[data-canvas-node]");
      if (nodeEl) {
        const nodeId = nodeEl.getAttribute("data-canvas-node")!;
        if (!currentSelected.has(nodeId)) {
          if (e.shiftKey) {
            setSelectedIds((prev) => new Set(prev).add(nodeId));
          } else {
            setSelectedIds(new Set([nodeId]));
          }
        } else if (e.shiftKey) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(nodeId);
            return next;
          });
        }
        const n = currentNodes.find((nd: CanvasNode) => nd.id === nodeId);
        if (n) {
          setInteractionBoth({
            type: "dragging",
            nodeId,
            ox: e.clientX / currentViewport.zoom - n.x,
            oy: e.clientY / currentViewport.zoom - n.y,
          });
        }
        e.stopPropagation();
        return;
      }

      setSelectedIds(new Set());
      setInteractionBoth({
        type: "panning",
        sx: e.clientX,
        sy: e.clientY,
        vx: currentViewport.x,
        vy: currentViewport.y,
      });
    },
    [readOnly],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (interactionRef.current.type === "idle") return;
      const c = containerRef.current;
      if (!c) return;
      const ict = interactionRef.current;
      const vp = viewportRef.current;
      const currentData = dataRef.current;
      const currentNodes = currentData.nodes ?? [];

      if (ict.type === "panning") {
        const dx = e.clientX - ict.sx;
        const dy = e.clientY - ict.sy;
        setViewport({ x: ict.vx + dx, y: ict.vy + dy, zoom: vp.zoom });
        return;
      }

      if (ict.type === "dragging") {
        const nx = Math.round(e.clientX / vp.zoom - ict.ox);
        const ny = Math.round(e.clientY / vp.zoom - ict.oy);
        const node = currentNodes.find((n) => n.id === ict.nodeId);
        if (!node) return;
        const diffX = nx - node.x;
        const diffY = ny - node.y;
        let updated = currentData;
        for (const id of selectedIdsRef.current) {
          const n = currentNodes.find((nd) => nd.id === id);
          if (n)
            updated = updateNodeFields(updated, id, {
              x: n.x + diffX,
              y: n.y + diffY,
            });
        }
        pushDataChange(updated);
        return;
      }

      if (ict.type === "resizing") {
        const dx = (e.clientX - ict.sx) / vp.zoom;
        const dy = (e.clientY - ict.sy) / vp.zoom;
        let { nx, ny, nw, nh } = ict;
        const h = ict.handle;
        if (h.includes("e")) nw = Math.max(80, ict.nw + dx);
        if (h.includes("w")) {
          nw = Math.max(80, ict.nw - dx);
          nx = ict.nx + dx;
        }
        if (h.includes("s")) nh = Math.max(40, ict.nh + dy);
        if (h.includes("n")) {
          nh = Math.max(40, ict.nh - dy);
          ny = ict.ny + dy;
        }
        pushDataChange(
          updateNodeFields(currentData, ict.nodeId, {
            x: Math.round(nx),
            y: Math.round(ny),
            width: Math.round(nw),
            height: Math.round(nh),
          }),
        );
        return;
      }

      if (ict.type === "connecting") {
        const wp = worldPos(e.clientX, e.clientY, c, vp);
        const next: Interaction = { ...ict, worldX: wp.x, worldY: wp.y };
        interactionRef.current = next;
        setInteraction(next);
        return;
      }
    },
    [pushDataChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const ict = interactionRef.current;
      const currentData = dataRef.current;
      const currentNodes = currentData.nodes ?? [];
      const vp = viewportRef.current;

      if (ict.type === "dragging") {
        pushDataChange(currentData);
        commitMutation(currentData);
      }
      if (ict.type === "resizing") {
        pushDataChange(currentData);
        commitMutation(currentData);
      }
      if (ict.type === "connecting") {
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const nodeEl = target?.closest("[data-canvas-node]");
        if (nodeEl) {
          const toId = nodeEl.getAttribute("data-canvas-node")!;
          if (toId !== ict.fromNode) {
            const toNode = currentNodes.find((n) => n.id === toId);
            if (toNode) {
              const c = containerRef.current;
              const wp = c
                ? worldPos(e.clientX, e.clientY, c, vp)
                : { x: 0, y: 0 };
              const side = closestSide(wp.x, wp.y, toNode);
              const edge = createEdge(ict.fromNode, toId, {
                fromSide: ict.fromSide,
                toSide: side,
              });
              commitMutation(addEdge(currentData, edge));
            }
          }
        }
      }
      interactionRef.current = { type: "idle" };
      setInteraction({ type: "idle" });
    },
    [commitMutation, pushDataChange],
  );

  const handleNodeDoubleClick = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      const node = nodes.find((n) => n.id === nodeId);
      if (node?.type === "text") setEditingNodeId(nodeId);
    },
    [nodes],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    const nodeEl = target.closest("[data-canvas-node]");
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId: nodeEl?.getAttribute("data-canvas-node") ?? undefined,
    });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-canvas-node]")) return;
      const c = containerRef.current;
      if (!c) return;
      const vp = viewportRef.current;
      const wp = worldPos(e.clientX, e.clientY, c, vp);
      const node = createTextNode("", wp.x - 150, wp.y - 30);
      commitMutation(addNode(data, node));
      setSelectedIds(new Set([node.id]));
      setEditingNodeId(node.id);
    },
    [data, commitMutation],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const c = containerRef.current;
      if (!c || readOnly) return;
      const vp = viewportRef.current;
      const wp = worldPos(e.clientX, e.clientY, c, vp);

      // Sidebar file drop (vault relative path)
      const vaultPath = e.dataTransfer.getData("text/x-scholaros-path");
      if (vaultPath) {
        const node = createFileNode(vaultPath, wp.x - 160, wp.y - 50);
        commitMutation(addNode(data, node));
        return;
      }

      // OS file drop
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleOSFileDrop(files, wp, data, commitMutation);
        return;
      }

      // URL drop
      const url = e.dataTransfer.getData("text/uri-list");
      if (url) {
        const node = createTextNode(url, wp.x - 150, wp.y - 30);
        commitMutation(addNode(data, node));
        return;
      }

      // Plain text fallback
      const text = e.dataTransfer.getData("text/plain");
      if (text) {
        const node = createTextNode(text, wp.x - 150, wp.y - 30);
        commitMutation(addNode(data, node));
      }
    },
    [data, readOnly, commitMutation],
  );

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    commitMutation(removeNodes(data, Array.from(selectedIds)));
    setSelectedIds(new Set());
  }, [data, selectedIds, commitMutation]);

  const duplicateSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    commitMutation(duplicateNodes(data, Array.from(selectedIds)));
  }, [data, selectedIds, commitMutation]);

  const setNodeColor = useCallback(
    (color: string) => {
      for (const id of selectedIds) {
        pushDataChange(
          updateNodeFields(dataRef.current, id, {
            color,
          } as Partial<CanvasNode>),
        );
      }
      commitMutation(dataRef.current);
      closeContextMenu();
    },
    [selectedIds, pushDataChange, commitMutation, closeContextMenu],
  );

  const clearNodeColor = useCallback(() => {
    for (const id of selectedIds) {
      pushDataChange(
        updateNodeFields(dataRef.current, id, { color: undefined }),
      );
    }
    commitMutation(dataRef.current);
    closeContextMenu();
  }, [selectedIds, pushDataChange, commitMutation, closeContextMenu]);

  const addTextNode = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const cx = (-viewport.x + rect.width / 2) / viewport.zoom;
    const cy = (-viewport.y + rect.height / 2) / viewport.zoom;
    const node = createTextNode("", cx - 150, cy - 90);
    commitMutation(addNode(data, node));
    setSelectedIds(new Set([node.id]));
    setEditingNodeId(node.id);
  }, [data, viewport, commitMutation]);

  // -- keyboard (uses refs to avoid re-registration on every state change) --
  const deleteSelectedRef = useRef(deleteSelected);
  deleteSelectedRef.current = deleteSelected;
  const duplicateSelectedRef = useRef(duplicateSelected);
  duplicateSelectedRef.current = duplicateSelected;
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  const closeContextMenuRef = useRef(closeContextMenu);
  closeContextMenuRef.current = closeContextMenu;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingNodeId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (contextMenu) {
          closeContextMenuRef.current();
          return;
        }
        deleteSelectedRef.current();
        e.preventDefault();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        undoRef.current();
        e.preventDefault();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        redoRef.current();
        e.preventDefault();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        duplicateSelectedRef.current();
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        setEditingNodeId(null);
        setSelectedIds(new Set());
        closeContextMenuRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editingNodeId, contextMenu]);

  // Prevent native wheel scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", prevent, { passive: false });
    return () => el.removeEventListener("wheel", prevent);
  }, []);

  const handleTextEditBlur = useCallback(
    (nodeId: string, text: string) => {
      commitMutation(
        updateNodeFields(dataRef.current, nodeId, {
          text,
        } as Partial<CanvasNode>),
      );
      setEditingNodeId(null);
    },
    [commitMutation],
  );

  const cursor =
    interaction.type === "panning"
      ? "grabbing"
      : interaction.type === "connecting"
        ? "crosshair"
        : interaction.type === "dragging"
          ? "move"
          : interaction.type === "resizing"
            ? "nw-resize"
            : "default";

  const selectedArr = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const selectedNode =
    selectedArr.length === 1
      ? nodes.find((n) => n.id === selectedArr[0])
      : null;

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden bg-background select-none"
      style={{ cursor }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleCanvasDoubleClick}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      {/* Grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--muted-foreground) 1.5px, transparent 1.5px)",
          backgroundSize: `${GRID_SIZE * viewport.zoom}px ${GRID_SIZE * viewport.zoom}px`,
          backgroundPosition: `${viewport.x % (GRID_SIZE * viewport.zoom)}px ${viewport.y % (GRID_SIZE * viewport.zoom)}px`,
          opacity: 0.35,
        }}
      />

      {/* Transform layer */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {/* SVG for edges */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                fill="var(--muted-foreground)"
              />
            </marker>
          </defs>
          {edges.map((edge) => (
            <EdgePath key={edge.id} edge={edge} nodes={nodes} />
          ))}
          {/* Ghost edge while connecting */}
          {interaction.type === "connecting" && (
            <GhostEdge
              fromNode={interaction.fromNode}
              fromSide={interaction.fromSide}
              toX={interaction.worldX}
              toY={interaction.worldY}
              nodes={nodes}
            />
          )}
        </svg>

        {/* Nodes */}
        {nodes.map((node) => (
          <NodeWrapper
            key={node.id}
            node={node}
            isSelected={selectedIds.has(node.id)}
            isEditing={editingNodeId === node.id}
            isHovered={hoveredNode === node.id}
            onClick={handleNodeClick(selectedIds, setSelectedIds)}
            onDoubleClick={handleNodeDoubleClick}
            onTextEditBlur={handleTextEditBlur}
            onHover={setHoveredNode}
            onNodeResize={(id, w, h) => {
              commitMutation(
                updateNodeFields(dataRef.current, id, {
                  width: w,
                  height: h,
                } as any),
              );
            }}
          />
        ))}
      </div>

      {/* Floating toolbar */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-border bg-background/90 backdrop-blur px-2 py-1.5 shadow-sm z-20"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => zoomTo(viewport.zoom * 1.25)}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="size-4" />
        </button>
        <button
          onClick={() => zoomToFit()}
          className="px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground min-w-[48px] text-center"
          title="Zoom to fit"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button
          onClick={() => zoomTo(viewport.zoom * 0.8)}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="size-4" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button
          onClick={addTextNode}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Add text note"
        >
          <Type className="size-4" />
        </button>
      </div>

      {/* Zoom indicator (bottom-right) */}
      <div className="absolute bottom-4 right-4 text-xs text-muted-foreground bg-background/80 backdrop-blur px-2 py-1 rounded border border-border z-20">
        {Math.round(viewport.zoom * 100)}%
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-30" onClick={closeContextMenu} />
          <div
            className="fixed z-40 min-w-[160px] rounded-lg border border-border bg-background shadow-lg py-1 animate-in fade-in zoom-in-95"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.nodeId ? (
              <>
                {selectedNode?.type === "text" && (
                  <ContextMenuItem
                    icon={<Type className="size-4" />}
                    label="Edit"
                    onClick={() => {
                      setEditingNodeId(contextMenu.nodeId!);
                      closeContextMenu();
                    }}
                  />
                )}
                <ContextMenuItem
                  icon={<Copy className="size-4" />}
                  label="Duplicate"
                  onClick={() => {
                    duplicateSelected();
                    closeContextMenu();
                  }}
                  shortcut="⌘D"
                />
                <ContextMenuItem
                  icon={<Trash2 className="size-4" />}
                  label="Delete"
                  onClick={() => {
                    deleteSelected();
                    closeContextMenu();
                  }}
                  shortcut="⌫"
                />
                <div className="h-px bg-border my-1" />
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <Palette className="size-3" />
                  Color
                </div>
                <div className="flex flex-wrap gap-1 px-3 pb-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setNodeColor(c.id)}
                      className="w-5 h-5 rounded-full border border-border hover:scale-110 transition-transform"
                      style={{ background: c.border }}
                      title={c.label}
                    />
                  ))}
                  <button
                    onClick={clearNodeColor}
                    className="w-5 h-5 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors"
                    title="No color"
                  >
                    <X className="size-3 text-muted-foreground" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <ContextMenuItem
                  icon={<Type className="size-4" />}
                  label="Add text note"
                  onClick={() => {
                    addTextNode();
                    closeContextMenu();
                  }}
                />
                <ContextMenuItem
                  icon={<Maximize2 className="size-4" />}
                  label="Zoom to fit"
                  onClick={() => {
                    zoomToFit();
                    closeContextMenu();
                  }}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function handleNodeClick(
  selectedIds: Set<string>,
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  return (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (e.shiftKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
    } else if (!selectedIds.has(nodeId)) {
      setSelectedIds(new Set([nodeId]));
    }
  };
}

// -- Sub-components --

function NodeWrapper({
  node,
  isSelected,
  isEditing,
  isHovered,
  onPointerDown,
  onClick,
  onDoubleClick,
  onTextEditBlur,
  onHover,
  onNodeResize,
}: {
  node: CanvasNode;
  isSelected: boolean;
  isEditing: boolean;
  isHovered: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent, id: string) => void;
  onDoubleClick: (e: React.MouseEvent, id: string) => void;
  onTextEditBlur: (id: string, text: string) => void;
  onHover: (id: string | null) => void;
  onNodeResize: (id: string, w: number, h: number) => void;
}) {
  const colorStyle = node.color ? getNodeColorStyle(node.color) : null;
  const showControls = isSelected && node.type !== "group";
  const isImg = isImageNode(node);

  return (
    <div
      data-canvas-node={node.id}
      className={cn(
        "absolute overflow-hidden",
        isImg ? "" : "rounded-lg border shadow-sm",
        isSelected && !isImg ? "ring-2 ring-primary" : "",
        isSelected && isImg ? "ring-1 ring-primary/50" : "",
        isHovered ? "ring-1 ring-accent/30" : "",
        node.type === "group"
          ? "border-dashed bg-muted/20"
          : colorStyle
            ? ""
            : isImg
              ? ""
              : "bg-background",
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        zIndex: isSelected ? 10 : 1,
        ...(colorStyle
          ? { backgroundColor: colorStyle.bg, borderColor: colorStyle.border }
          : {}),
      }}
      onClick={(e) => onClick(e, node.id)}
      onDoubleClick={(e) => onDoubleClick(e, node.id)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onPointerDown={(e) => {
        onPointerDown?.(e);
      }}
    >
      {/* Header bar for non-group, non-image nodes */}
      {node.type !== "group" && !isImg && (
        <div
          className="h-8 flex items-center px-3 text-xs font-medium text-muted-foreground border-b border-border/50 cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            e.stopPropagation();
            const event = new PointerEvent("pointerdown", {
              clientX: e.clientX,
              clientY: e.clientY,
              bubbles: true,
            });
            e.currentTarget.closest("[data-canvas-node]")?.dispatchEvent(event);
          }}
        >
          {node.type === "text" && "Text"}
          {node.type === "file" &&
            ((node as any).file?.split("/").pop() ?? "File")}
          {node.type === "link" && "Link"}
        </div>
      )}

      {/* Content */}
      <div
        className={cn(
          node.type !== "group" && !isImg ? "h-[calc(100%-32px)]" : "h-full",
        )}
      >
        {node.type === "text" && (
          <TextNodeContent
            node={node}
            isEditing={isEditing}
            onBlur={onTextEditBlur}
          />
        )}
        {node.type === "file" && (
          <FileNodeContent
            node={node as any}
            onNodeResize={(w, h) => onNodeResize(node.id, w, h)}
          />
        )}
        {node.type === "link" && <LinkNodeContent node={node as any} />}
        {node.type === "group" && <GroupNodeContent node={node} />}
      </div>

      {/* Resize handles */}
      {showControls &&
        RESIZE_HANDLES.map((h) => (
          <div
            key={h.id}
            data-resize-handle
            data-node-id={node.id}
            data-handle={h.id}
            className="absolute z-20 bg-background border border-border rounded-sm shadow-sm hover:bg-accent"
            style={{
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              left: `calc(${h.x * 100}% - ${HANDLE_SIZE / 2}px)`,
              top: `calc(${h.y * 100}% - ${HANDLE_SIZE / 2}px)`,
              cursor:
                h.cx === 0 && h.cy === 0
                  ? "nw-resize"
                  : h.cx === 0
                    ? "ns-resize"
                    : h.cy === 0
                      ? "ew-resize"
                      : h.cx === h.cy
                        ? "nw-resize"
                        : "ne-resize",
            }}
          />
        ))}

      {/* Connector dots */}
      {showControls &&
        SIDES.map((side) => {
          const pt = sideCenter(node, side);
          return (
            <div
              key={side}
              data-connect-dot
              data-node-id={node.id}
              data-side={side}
              className="absolute z-20 rounded-full bg-primary border-2 border-background cursor-crosshair hover:scale-125 transition-transform"
              style={{
                width: DOT_SIZE,
                height: DOT_SIZE,
                left: pt.x - node.x - DOT_SIZE / 2,
                top: pt.y - node.y - DOT_SIZE / 2,
              }}
            />
          );
        })}
    </div>
  );
}

function TextNodeContent({
  node,
  isEditing,
  onBlur,
}: {
  node: CanvasTextNode;
  isEditing: boolean;
  onBlur: (id: string, text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(node.text);

  useEffect(() => {
    if (isEditing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [isEditing]);

  const save = useCallback(() => {
    if (valueRef.current !== node.text) {
      onBlur(node.id, valueRef.current);
    }
  }, [node.id, node.text, onBlur]);

  // Save when editing ends (catches cases where blur event doesn't fire)
  const prevEditing = useRef(isEditing);
  useEffect(() => {
    if (prevEditing.current && !isEditing) {
      save();
    }
    prevEditing.current = isEditing;
  }, [isEditing, save]);

  if (isEditing) {
    return (
      <textarea
        ref={ref}
        defaultValue={node.text}
        onChange={(e) => {
          valueRef.current = e.target.value;
        }}
        onBlur={(e) => {
          valueRef.current = e.target.value;
          onBlur(node.id, e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.currentTarget.blur();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.currentTarget.blur();
          }
        }}
        className="w-full h-full bg-transparent text-sm p-3 resize-none outline-none border-none focus:ring-0"
        autoFocus
      />
    );
  }

  return (
    <div className="p-3 text-sm whitespace-pre-wrap break-words h-full overflow-auto">
      {node.text || (
        <span className="text-muted-foreground italic">
          Empty note — double-click to edit
        </span>
      )}
    </div>
  );
}

const imageExts = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
]);
const imageCache = new Map<string, string>();

function isImageNode(node: CanvasNode): boolean {
  if (node.type !== "file") return false;
  const fileName = (node as any).file?.split("/").pop() ?? "";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return imageExts.has(ext);
}

const MAX_IMG_W = 800;
const MAX_IMG_H = 600;

function ImagePreview({
  filePath,
  onResize,
}: {
  filePath: string;
  onResize?: (w: number, h: number) => void;
}) {
  const [src, setSrc] = useState<string | null>(
    imageCache.get(filePath) ?? null,
  );

  useEffect(() => {
    if (src) return;
    const { ipc } = window;
    if (!ipc) return;
    ipc
      .invoke("workspace:readFile", { path: filePath, encoding: "base64" })
      .then((result: any) => {
        const b64 = result?.data;
        if (!b64) return;
        const ext = filePath.split(".").pop()?.toLowerCase() ?? "png";
        const mime =
          ext === "svg"
            ? "image/svg+xml"
            : `image/${ext === "jpg" ? "jpeg" : ext}`;
        const dataUrl = `data:${mime};base64,${b64}`;
        imageCache.set(filePath, dataUrl);
        setSrc(dataUrl);
      })
      .catch(() => {});
  }, [filePath, src]);

  const handleImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_IMG_W || h > MAX_IMG_H) {
        const scale = Math.min(MAX_IMG_W / w, MAX_IMG_H / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      onResize?.(w, h);
    },
    [onResize],
  );

  if (!src) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Loading...
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="w-full h-full object-contain"
      onLoad={handleImgLoad}
    />
  );
}

function FileNodeContent({
  node,
  onNodeResize,
}: {
  node: any;
  onNodeResize?: (w: number, h: number) => void;
}) {
  const fileName = node.file?.split("/").pop() ?? "File";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (imageExts.has(ext)) {
    return <ImagePreview filePath={node.file} onResize={onNodeResize} />;
  }

  return (
    <div className="p-3 text-sm flex flex-col gap-1 h-full overflow-auto">
      <div className="font-medium text-foreground truncate">{fileName}</div>
      <div className="text-muted-foreground text-xs truncate">{node.file}</div>
    </div>
  );
}

function LinkNodeContent({ node }: { node: any }) {
  let hostname = node.url || "";
  try {
    hostname = new URL(node.url).hostname;
  } catch {
    // keep as-is
  }
  return (
    <div className="p-3 text-sm flex flex-col gap-1 h-full overflow-auto">
      <div className="font-medium text-foreground truncate">{hostname}</div>
      <div className="text-muted-foreground text-xs truncate break-all">
        {node.url}
      </div>
    </div>
  );
}

function GroupNodeContent({ node }: { node: CanvasNode & { label?: string } }) {
  return (
    <>
      {node.label && (
        <div className="absolute -top-6 left-2 text-xs font-medium text-muted-foreground px-1.5 py-0.5 rounded bg-background border border-border/50">
          {node.label}
        </div>
      )}
    </>
  );
}

function EdgePath({ edge, nodes }: { edge: CanvasEdge; nodes: CanvasNode[] }) {
  const from = nodes.find((n) => n.id === edge.fromNode);
  const to = nodes.find((n) => n.id === edge.toNode);
  if (!from || !to) return null;

  const fromSide =
    edge.fromSide ??
    closestSide(to.x + to.width / 2, to.y + to.height / 2, from);
  const toSide =
    edge.toSide ??
    closestSide(from.x + from.width / 2, from.y + from.height / 2, to);

  const fp = sideCenter(from, fromSide);
  const tp = sideCenter(to, toSide);
  const dx = Math.abs(tp.x - fp.x);
  const dy = Math.abs(tp.y - fp.y);
  const cp = Math.max(50, Math.max(dx, dy) * 0.45);

  const fd = sideDir(fromSide);
  const td = sideDir(toSide);

  const d = `M ${fp.x} ${fp.y} C ${fp.x + fd.x * cp} ${fp.y + fd.y * cp}, ${tp.x + td.x * cp} ${tp.y + td.y * cp}, ${tp.x} ${tp.y}`;

  const colorStyle = edge.color ? getNodeColorStyle(edge.color) : null;

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={colorStyle?.border ?? "var(--muted-foreground)"}
        strokeWidth={1.5}
        strokeOpacity={0.6}
        markerEnd={edge.toEnd !== "none" ? "url(#arrowhead)" : undefined}
      />
      {edge.label && (
        <text
          x={(fp.x + tp.x) / 2}
          y={(fp.y + tp.y) / 2 - 6}
          textAnchor="middle"
          className="text-[11px] fill-muted-foreground"
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

function GhostEdge({
  fromNode,
  fromSide,
  toX,
  toY,
  nodes,
}: {
  fromNode: string;
  fromSide: NodeSide;
  toX: number;
  toY: number;
  nodes: CanvasNode[];
}) {
  const from = nodes.find((n) => n.id === fromNode);
  if (!from) return null;
  const fp = sideCenter(from, fromSide);
  const dx = Math.abs(toX - fp.x);
  const cp = Math.max(50, dx * 0.4);
  const fd = sideDir(fromSide);
  return (
    <path
      d={`M ${fp.x} ${fp.y} C ${fp.x + fd.x * cp} ${fp.y + fd.y * cp}, ${toX} ${toY}, ${toX} ${toY}`}
      fill="none"
      stroke="var(--primary)"
      strokeWidth={1.5}
      strokeDasharray="6 4"
      strokeOpacity={0.6}
    />
  );
}

async function handleOSFileDrop(
  files: FileList,
  dropPos: { x: number; y: number },
  currentData: CanvasData,
  commit: (data: CanvasData) => void,
) {
  const { ipc } = window;
  if (!ipc) return;

  await ipc
    .invoke("workspace:mkdir", { path: "attachments", recursive: true })
    .catch(() => {});

  let data = currentData;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const rawName = file.name;

    let name = rawName;
    let attachPath = `attachments/${name}`;
    let counter = 0;
    while (counter < 100) {
      const exists = await ipc.invoke("workspace:exists", { path: attachPath });
      if (!exists.exists) break;
      counter++;
      const dot = rawName.lastIndexOf(".");
      const base = dot > 0 ? rawName.slice(0, dot) : rawName;
      const ext = dot > 0 ? rawName.slice(dot) : "";
      name = `${base}-${counter}${ext}`;
      attachPath = `attachments/${name}`;
    }

    const base64 = await readFileAsBase64(file);
    if (!base64) continue;

    await ipc.invoke("workspace:writeFile", {
      path: attachPath,
      data: base64,
      opts: { encoding: "base64" },
    });

    const node = createFileNode(
      attachPath,
      dropPos.x + i * 40 - 160,
      dropPos.y + i * 40 - 50,
    );
    data = addNode(data, node);
  }

  if (data !== currentData) {
    commit(data);
  }
}

function readFileAsBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function ContextMenuItem({
  icon,
  label,
  onClick,
  shortcut,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors text-left"
    >
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-xs text-muted-foreground">{shortcut}</span>
      )}
    </button>
  );
}

export default CanvasView;
