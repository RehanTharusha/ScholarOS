import React, { useState, useEffect, useCallback } from "react";
import { Plus, FolderOpen, Globe, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ProjectType } from "@x/shared/dist/projects.js";

interface ProjectSelectorPopoverProps {
  activeProject: ProjectType | null;
  projects: ProjectType[];
  onSelectProject: (projectId: string | null) => void;
  onCreateProject: () => void;
}

export function ProjectSelectorPopover({
  activeProject,
  projects,
  onSelectProject,
  onCreateProject,
}: ProjectSelectorPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.course?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-sidebar-accent",
            activeProject
              ? "text-foreground"
              : "text-muted-foreground",
          )}
        >
          {activeProject ? (
            <>
              {activeProject.color && (
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: activeProject.color }}
                />
              )}
              {!activeProject.color && (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate max-w-[140px]">
                {activeProject.name}
              </span>
            </>
          ) : (
            <>
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span>No project</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        side="bottom"
      >
        <div className="p-2">
          <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto px-1 pb-1">
          {/* Global option */}
          <button
            onClick={() => {
              onSelectProject(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent",
              !activeProject && "bg-sidebar-accent",
            )}
          >
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 text-left">Global (no project)</span>
            {!activeProject && (
              <Check className="h-3.5 w-3.5 text-primary" />
            )}
          </button>

          {/* Project list */}
          {filtered.map((project) => (
            <button
              key={project.id}
              onClick={() => {
                onSelectProject(project.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent",
                activeProject?.id === project.id && "bg-sidebar-accent",
              )}
            >
              {project.color ? (
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: project.color }}
                />
              ) : (
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div className="flex-1 text-left">
                <div className="truncate">{project.name}</div>
                {project.course && (
                  <div className="text-xs text-muted-foreground">
                    {project.course}
                  </div>
                )}
              </div>
              {activeProject?.id === project.id && (
                <Check className="h-3.5 w-3.5 text-primary" />
              )}
            </button>
          ))}

          {filtered.length === 0 && search && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No projects found
            </div>
          )}
        </div>
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => {
              onCreateProject();
              setOpen(false);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New Project
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
