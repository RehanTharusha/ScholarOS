import { nanoid } from "nanoid";

export interface Flashcard {
  id: string;
  noteSource: string;
  course: string;
  topic: string;
  question: string;
  answer: string;
  type: "qa" | "cloze";
  interval: number;
  easeFactor: number;
  repetitions: number;
  lastReview: string | null;
  nextReview: string;
  lastQuality: number | null;
}

export interface ReviewSession {
  id: string;
  date: string;
  duration: number;
  cardsReviewed: number;
  correctCount: number;
  course: string;
  cardIds: string[];
}

export interface ReviewData {
  cards: Flashcard[];
  sessions: ReviewSession[];
}

const REVIEW_DATA_PATH = ".scholar/review/cards.json";

function generateId(): string {
  return nanoid(12);
}

function todayISO(): string {
  return new Date().toISOString();
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function ipc(): Promise<Window["ipc"]> {
  if (!window.ipc) throw new Error("IPC not available");
  return window.ipc;
}

export async function loadReviewData(): Promise<ReviewData> {
  try {
    const ipc_ = await ipc();
    const result = await ipc_.invoke("workspace:readFile", {
      path: REVIEW_DATA_PATH,
      encoding: "utf8",
    });
    const parsed = JSON.parse(result.data) as ReviewData;
    return {
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { cards: [], sessions: [] };
  }
}

export async function saveReviewData(data: ReviewData): Promise<void> {
  try {
    const ipc_ = await ipc();
    await ipc_.invoke("workspace:writeFile", {
      path: REVIEW_DATA_PATH,
      data: JSON.stringify(data, null, 2),
      opts: { encoding: "utf8", mkdirp: true },
    });
  } catch {
    // Silently fail if IPC is not available
  }
}

export async function initializeIfNeeded(): Promise<ReviewData> {
  const data = await loadReviewData();
  if (data.cards.length === 0) {
    const demoCards = seedDemoCards();
    const seeded: ReviewData = {
      cards: demoCards,
      sessions: [],
    };
    await saveReviewData(seeded);
    return seeded;
  }
  return data;
}

export function addCards(data: ReviewData, cards: Flashcard[]): ReviewData {
  const existingIds = new Set(data.cards.map((c) => c.id));
  const newCards = cards.filter((c) => !existingIds.has(c.id));
  return {
    ...data,
    cards: [...data.cards, ...newCards],
  };
}

export function processReview(
  card: Flashcard,
  quality: number,
): Flashcard {
  let { interval, easeFactor, repetitions } = card;

  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 3;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  }

  easeFactor =
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  easeFactor = Math.max(1.3, Math.min(3.0, easeFactor));
  interval = Math.min(interval, 30);

  const nextReview = daysFromNow(interval);

  return {
    ...card,
    interval,
    easeFactor,
    repetitions,
    lastReview: todayISO(),
    nextReview,
    lastQuality: quality,
  };
}

export function getDueCards(cards: Flashcard[]): Flashcard[] {
  const now = new Date();
  return cards
    .filter((c) => new Date(c.nextReview) <= now)
    .sort(
      (a, b) =>
        new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime(),
    );
}

export function getCardStats(cards: Flashcard[]) {
  const now = new Date();
  const due = cards.filter(
    (c) => new Date(c.nextReview) <= now,
  ).length;
  const overdue = cards.filter((c) => {
    const diff = now.getTime() - new Date(c.nextReview).getTime();
    return diff > 86400000;
  }).length;
  const total = cards.length;
  const mastered = cards.filter((c) => c.interval >= 7).length;
  return { due, overdue, total, mastered };
}

function estimateNextInterval(card: Flashcard, quality: number): number {
  const simulated = processReview(
    { ...card, nextReview: card.nextReview },
    quality,
  );
  return simulated.interval;
}

export function computeRatingIntervals(card: Flashcard): {
  again: number;
  hard: number;
  good: number;
  easy: number;
} {
  return {
    again: estimateNextInterval(card, 0),
    hard: estimateNextInterval(card, 2),
    good: estimateNextInterval(card, 3),
    easy: estimateNextInterval(card, 5),
  };
}

export function processReviewSession(
  data: ReviewData,
  session: ReviewSession,
  ratings: Map<string, number>,
): ReviewData {
  const cardMap = new Map(data.cards.map((c) => [c.id, c]));
  for (const [cardId, quality] of ratings) {
    const card = cardMap.get(cardId);
    if (card) {
      cardMap.set(cardId, processReview(card, quality));
    }
  }
  return {
    cards: Array.from(cardMap.values()),
    sessions: [...data.sessions, session],
  };
}

export function seedDemoCards(): Flashcard[] {
  const now = todayISO();
  return [
    {
      id: generateId(),
      noteSource: "Bio 301 - Lecture 5",
      course: "Bio 301",
      topic: "Osmosis & Diffusion",
      question:
        "What is the primary difference between osmosis and simple diffusion?",
      answer:
        "Osmosis is the movement of water molecules through a selectively permeable membrane from a region of lower solute concentration to higher solute concentration. Simple diffusion is the movement of any molecule from high to low concentration and does not require a membrane.",
      type: "qa",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      lastReview: null,
      nextReview: now,
      lastQuality: null,
    },
    {
      id: generateId(),
      noteSource: "Math 201 - Chapter 4",
      course: "Math 201",
      topic: "Linear Transformations",
      question: "What defines a linear transformation T: V → W?",
      answer:
        "A linear transformation satisfies two properties: T(u + v) = T(u) + T(v) for all u,v in V (additivity), and T(cu) = cT(u) for all scalars c and vectors u in V (homogeneity).",
      type: "qa",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      lastReview: null,
      nextReview: now,
      lastQuality: null,
    },
    {
      id: generateId(),
      noteSource: "Bio 301 - Lecture 7",
      course: "Bio 301",
      topic: "Cell Cycle Regulation",
      question:
        "What role do cyclin-dependent kinases (CDKs) play in the cell cycle?",
      answer:
        "CDKs are enzymes that phosphorylate target proteins to drive the cell through different phases of the cell cycle. They are activated by binding to cyclins, whose concentrations oscillate throughout the cycle. Different cyclin-CDK complexes regulate different transitions (G1/S, G2/M).",
      type: "qa",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      lastReview: null,
      nextReview: now,
      lastQuality: null,
    },
    {
      id: generateId(),
      noteSource: "Bio 301 - Lecture 8",
      course: "Bio 301",
      topic: "The Krebs Cycle",
      question:
        "What are the net products of one turn of the Krebs (citric acid) cycle?",
      answer:
        "One turn of the Krebs cycle yields: 3 NADH, 1 FADH2, 1 GTP (or ATP), and 2 CO2. The cycle also regenerates oxaloacetate to combine with the next acetyl-CoA.",
      type: "qa",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      lastReview: null,
      nextReview: now,
      lastQuality: null,
    },
    {
      id: generateId(),
      noteSource: "CS 450 - Lecture 3",
      course: "CS 450",
      topic: "Algorithm Complexity",
      question:
        "What is the difference between O(n), Ω(n), and Θ(n) notation?",
      answer:
        "O(n) (Big-O) is an upper bound — the algorithm runs in at most n time. Ω(n) (Big-Omega) is a lower bound — the algorithm takes at least n time. Θ(n) (Big-Theta) is a tight bound — the algorithm grows exactly like n for sufficiently large inputs.",
      type: "qa",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      lastReview: null,
      nextReview: now,
      lastQuality: null,
    },
  ];
}
