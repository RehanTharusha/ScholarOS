import { useState, useEffect, useCallback, useMemo } from "react";

const getIpc = () =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof window !== "undefined" ? (window as any).ipc : undefined;

const COURSE_COLORS = [
  "#3B82F6",
  "#16A34A",
  "#8B5CF6",
  "#D97706",
  "#DC2626",
  "#0891B2",
  "#7C3AED",
  "#059669",
];

export interface Course {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

interface TreeNode {
  path: string;
  name: string;
  kind: "file" | "dir";
  children?: TreeNode[];
  loaded?: boolean;
}

/**
 * Count all files under a given path prefix in a hierarchical tree.
 * Correctly descends into ancestor directories of the prefix — e.g.,
 * when looking for "courses/Biology 101" inside a root-level "courses" node.
 */
function countFilesInPath(tree: TreeNode[], pathPrefix: string): number {
  let count = 0;
  for (const node of tree) {
    if (node.path === pathPrefix || node.path.startsWith(pathPrefix + "/")) {
      if (node.kind === "file") count++;
      if (node.children) {
        count += countFilesInPath(node.children, pathPrefix);
      }
    } else if (
      pathPrefix.startsWith(node.path + "/") &&
      node.kind === "dir" &&
      node.children
    ) {
      count += countFilesInPath(node.children, pathPrefix);
    }
  }
  return count;
}

export interface CourseData {
  courses: Course[];
  noteCounts: Record<string, number>;
  flashcardCounts: Record<string, number>;
  loading: boolean;
}

export function useCourseData(tree: TreeNode[]): CourseData {
  const [courses, setCourses] = useState<Course[]>([]);
  const [flashcardCounts, setFlashcardCounts] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);

  const loadCourses = useCallback(async () => {
    try {
      const ipc = getIpc();
      if (!ipc) return;

      const existsResult = await ipc.invoke("workspace:exists", {
        path: ".scholar/courses.json",
      });

      if (existsResult.exists) {
        const result = await ipc.invoke("workspace:readFile", {
          path: ".scholar/courses.json",
          encoding: "utf8",
        });
        const data = JSON.parse(result.data);
        setCourses(data.courses || []);
        return;
      }

      // No courses.json yet — scan the file tree for course directories
      try {
        const entries = await ipc.invoke("workspace:readdir", {
          path: "courses",
          opts: { recursive: false, kind: "dir" },
        });
        const dirs = (entries ?? [])
          .filter((e: { kind: string }) => e.kind === "dir")
          .map((e: { name: string }) => e.name);

        if (dirs.length === 0) {
          setCourses([]);
          return;
        }

        const detected: Course[] = dirs.map((name: string, i: number) => ({
          id: `auto-${name.toLowerCase().replace(/\s+/g, "-")}`,
          name,
          color: COURSE_COLORS[i % COURSE_COLORS.length],
          createdAt: new Date().toISOString(),
        }));
        setCourses(detected);

        // Persist so next load is instant
        await ipc.invoke("workspace:mkdir", {
          path: ".scholar",
          recursive: true,
        });
        await ipc.invoke("workspace:writeFile", {
          path: ".scholar/courses.json",
          data: JSON.stringify({ courses: detected }, null, 2),
        });
      } catch {
        // courses/ directory doesn't exist yet — that's fine
        setCourses([]);
      }
    } catch (err) {
      console.error("Failed to load courses:", err);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFlashcardCounts = useCallback(
    async (courseList: Course[]) => {
      try {
        const ipc = getIpc();
        if (!ipc) return;

        const exists = await ipc.invoke("workspace:exists", {
          path: ".scholar/review/cards.json",
        });
        if (!exists.exists) {
          setFlashcardCounts({});
          return;
        }

        const result = await ipc.invoke("workspace:readFile", {
          path: ".scholar/review/cards.json",
          encoding: "utf8",
        });
        const data = JSON.parse(result.data);
        const cards: { course?: string }[] = data.cards ?? [];

        // Case-insensitive lookup: normalize card.course to the canonical name
        const courseNameMap = new Map<string, string>();
        for (const course of courseList) {
          courseNameMap.set(course.name.toLowerCase(), course.name);
        }

        const counts: Record<string, number> = {};
        for (const card of cards) {
          if (!card.course) continue;
          const canonicalName =
            courseNameMap.get(card.course.toLowerCase()) ?? card.course;
          counts[canonicalName] = (counts[canonicalName] || 0) + 1;
        }
        setFlashcardCounts(counts);
      } catch {
        setFlashcardCounts({});
      }
    },
    [],
  );

  // Load courses on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCourses();
  }, [loadCourses]);

  // Load flashcard counts whenever courses change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFlashcardCounts(courses);
  }, [courses, loadFlashcardCounts]);

  // Re-fetch courses when workspace files change
  useEffect(() => {
    const ipc = getIpc();
    if (!ipc) return;
    const cleanup = ipc.on("workspace:didChange", () => {
      void loadCourses();
    });
    return cleanup;
  }, [loadCourses]);

  // Derive note counts from the file tree
  const noteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const course of courses) {
      counts[course.name] = countFilesInPath(tree, `courses/${course.name}`);
    }
    return counts;
  }, [courses, tree]);

  return { courses, noteCounts, flashcardCounts, loading };
}