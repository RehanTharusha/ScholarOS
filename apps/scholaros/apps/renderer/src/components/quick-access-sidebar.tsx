"use client";

import * as React from "react";
import { useState, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  File,
  FileText,
  Folder,
  GripVertical,
  Image,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import type { QuickAccessItem } from "@/hooks/useQuickAccess";

interface QuickAccessSidebarProps {
  items: QuickAccessItem[];
  expandedPaths?: Set<string>;
  onSelectFile: (path: string, kind: "file" | "dir") => void;
  onEnsureFolderExpanded: (path: string) => void;
  onToggleFolder?: (path: string) => void;
  onRemove: (id: string) => Promise<void>;
  onRename: (id: string, customName: string | null) => Promise<void>;
  onReorder: (items: QuickAccessItem[]) => Promise<void>;
  onValidateItem?: (item: QuickAccessItem) => Promise<boolean>;
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"]);

function fileIcon(path: string) {
  const ext = path.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  if (ext === ".md") return <FileText className="size-3.5 text-sidebar-foreground/60" />;
  if (ext && IMAGE_EXTS.has(ext)) return <Image className="size-3.5 text-sidebar-foreground/60" />;
  return <File className="size-3.5 text-sidebar-foreground/60" />;
}

function QuickAccessItemRow({
  item,
  expandedPaths,
  onSelectFile,
  onEnsureFolderExpanded,
  onToggleFolder,
  onRemove,
  onRename,
  onValidateItem,
}: {
  item: QuickAccessItem;
  expandedPaths?: Set<string>;
  onSelectFile: (path: string, kind: "file" | "dir") => void;
  onEnsureFolderExpanded: (path: string) => void;
  onToggleFolder?: (path: string) => void;
  onRemove: (id: string) => Promise<void>;
  onRename: (id: string, customName: string | null) => Promise<void>;
  onValidateItem?: (item: QuickAccessItem) => Promise<boolean>;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(
    item.customName || item.name,
  );
  const [isRowHovered, setIsRowHovered] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const displayName = item.customName || item.name;
  const isCourse = item.type === "course" || item.type === "detected";
  const isFile = item.path.includes(".") && !item.path.endsWith("/");
  const isExpanded = expandedPaths?.has(item.path) ?? false;

  const handleClick = useCallback(async () => {
    if (onValidateItem) {
      const valid = await onValidateItem(item);
      if (!valid) return;
    }
    if (isFile) {
      onSelectFile(item.path, "file");
    } else if (isExpanded && onToggleFolder) {
      onToggleFolder(item.path);
    } else {
      onEnsureFolderExpanded(item.path);
    }
  }, [isFile, isExpanded, item.path, onEnsureFolderExpanded, onSelectFile, onToggleFolder, onValidateItem, item]);

  const handleRenameSubmit = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== (item.customName || item.name)) {
      await onRename(item.id, trimmed);
    } else if (!trimmed) {
      await onRename(item.id, null);
    }
    setIsRenaming(false);
  }, [renameValue, item, onRename]);

  const row = (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setIsRowHovered(true)}
      onMouseLeave={() => setIsRowHovered(false)}
      onClick={handleClick}
      className={`flex items-center gap-1 px-2 py-1 rounded-sm text-xs cursor-pointer
        hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground
        ${isDragging ? "z-50" : ""}`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className={`cursor-grab active:cursor-grabbing text-sidebar-foreground/30 hover:text-sidebar-foreground/60 shrink-0 p-0.5 transition-opacity ${
          isRowHovered ? "opacity-100" : "opacity-0"
        }`}
        tabIndex={-1}
      >
        <GripVertical className="size-3.5" />
      </button>
      <span className="shrink-0 size-4 flex items-center justify-center">
        {isCourse ? (
          <span
            className="size-2.5 rounded-full shrink-0"
            style={{ backgroundColor: item.color || "#3B82F6" }}
          />
        ) : isFile ? (
          fileIcon(item.path)
        ) : (
          <Folder className="size-3.5 text-sidebar-foreground/60" />
        )}
      </span>
      {isRenaming ? (
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRenameSubmit();
            if (e.key === "Escape") {
              setRenameValue(item.customName || item.name);
              setIsRenaming(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-5 px-1 py-0 text-xs flex-1 min-w-0"
          autoFocus
        />
      ) : (
        <span className="flex-1 min-w-0 truncate text-xs">
          {displayName}
        </span>
      )}
    </div>
  );

  if (isRenaming) return row;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {row}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            setRenameValue(item.customName || item.name);
            setIsRenaming(true);
          }}
        >
          <Pencil className="mr-2 size-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={(e) => {
            e.stopPropagation();
            void onRemove(item.id);
          }}
        >
          <Trash2 className="mr-2 size-4" />
          Remove
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function QuickAccessSidebar({
  items,
  expandedPaths,
  onSelectFile,
  onEnsureFolderExpanded,
  onToggleFolder,
  onRemove,
  onRename,
  onReorder,
  onValidateItem,
}: QuickAccessSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("scholaros-quick-access-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem("scholaros-quick-access-collapsed", String(isCollapsed));
    } catch {
      // ignore
    }
  }, [isCollapsed]);

  const [contentHeight, setContentHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [items]);

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = [...items];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      void onReorder(reordered);
    },
    [items, onReorder],
  );

  const activeItem = activeId
    ? items.find((i) => i.id === activeId)
    : null;

  if (items.length === 0) return null;

  return (
    <div className="border-b border-sidebar-border">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-1 w-full px-2 py-1 cursor-pointer hover:bg-sidebar-accent/50 select-none text-left"
      >
        <ChevronRight
          className={`size-3.5 text-sidebar-foreground/50 transition-transform ${
            !isCollapsed ? "rotate-90" : ""
          }`}
        />
        <span className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider">
          Quick Access
        </span>
      </button>
      <div
        className="overflow-hidden transition-all duration-150 ease-[cubic-bezier(0.2,0.9,0.2,1)]"
        style={{
          maxHeight: isCollapsed ? "0px" : contentHeight !== null ? `${contentHeight}px` : undefined,
          opacity: isCollapsed ? 0 : 1,
        }}
      >
        <div ref={contentRef}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {items.map((item) => (
                <QuickAccessItemRow
                  key={item.id}
                  item={item}
                  expandedPaths={expandedPaths}
                  onSelectFile={onSelectFile}
                  onEnsureFolderExpanded={onEnsureFolderExpanded}
                  onToggleFolder={onToggleFolder}
                  onRemove={onRemove}
                  onRename={onRename}
                  onValidateItem={onValidateItem}
                />
              ))}
            </SortableContext>
            <DragOverlay>
              {activeItem && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-sidebar-accent shadow-md text-sm text-sidebar-foreground">
                  {activeItem.type === "course" || activeItem.type === "detected" ? (
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: activeItem.color || "#3B82F6" }}
                    />
                  ) : activeItem.path.includes(".") && !activeItem.path.endsWith("/") ? (
                    fileIcon(activeItem.path)
                  ) : (
                    <Folder className="size-3.5 text-sidebar-foreground/60" />
                  )}
                  <span className="truncate max-w-40 text-xs">
                    {activeItem.customName || activeItem.name}
                  </span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
