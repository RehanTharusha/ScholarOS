/**
 * Incremental file-tree patcher.
 *
 * Maintains a `Map<path, TreeNode>` alongside the rendered tree array.
 * The `applyTreePatch` function mutates the map in response to a single
 * `workspace:didChange` event and re-derives the sorted root array.
 *
 * This replaces the previous "call `loadDirectory()` again on every
 * change" pattern, which did a full recursive readdir + stat on every
 * create / delete / move — proportional to vault size, blocking on
 * the main thread. With this in place, single-file changes cost
 * O(depth) regardless of vault size.
 */
import type { DirEntry } from "@scholaros/shared";

export interface TreeNode extends DirEntry {
  children?: TreeNode[];
  loaded?: boolean;
}

export type TreePatchEvent =
  | { type: "created"; path: string; kind: "file" | "dir" }
  | { type: "deleted"; path: string; kind: "file" | "dir" }
  | { type: "moved"; from: string; to: string }
  | { type: "bulkChanged"; paths?: string[] };

function compareNodes(a: TreeNode, b: TreeNode): number {
  // Directories first, then alphabetical.
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  const sorted = nodes.slice().sort(compareNodes);
  for (const n of sorted) {
    if (n.children) n.children = sortNodes(n.children);
  }
  return sorted;
}

function parts(path: string): string[] {
  return path.split("/");
}

function parentPath(path: string): string | null {
  const p = parts(path);
  if (p.length <= 1) return null;
  return p.slice(0, -1).join("/");
}

function ensureNodeChildren(node: TreeNode): TreeNode[] {
  if (!node.children) node.children = [];
  return node.children;
}

function removeFromParent(map: Map<string, TreeNode>, childPath: string) {
  const parent = parentPath(childPath);
  if (parent === null) return;
  const parentNode = map.get(parent);
  if (!parentNode?.children) return;
  parentNode.children = parentNode.children.filter((c) => c.path !== childPath);
}

function addToParent(map: Map<string, TreeNode>, childPath: string) {
  const parent = parentPath(childPath);
  if (parent === null) return;
  const parentNode = map.get(parent);
  if (!parentNode) return;
  const children = ensureNodeChildren(parentNode);
  // Insert if not already there (defensive)
  if (!children.some((c) => c.path === childPath)) {
    children.push({ path: childPath, name: parts(childPath).pop()!, kind: "file" } as TreeNode);
  }
}

/**
 * Apply a single patch event to the treeMap. Returns true if the
 * map changed (caller should bump a render counter to push the new
 * root array to React).
 */
export function applyTreePatch(
  map: Map<string, TreeNode>,
  event: TreePatchEvent,
  stat?: (path: string) => Promise<DirEntry | null>,
): boolean {
  switch (event.type) {
    case "created": {
      if (map.has(event.path)) return false;
      const entry: TreeNode = {
        path: event.path,
        name: parts(event.path).pop()!,
        kind: event.kind,
        children: event.kind === "dir" ? [] : undefined,
        loaded: false,
      } as TreeNode;
      map.set(event.path, entry);
      addToParent(map, event.path);
      // Optionally: stat the new node to fill in mtime etc.
      if (stat) {
        stat(event.path)
          .then((e) => {
            if (e) {
              const n = map.get(event.path);
              if (n) Object.assign(n, e);
            }
          })
          .catch(() => {});
      }
      return true;
    }
    case "deleted": {
      if (!map.has(event.path)) return false;
      map.delete(event.path);
      removeFromParent(map, event.path);
      return true;
    }
    case "moved": {
      const node = map.get(event.from);
      if (!node) return false;
      map.delete(event.from);
      const updated: TreeNode = {
        ...node,
        path: event.to,
        name: parts(event.to).pop()!,
      };
      map.set(event.to, updated);
      removeFromParent(map, event.from);
      addToParent(map, event.to);
      return true;
    }
    case "bulkChanged": {
      // We do not have per-event metadata for bulkChanged; caller
      // should fall back to a full reload in that case.
      return false;
    }
  }
}

/**
 * Re-derive the sorted root array from the treeMap. Call this after
 * any series of applyTreePatch() invocations to get a renderable list.
 */
export function rebuildRoots(map: Map<string, TreeNode>): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    if (parentPath(node.path) === null) {
      roots.push(node);
    }
  }
  return sortNodes(roots);
}
