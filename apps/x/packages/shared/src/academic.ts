/**
 * Academic domain types for ScholarOS
 * Extends core knowledge system with academic-specific schemas
 */

/**
 * Academic metadata stored in frontmatter of concept pages
 */
export interface AcademicFrontmatter {
  title: string;
  type: "concept" | "paper" | "lecture" | "assignment" | "resource";
  course?: string;
  semester?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  sources?: string[]; // File paths or URLs
  tags?: string[];
  relatedConcepts?: string[]; // Links to other concept pages
  created?: string;
  lastUpdated?: string;
}

/**
 * Course metadata
 */
export interface Course {
  id: string;
  title: string;
  code: string;
  semester: string;
  year: number;
  credits?: number;
  instructor?: string;
  description?: string;
  color?: string; // UI color coding
}

/**
 * Upcoming task — centralized store for ingest-detected + manually created tasks
 * Canonical source: knowledge/upcoming.json
 * Each task gets a sibling MD file at knowledge/tasks/<slug>.md
 */
export interface UpcomingTask {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  dueDate: string; // ISO 8601
  status: "not-started" | "in-progress" | "submitted" | "graded";
  priority?: "high" | "medium" | "low";
  wikiLinks?: string[];
  notes?: string;
  source: "ingest" | "manual" | "agent";
  sourceFile?: string; // Path of doc that mentioned this task
  mdPath: string; // knowledge/tasks/<slug>.md
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface UpcomingTaskStore {
  version: number;
  tasks: UpcomingTask[];
}

/**
 * Assignment with tracking
 */
export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  dueDate: string; // ISO 8601
  status: "not-started" | "in-progress" | "submitted" | "graded";
  priority?: "high" | "medium" | "low";
  wikiLinks?: string[]; // Related concept pages
  notes?: string; // User's working notes
}

/**
 * Aggregated dashboard metrics for the academic overview page
 */
export interface AcademicDashboardSummary {
  coursesCount: number;
  dueToday: number;
  dueThisWeek: number;
  completedAssignments: number;
  totalAssignments: number;
}

/**
 * Flashcard for study mode
 * Simple Q&A cards linked to course concepts
 * Supports FSRS v6 scheduling fields for spaced repetition.
 */
export interface FlashCard {
  id: string;
  front: string; // Question/prompt
  back: string; // Answer
  conceptId: string; // Link to wiki concept (e.g., "Photosynthesis")
  conceptTitle?: string; // Human-readable concept name for display
  courseId: string;
  courseName?: string; // Human-readable course name
  difficulty?: "easy" | "normal" | "hard"; // Optional difficulty indicator
  // FSRS v6 scheduling fields (set by ts-fsrs during review)
  due?: number | null; // Due timestamp (ms epoch), null = not yet scheduled
  stability?: number;
  difficulty_fsrs?: number;
  elapsed_days?: number;
  scheduled_days?: number;
  reps?: number;
  lapses?: number;
  state?: number; // 0=New, 1=Learning, 2=Review, 3=Relearning
  last_review?: number;
}

/**
 * PDF annotation (highlight + notes)
 */
export interface PDFAnnotation {
  id: string;
  pdfPath: string;
  page: number;
  highlighted: {
    text: string;
    startIndex: number;
    endIndex: number;
  };
  notes?: string;
  linkedConcepts?: string[]; // Wiki concepts this quote relates to
  created: string; // ISO 8601
}

/**
 * Semester progress analytics
 */
export interface SemesterAnalytics {
  semesterId: string;
  coursesEnrolled: number;
  conceptsMastered: number;
  totalConcepts: number;
  assignmentsDue: number;
  assignmentsCompleted: number;
  flashcardsReviewed: number;
  masteryByFactor: Map<string, number>; // concept -> mastery %
  averageGrade?: number;
}

/**
 * Contradiction detected during ingest
 */
export interface Contradiction {
  id: string;
  claim1: string;
  source1: string; // File/page reference
  claim2: string;
  source2: string;
  conflictType: "factual" | "methodological" | "interpretive";
  confidence: number; // 0-1
  resolution?: "merged" | "superseded" | "both-valid";
  notes?: string;
}

/**
 * Prerequisite graph edge
 */
export interface ConceptPrerequisite {
  conceptId: string;
  prerequisiteId: string;
  description?: string;
}
