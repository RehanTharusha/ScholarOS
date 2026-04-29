/**
 * FSRS v6 spaced repetition scheduler
 * State-of-the-art algorithm for optimal review scheduling
 *
 * Grades: 1 = again, 2 = hard, 3 = good, 4 = easy
 * State: new → learning → review → relearning
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { FSRSCard, FlashCard, ReviewHistory } from "@x/shared/dist/academic.js";

/**
 * FSRS Parameters (defaults from fsrs-js library)
 */
export interface FSRSConfig {
  requestRetention?: number; // Target retention (default: 0.9 = 90%)
  maximumInterval?: number; // Max days (default: 36500 = ~100 years)
  w?: number[]; // Weight parameters for FSRS algorithm
  enableFuzz?: boolean; // Add randomness to intervals (default: true)
}

/**
 * Card scheduling result after a review
 */
export interface SchedulingResult {
  card: FSRSCard;
  reviews: ReviewHistory[];
  nextReviewDate: Date;
  status: string; // Human-readable status
}

/**
 * FSRS Scheduler - wraps FSRS algorithm
 */
export class FSRSScheduler {
  private config: Required<FSRSConfig>;
  private readonly DEFAULT_W = [
    0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.52, 0.27,
    0.28, 1.84, 0.02, 0.71, 0.18, 0.155, 0.034, 1.26, 0.29, 2.61, 0.72, 0.38,
    1.26, 3.35, 0.86, 1.62, 1.62, 1.251, 0.0, 2.18, 0.05, 0.34, 0.63, 0.35,
    1.48, 0.22, 0.27, 0.09, 1.93, 0.05, 1.36, 0.32, 6.86, 0.86, 0.26, 1.61,
    1.35, 1.6, 1.73, 0.12, 0.05, 3.73, 0.82, 0.37, 1.59, 0.27, 1.11, 0.05, 2.61,
    0.28, 0.08, 0.22, 0.02, 0.02, 0.08, 0.02, 1.7, 0.05, 1.57, 0.05, 0.04, 0.05,
    0.05, 0.05, 1.04, 0.05, 0.05, 0.1, 1.31, 0.25, 0.25, 0.05, 2.5,
  ];

  constructor(config: FSRSConfig = {}) {
    this.config = {
      requestRetention: config.requestRetention ?? 0.9,
      maximumInterval: config.maximumInterval ?? 36500,
      w: config.w ?? this.DEFAULT_W,
      enableFuzz: config.enableFuzz ?? true,
    };
  }

  /**
   * Initialize a new card (first review)
   */
  createNewCard(cardId: string): FSRSCard {
    return {
      id: cardId,
      state: "new",
      due: 0,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      lastReview: new Date().toISOString(),
    };
  }

  /**
   * Schedule next review after a grade (1-4)
   */
  schedule(card: FSRSCard, grade: 1 | 2 | 3 | 4): FSRSCard {
    const now = new Date();
    const elapsedDays = this.calculateElapsedDays(card.lastReview);

    let newCard = { ...card };
    newCard.elapsedDays = elapsedDays;
    newCard.reps += 1;

    if (card.state === "new") {
      // First review
      newCard = this.initializeCard(newCard, grade);
    } else if (card.state === "learning" || card.state === "relearning") {
      // Still learning or relearning
      newCard = this.reviewLearning(newCard, grade);
    } else if (card.state === "review") {
      // Regular review
      newCard = this.reviewCard(newCard, grade);
    }

    newCard.lastReview = now.toISOString();
    return newCard;
  }

  /**
   * Process first review of a new card
   */
  private initializeCard(card: FSRSCard, grade: 1 | 2 | 3 | 4): FSRSCard {
    const w = this.config.w;

    if (grade === 1) {
      // User forgot, stay in learning
      return {
        ...card,
        state: "learning",
        difficulty: Math.max(0, w[4] - 1),
        scheduledDays: 1,
        due: 1,
        stability: 0,
      };
    }

    const hardPenalty = w[6];
    const initialStability = Math.max(w[17], w[18] * (grade - 2) + w[19]);

    return {
      ...card,
      state: grade >= 3 ? "review" : "learning",
      difficulty: Math.max(0, hardPenalty + (grade - 3) * w[9]),
      stability: initialStability,
      scheduledDays:
        grade === 4 ? Math.ceil(initialStability * this.fuzzFactor()) : 1,
      due: grade === 4 ? Math.ceil(initialStability * this.fuzzFactor()) : 1,
    };
  }

  /**
   * Process learning/relearning card review
   */
  private reviewLearning(card: FSRSCard, grade: 1 | 2 | 3 | 4): FSRSCard {
    if (grade === 1) {
      // Still learning/relearning
      return { ...card, scheduledDays: 1, due: 1 };
    }

    // Move to review state
    const stability = this.calculateStability(card, grade);
    return {
      ...card,
      state: "review",
      difficulty: Math.max(
        0,
        card.difficulty + this.config.w[10] * (grade - 3),
      ),
      stability,
      scheduledDays: Math.ceil(stability * this.fuzzFactor()),
      due: Math.ceil(stability * this.fuzzFactor()),
    };
  }

  /**
   * Process regular review card
   */
  private reviewCard(card: FSRSCard, grade: 1 | 2 | 3 | 4): FSRSCard {
    const w = this.config.w;

    if (grade === 1) {
      // Lapsed - back to relearning
      return {
        ...card,
        state: "relearning",
        lapses: card.lapses + 1,
        difficulty: Math.min(
          1,
          Math.max(
            0,
            card.difficulty + w[11] * (grade - 3) + w[12] * card.lapses,
          ),
        ),
        scheduledDays: 1,
        due: 1,
      };
    }

    const interval = Math.min(
      this.config.maximumInterval,
      Math.max(1, Math.round(card.scheduledDays * this.nextInterval(card))),
    );

    const stability = this.calculateStability(card, grade);
    const difficulty = Math.max(
      0,
      Math.min(1, card.difficulty + w[6] * (grade - 3)),
    );

    return {
      ...card,
      state: "review",
      difficulty,
      stability,
      scheduledDays: interval,
      due: interval,
    };
  }

  /**
   * Calculate stability for a card (days it can maintain 90% retention)
   */
  private calculateStability(card: FSRSCard, grade: 1 | 2 | 3 | 4): number {
    const w = this.config.w;
    const increase =
      1 + (w[8] * (grade - 3) * (1 - Math.pow(card.difficulty, 2))) / 17;

    return Math.max(w[16], Math.round(card.stability * increase * 100) / 100);
  }

  /**
   * Calculate next interval for review
   */
  private nextInterval(card: FSRSCard): number {
    const w = this.config.w;
    const factor = (1 - this.config.requestRetention) / (1 - 0.9); // Adjust for target retention

    return (
      Math.pow(factor, 1 / w[16]) *
      card.stability *
      Math.exp(w[13] * card.lapses)
    );
  }

  /**
   * Get days until next review
   */
  getDaysUntilReview(card: FSRSCard): number {
    return Math.max(0, card.due - this.calculateElapsedDays(card.lastReview));
  }

  /**
   * Calculate elapsed days since last review
   */
  private calculateElapsedDays(lastReview: string): number {
    const last = new Date(lastReview);
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((now.getTime() - last.getTime()) / msPerDay);
  }

  /**
   * Apply fuzz (randomness) to intervals for variety
   */
  private fuzzFactor(): number {
    if (!this.config.enableFuzz) return 1;
    return 0.95 + Math.random() * 0.1;
  }

  /**
   * Convert FSRS card to flashcard with next review
   */
  async convertToFlashCard(
    fsrsCard: FSRSCard,
    originalCard: FlashCard,
    grade: 1 | 2 | 3 | 4,
  ): Promise<FlashCard> {
    const review: ReviewHistory = {
      timestamp: new Date().toISOString(),
      grade,
      duration: undefined, // Set by UI
      interval: fsrsCard.scheduledDays,
      easeFactor: fsrsCard.difficulty,
    };

    return {
      ...originalCard,
      reviewed: [...originalCard.reviewed, review],
      difficulty:
        grade === 4
          ? "easy"
          : grade === 3
            ? "normal"
            : grade === 2
              ? "normal"
              : "hard",
      nextReview: new Date(
        Date.now() + fsrsCard.due * 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
  }
}

/**
 * Card Storage - persist cards to database/JSON
 */
export class CardStorage {
  constructor(private storageDir: string) {}

  async saveCards(cards: FlashCard[]): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    const filePath = path.join(this.storageDir, "flashcards.json");
    await fs.writeFile(filePath, JSON.stringify(cards, null, 2), "utf8");
  }

  async loadCards(courseId: string): Promise<FlashCard[]> {
    try {
      const filePath = path.join(this.storageDir, "flashcards.json");
      const raw = await fs.readFile(filePath, "utf8");
      const cards = JSON.parse(raw) as FlashCard[];
      return cards.filter((card) => card.courseId === courseId);
    } catch {
      return [];
    }
  }

  async getCardsDueForReview(courseId: string): Promise<FlashCard[]> {
    const now = new Date().toISOString();
    const allCards = await this.loadCards(courseId);
    return allCards.filter((c) => !c.nextReview || c.nextReview <= now);
  }
}
