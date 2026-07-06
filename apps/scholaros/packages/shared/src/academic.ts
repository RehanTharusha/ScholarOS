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
  lifecycle?: "fresh" | "needs-review" | "stale";
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
