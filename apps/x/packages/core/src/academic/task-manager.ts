import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AcademicDashboardSummary,
  Assignment,
} from "@x/shared/dist/academic.js";

export type KanbanStatus = "not-started" | "in-progress" | "done";

interface StoredAcademicData {
  assignments: Assignment[];
}

const DEFAULT_FILENAME = "assignments.json";

function normalizeKanbanStatus(status: Assignment["status"]): KanbanStatus {
  if (status === "not-started") return "not-started";
  if (status === "in-progress") return "in-progress";
  return "done";
}

function toAssignmentStatus(status: KanbanStatus): Assignment["status"] {
  if (status === "done") return "submitted";
  return status;
}

export class TaskManager {
  constructor(
    private storageDir: string,
    private filename = DEFAULT_FILENAME,
  ) {}

  private get filePath() {
    return path.join(this.storageDir, this.filename);
  }

  private async readStore(): Promise<StoredAcademicData> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoredAcademicData;
      return {
        assignments: Array.isArray(parsed.assignments)
          ? parsed.assignments
          : [],
      };
    } catch {
      return { assignments: [] };
    }
  }

  private async writeStore(data: StoredAcademicData): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  async listAssignments(courseId?: string): Promise<Assignment[]> {
    const store = await this.readStore();
    if (!courseId) return store.assignments;
    return store.assignments.filter((item) => item.courseId === courseId);
  }

  async createAssignment(
    assignment: Omit<Assignment, "id">,
  ): Promise<Assignment> {
    const store = await this.readStore();
    const newAssignment: Assignment = {
      ...assignment,
      id: `${assignment.courseId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    store.assignments.push(newAssignment);
    await this.writeStore(store);
    return newAssignment;
  }

  async updateKanbanStatus(
    assignmentId: string,
    status: KanbanStatus,
  ): Promise<Assignment | null> {
    const store = await this.readStore();
    let updated: Assignment | null = null;

    store.assignments = store.assignments.map((assignment) => {
      if (assignment.id !== assignmentId) return assignment;
      updated = {
        ...assignment,
        status: toAssignmentStatus(status),
      };
      return updated;
    });

    if (!updated) return null;

    await this.writeStore(store);
    return updated;
  }

  async updateAssignment(
    assignmentId: string,
    updates: Partial<Assignment>,
  ): Promise<Assignment | null> {
    const store = await this.readStore();
    let updated: Assignment | null = null;

    store.assignments = store.assignments.map((assignment) => {
      if (assignment.id !== assignmentId) return assignment;
      updated = { ...assignment, ...updates };
      return updated;
    });

    if (!updated) return null;
    await this.writeStore(store);
    return updated;
  }

  async deleteAssignment(assignmentId: string): Promise<boolean> {
    const store = await this.readStore();
    const before = store.assignments.length;
    store.assignments = store.assignments.filter(
      (a) => a.id !== assignmentId,
    );
    if (store.assignments.length === before) return false;
    await this.writeStore(store);
    return true;
  }

  async dashboardSummary(
    courseId?: string,
  ): Promise<AcademicDashboardSummary> {
    const assignments = await this.listAssignments(courseId);
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + 7);

    const dueToday = assignments.filter((assignment) => {
      const due = new Date(assignment.dueDate);
      return due.toDateString() === now.toDateString();
    }).length;

    const dueThisWeek = assignments.filter((assignment) => {
      const due = new Date(assignment.dueDate);
      return due >= now && due <= endOfWeek;
    }).length;

    const completedAssignments = assignments.filter(
      (assignment) => normalizeKanbanStatus(assignment.status) === "done",
    ).length;

    return {
      coursesCount: new Set(
        assignments.map((assignment) => assignment.courseId),
      ).size,
      dueToday,
      dueThisWeek,
      completedAssignments,
      totalAssignments: assignments.length,
    };
  }

  toKanbanStatus(status: Assignment["status"]): KanbanStatus {
    return normalizeKanbanStatus(status);
  }
}
