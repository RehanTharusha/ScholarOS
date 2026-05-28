import z from "zod";

export const ProjectStatus = z.enum(["active", "archived", "completed"]);
export type ProjectStatusType = z.infer<typeof ProjectStatus>;

export const Project = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  course: z.string().optional(),
  color: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: ProjectStatus,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastActiveAt: z.iso.datetime(),
});

export type ProjectType = z.infer<typeof Project>;

export const ProjectSummary = Project.pick({
  id: true,
  name: true,
  description: true,
  course: true,
  color: true,
  tags: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  lastActiveAt: true,
});

export const CreateProjectOptions = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  course: z.string().optional(),
  color: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const UpdateProjectOptions = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  course: z.string().optional(),
  color: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: ProjectStatus.optional(),
});
