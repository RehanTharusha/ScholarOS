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
  rubric?: AssignmentRubric;
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
  dueFlashcards: number;
}

/**
 * Rubric for grading essays/assignments
 */
export interface AssignmentRubric {
  id: string;
  title: string;
  criteria: RubricCriterion[];
  totalPoints?: number;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  maxPoints: number;
  levels?: GradingLevel[];
}

export interface GradingLevel {
  score: number;
  label: string;
  description: string;
}

/**
 * Flashcard for spaced repetition
 */
export interface FlashCard {
  id: string;
  front: string; // Question/prompt
  back: string; // Answer
  conceptId: string; // Link to wiki concept
  courseId: string;
  created: string; // ISO 8601
  reviewed: ReviewHistory[];
  difficulty: "easy" | "normal" | "hard"; // Current difficulty
  nextReview?: string; // ISO 8601 (FSRS scheduled)
  fsrs?: FSRSCard;
}

/**
 * Review record for a flashcard
 */
export interface ReviewHistory {
  timestamp: string; // ISO 8601
  grade: 1 | 2 | 3 | 4; // FSRS grades (1=again, 2=hard, 3=good, 4=easy)
  duration?: number; // Review duration in ms
  interval?: number; // FSRS interval in days
  easeFactor?: number; // FSRS ease factor
}

/**
 * Essay draft with grading feedback
 */
export interface EssayDraft {
  id: string;
  assignmentId: string;
  title: string;
  content: string;
  status: "draft" | "submitted" | "graded";
  created: string; // ISO 8601
  lastModified: string;
  feedback?: EssayFeedback;
  citationErrors?: CitationError[];
}

/**
 * Essay feedback from grader
 */
export interface EssayFeedback {
  generatedAt: string; // ISO 8601
  criteriaScores: Map<string, CriterionFeedback>;
  overallScore: number;
  suggestions: string[];
  revisionSuggestions: RevisionSuggestion[];
}

export interface CriterionFeedback {
  criterion: string;
  score: number;
  feedback: string;
}

export interface RevisionSuggestion {
  location: string; // Quote or paragraph reference
  issue: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
}

/**
 * Citation error found during essay verification
 */
export interface CitationError {
  claim: string;
  sourceLocation: string; // Paragraph/sentence reference
  verificationStatus: "verified" | "unsupported" | "contradicted";
  relatedWikiPages?: string[];
  evidence?: string;
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
 * Spaced repetition schedule state (FSRS v6)
 */
export interface FSRSCard {
  id: string;
  state: "new" | "learning" | "review" | "relearning";
  due: number; // Days from now
  stability: number; // FSRS stability (days)
  difficulty: number; // FSRS difficulty (0-1)
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReview: string; // ISO 8601
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
