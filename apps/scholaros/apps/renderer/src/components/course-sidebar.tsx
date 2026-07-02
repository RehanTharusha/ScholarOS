"use client";

import * as React from "react";
import { useCallback, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Layers,
  LoaderIcon,
  StickyNote,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import { useCourseData } from "@/hooks/useCourseData";

interface TreeNode {
  path: string;
  name: string;
  kind: "file" | "dir";
  children?: TreeNode[];
  loaded?: boolean;
}

type KnowledgeActions = {
  createNote: (parentPath?: string) => void;
  createFolder: (parentPath?: string) => void;
  createCanvas: (parentPath?: string) => void;
  openGraph: () => void;
  openBases: () => void;
  openCanvas: () => void;
  expandAll: () => void;
  collapseAll: () => void;
  rename: (path: string, newName: string, isDir: boolean) => Promise<void>;
  remove: (path: string) => Promise<void>;
  copyPath: (path: string) => void;
  revealInFileManager: (path: string) => Promise<void>;
  duplicate: (path: string, isDir: boolean) => Promise<void>;
  onOpenInNewTab?: (path: string) => void;
};

interface CourseSidebarProps {
  tree: TreeNode[];
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelectFile: (path: string, kind: "file" | "dir") => void;
  onToggleFolder?: (path: string) => void;
  actions: KnowledgeActions;
  onSwitchToFiles?: () => void;
}

export function CourseSidebar({
  tree,
  onSelectFile,
  onToggleFolder,
  onSwitchToFiles,
}: CourseSidebarProps) {
  const { courses, noteCounts, flashcardCounts, loading } = useCourseData(tree);
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(
    new Set(),
  );

  const handleCourseClick = useCallback((courseId: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  }, []);

  const handleOpenCourseFolder = useCallback(
    (courseName: string) => {
      const coursePath = `courses/${courseName}`;
      onSwitchToFiles?.();
      onSelectFile(coursePath, "dir");
      onToggleFolder?.(coursePath);
    },
    [onSelectFile, onToggleFolder, onSwitchToFiles],
  );

  if (loading) {
    return (
      <SidebarGroup className="flex-1 flex flex-col overflow-hidden">
        <SidebarGroupContent className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-center py-8">
            <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (courses.length === 0) {
    return (
      <SidebarGroup className="flex-1 flex flex-col overflow-hidden">
        <SidebarGroupContent className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <BookOpen className="size-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No courses yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Courses appear here when you ingest materials
            </p>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup className="flex-1 flex flex-col overflow-hidden">
      <SidebarGroupContent className="flex-1 overflow-y-auto">
        <SidebarMenu>
          {courses.map((course) => {
            const isExpanded = expandedCourses.has(course.id);
            const noteCount = noteCounts[course.name] || 0;
            const flashcardCount = flashcardCounts[course.name] || 0;

            return (
              <SidebarMenuItem key={course.id}>
                <Collapsible
                  open={isExpanded}
                  onOpenChange={() => handleCourseClick(course.id)}
                  className="sidebar-folder-collapsible group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
                >
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                      <ChevronRight className="transition-transform size-4" />
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: course.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {course.name}
                        </span>
                      </div>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          onClick={() => handleOpenCourseFolder(course.name)}
                        >
                          <StickyNote className="size-4" />
                          <span className="min-w-0 flex-1 truncate">
                            Notes
                          </span>
                          {noteCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {noteCount}
                            </span>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          onClick={() => handleOpenCourseFolder(course.name)}
                        >
                          <Layers className="size-4" />
                          <span className="min-w-0 flex-1 truncate">
                            Flashcards
                          </span>
                          {flashcardCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {flashcardCount}
                            </span>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}