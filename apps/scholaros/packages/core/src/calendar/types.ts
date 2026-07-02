import { z } from "zod";

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  due: z.string(), // ISO date "YYYY-MM-DD"
  dueTime: z.string().optional(), // "HH:mm"
  type: z.enum(["manual", "assignment", "lecture", "deadline", "custom"]),
  status: z.enum(["pending", "done"]).default("pending"),
  source: z.string().optional(), // file path if from MD frontmatter
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable().default(null),
});

export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskSchema = TaskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  status: true,
}).extend({
  status: z.enum(["pending", "done"]).optional(),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;

export type TaskType = Task["type"];

export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  manual: "#22c55e",
  assignment: "#ef4444",
  lecture: "#3b82f6",
  deadline: "#f97316",
  custom: "#a855f7",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  manual: "Manual",
  assignment: "Assignment",
  lecture: "Lecture",
  deadline: "Deadline",
  custom: "Custom",
};
