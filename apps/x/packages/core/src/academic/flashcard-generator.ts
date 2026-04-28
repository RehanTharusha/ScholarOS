/**
 * Flashcard generator for spaced repetition learning
 * Extracts Q&A pairs from wiki concepts using LLM
 */

import { FlashCard } from "@x/shared/academic.js";

export interface CardGenerationOptions {
  conceptPath: string;
  courseId: string;
  cardsPerConcept?: number;
  difficulty?: "easy" | "mixed";
}

export interface GeneratedCard {
  front: string;
  back: string;
  difficulty: "easy" | "normal" | "hard";
  reasoning?: string;
}

interface LlmAgent {
  generate(prompt: string): Promise<{ text: string }>;
}

/**
 * Generate flashcards from wiki concept pages
 */
export class FlashcardGenerator {
  constructor(private llmAgent: LlmAgent) {}

  /**
   * Generate flashcards from a single concept page
   */
  async generateFromConcept(
    conceptContent: string,
    conceptTitle: string,
    conceptId: string,
    courseId: string,
    options: { cardsPerConcept?: number } = {},
  ): Promise<FlashCard[]> {
    const cardsPerConcept = options.cardsPerConcept || 5;

    const prompt = `
You are an expert at creating study flashcards for effective spaced repetition learning.

Generate exactly ${cardsPerConcept} high-quality flashcards from this concept:

Title: "${conceptTitle}"
Content:
\`\`\`
${conceptContent}
\`\`\`

Requirements:
1. Questions should be concise (5-20 words)
2. Answers should be clear and complete (1-3 sentences)
3. Include definition questions, application questions, and comparison questions
4. Vary difficulty to ensure effective learning
5. Focus on testable knowledge and key facts

Return a JSON array of objects with structure:
{
  "front": "question text",
  "back": "answer text",
  "difficulty": "easy|normal|hard",
  "reasoning": "why this card is useful"
}

IMPORTANT: Return ONLY valid JSON, no other text.
    `;

    try {
      const response = await this.llmAgent.generate(prompt);
      let generatedCards: GeneratedCard[] = [];

      // Parse JSON response
      try {
        generatedCards = JSON.parse(response.text);
      } catch {
        // Try to extract JSON from response
        const jsonMatch = response.text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) {
          generatedCards = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Could not parse card generation response");
        }
      }

      // Convert to FlashCard objects
      const now = new Date().toISOString();
      const flashcards: FlashCard[] = generatedCards.map((card, idx) => ({
        id: `${conceptId}-card-${idx}-${Date.now()}`,
        front: card.front,
        back: card.back,
        conceptId,
        courseId,
        created: now,
        reviewed: [],
        difficulty: card.difficulty as "easy" | "normal" | "hard",
      }));

      return flashcards;
    } catch (error) {
      console.error("Error generating flashcards:", error);
      return [];
    }
  }

  /**
   * Batch generate flashcards from multiple concepts
   */
  async generateFromConcepts(
    concepts: Array<{
      id: string;
      title: string;
      content: string;
      courseId: string;
    }>,
    options: { cardsPerConcept?: number } = {},
  ): Promise<FlashCard[]> {
    const allCards: FlashCard[] = [];

    for (const concept of concepts) {
      const cards = await this.generateFromConcept(
        concept.content,
        concept.title,
        concept.id,
        concept.courseId,
        options,
      );
      allCards.push(...cards);
    }

    return allCards;
  }

  /**
   * Validate flashcard quality
   */
  async validateCards(
    cards: FlashCard[],
  ): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    for (const card of cards) {
      if (card.front.length < 5 || card.front.length > 200) {
        issues.push(
          `Card ${card.id}: Front too short/long (${card.front.length} chars)`,
        );
      }
      if (card.back.length < 10 || card.back.length > 500) {
        issues.push(
          `Card ${card.id}: Back too short/long (${card.back.length} chars)`,
        );
      }
      if (card.front === card.back) {
        issues.push(`Card ${card.id}: Front and back are identical`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
