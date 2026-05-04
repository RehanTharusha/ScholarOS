/**
 * Card Storage - persist cards per-course in knowledge base
 * Follows LLM Wiki philosophy: flashcards live alongside concepts in course folders
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { FlashCard } from "@x/shared/dist/academic.js";

type RawFlashcard = {
  id?: unknown;
  front?: unknown;
  back?: unknown;
  question?: unknown;
  answer?: unknown;
  conceptId?: unknown;
  conceptTitle?: unknown;
  courseId?: unknown;
  courseName?: unknown;
  difficulty?: unknown;
  concepts?: unknown;
};

export class CardStorage {
  constructor(private knowledgeBaseDir: string) {}

  /**
   * Get the flashcards file path for a course
   * Course ID is normalized to match folder structure (e.g., "Biology 101" → "knowledge/courses/Biology 101/flashcards.json")
   */
  private getCourseFlashcardPath(courseId: string): string {
    // Normalize course ID to match folder structure
    const normalizedCourse = courseId.trim().replace(/[/\\?%*:|"<>]/g, "-");
    return path.join(
      this.knowledgeBaseDir,
      "courses",
      normalizedCourse,
      "flashcards.json",
    );
  }

  /**
   * Save cards for a specific course
   * Cards are stored in knowledge/courses/<course>/flashcards.json
   */
  async saveCards(cards: FlashCard[]): Promise<void> {
    if (cards.length === 0) return;

    const courseId = cards[0].courseId;
    const filePath = this.getCourseFlashcardPath(courseId);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(cards, null, 2), "utf8");
  }

  /**
   * Load cards for a specific course from knowledge base
   */
  async loadCards(courseId: string): Promise<FlashCard[]> {
    try {
      const filePath = this.getCourseFlashcardPath(courseId);
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const cards = this.normalizeCards(parsed, courseId);
      return cards.filter((card) => card.courseId === courseId);
    } catch {
      return [];
    }
  }

  /**
   * Load all cards across all courses (for global review)
   */
  async loadAllCards(): Promise<FlashCard[]> {
    try {
      const coursesDir = path.join(this.knowledgeBaseDir, "courses");
      const courseFolders = await fs.readdir(coursesDir, {
        withFileTypes: true,
      });
      const allCards: FlashCard[] = [];

      for (const folder of courseFolders) {
        if (!folder.isDirectory()) continue;

        const flashcardPath = path.join(
          coursesDir,
          folder.name,
          "flashcards.json",
        );
        try {
          const raw = await fs.readFile(flashcardPath, "utf8");
          const parsed = JSON.parse(raw) as unknown;
          const cards = this.normalizeCards(parsed, folder.name);
          allCards.push(...cards);
        } catch {
          // Skip if no flashcards.json for this course
        }
      }

      return allCards;
    } catch {
      return [];
    }
  }

  /**
   * Add new cards to a course (merge with existing)
   */
  async addCards(newCards: FlashCard[]): Promise<void> {
    if (newCards.length === 0) return;

    const courseId = newCards[0].courseId;
    const existingCards = await this.loadCards(courseId);

    // Merge: add new cards, avoid duplicates by ID
    const existingIds = new Set(existingCards.map((c) => c.id));
    const cardsToAdd = newCards.filter((c) => !existingIds.has(c.id));

    const allCards = [...existingCards, ...cardsToAdd];
    await this.saveCards(allCards);
  }

  /**
   * Get all available courses that have flashcards
   */
  async getCoursesWithFlashcards(): Promise<string[]> {
    try {
      const coursesDir = path.join(this.knowledgeBaseDir, "courses");
      const courseFolders = await fs.readdir(coursesDir, {
        withFileTypes: true,
      });
      const courses: string[] = [];

      for (const folder of courseFolders) {
        if (!folder.isDirectory()) continue;

        const flashcardPath = path.join(
          coursesDir,
          folder.name,
          "flashcards.json",
        );
        try {
          await fs.access(flashcardPath);
          courses.push(folder.name);
        } catch {
          // No flashcards for this course
        }
      }

      return courses;
    } catch {
      return [];
    }
  }

  private normalizeCards(raw: unknown, fallbackCourseId: string): FlashCard[] {
    const rawCards = this.extractRawCards(raw);
    if (!rawCards) return [];

    const result: FlashCard[] = [];

    rawCards.forEach((card, index) => {
      if (!card || typeof card !== "object") return;

      const record = card as RawFlashcard;
      const front =
        this.getString(record.front) ?? this.getString(record.question);
      const back = this.getString(record.back) ?? this.getString(record.answer);
      if (!front || !back) return;

      const courseId = this.getString(record.courseId) ?? fallbackCourseId;
      const conceptId =
        this.getString(record.conceptId) ??
        this.firstStringFromArray(record.concepts) ??
        "general";
      const conceptTitle = this.getString(record.conceptTitle) ?? conceptId;
      const courseName = this.getString(record.courseName) ?? courseId;
      const difficulty = this.getDifficulty(record.difficulty);

      result.push({
        id: this.getString(record.id) ?? `${courseId}-card-${index}`,
        front,
        back,
        conceptId,
        conceptTitle,
        courseId,
        courseName,
        ...(difficulty ? { difficulty } : {}),
      });
    });

    return result;
  }

  private extractRawCards(raw: unknown): RawFlashcard[] | null {
    if (Array.isArray(raw)) return raw as RawFlashcard[];
    if (!raw || typeof raw !== "object") return null;
    const record = raw as { cards?: unknown };
    if (Array.isArray(record.cards)) return record.cards as RawFlashcard[];
    return null;
  }

  private getString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0
      ? value
      : undefined;
  }

  private firstStringFromArray(value: unknown): string | undefined {
    if (!Array.isArray(value)) return undefined;
    for (const item of value) {
      const str = this.getString(item);
      if (str) return str;
    }
    return undefined;
  }

  private getDifficulty(
    value: unknown,
  ): "easy" | "normal" | "hard" | undefined {
    if (value === "easy" || value === "normal" || value === "hard") {
      return value;
    }
    return undefined;
  }
}
