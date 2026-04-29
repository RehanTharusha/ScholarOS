import * as React from "react";
import { ArrowRightLeft, Link2 } from "lucide-react";
import type { Assignment } from "@x/shared/dist/academic.js";

export type KanbanStatus = "not-started" | "in-progress" | "done";

function mapAssignmentStatus(status: Assignment["status"]): KanbanStatus {
  if (status === "not-started") return "not-started";
  if (status === "in-progress") return "in-progress";
  return "done";
}

export function TaskCard({
  assignment,
  onMove,
}: {
  assignment: Assignment;
  onMove: (assignmentId: string, direction: -1 | 1) => void;
}) {
  const status = mapAssignmentStatus(assignment.status);

  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{assignment.title}</p>
          <p className="mt-1 text-xs text-slate-400">{assignment.courseId}</p>
        </div>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-200">
          {assignment.priority ?? "medium"}
        </span>
      </div>

      {assignment.description ? (
        <p className="mt-2 line-clamp-2 text-xs text-slate-300">
          {assignment.description}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-300">
        <span>Due {new Date(assignment.dueDate).toLocaleDateString()}</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onMove(assignment.id, -1)}
            disabled={status === "not-started"}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowRightLeft className="size-3.5 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => onMove(assignment.id, 1)}
            disabled={status === "done"}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowRightLeft className="size-3.5" />
          </button>
        </div>
      </div>

      {assignment.wikiLinks && assignment.wikiLinks.length > 0 ? (
        <div className="mt-2 flex items-center gap-1 text-xs text-cyan-200/80">
          <Link2 className="size-3.5" />
          <span className="truncate">{assignment.wikiLinks[0]}</span>
        </div>
      ) : null}
    </article>
  );
}
