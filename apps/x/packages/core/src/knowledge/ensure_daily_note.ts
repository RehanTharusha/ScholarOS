import path from 'path';
import fs from 'fs';
import { WorkDir } from '../config/config.js';
import { TaskManager } from '../academic/task-manager.js';
import { UpcomingStore } from '../academic/upcoming-store.js';
import type { UpcomingTask } from '@x/shared/dist/academic.js';

const KNOWLEDGE_DIR = path.join(WorkDir, 'knowledge');
const DAILY_NOTE_PATH = path.join(KNOWLEDGE_DIR, 'Today.md');

const QUOTES = [
  "The secret of getting ahead is getting started. — Mark Twain",
  "Success is the sum of small repeated efforts. — Robert Collier",
  "It does not matter how slowly you go as long as you do not stop. — Confucius",
  "The expert in anything was once a beginner. — Helen Hayes",
  "Education is the most powerful weapon to change the world. — Nelson Mandela",
  "Believe you can and you're halfway there. — Theodore Roosevelt",
  "The future belongs to those who believe in their dreams. — Eleanor Roosevelt",
  "Strive for progress, not perfection. — Unknown",
  "You don't have to be great to start, but you have to start to be great. — Zig Ziglar",
  "Small daily improvements lead to stunning results. — Robin Sharma",
];

const MS_PER_DAY = 86400000;

function randomQuote(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isSoon(d: Date, now: Date, days: number): boolean {
  const diff = d.getTime() - now.getTime();
  return diff >= 0 && diff <= days * MS_PER_DAY;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toTaskItem(a: UpcomingTask | import('@x/shared/dist/academic.js').Assignment): {
  title: string; courseId: string; dueDate: Date; priority: string; mdPath?: string;
} {
  return {
    title: a.title,
    courseId: a.courseId,
    dueDate: new Date(a.dueDate),
    priority: a.priority ?? 'medium',
    mdPath: 'mdPath' in a ? (a as UpcomingTask).mdPath : undefined,
  };
}

export async function ensureDailyNote(): Promise<void> {
  const taskManager = new TaskManager(path.join(WorkDir, 'academic'));
  const upcomingStore = new UpcomingStore(KNOWLEDGE_DIR);
  const now = new Date();

  const [legacyAssignments, upcomingTasks] = await Promise.all([
    taskManager.listAssignments(),
    upcomingStore.listTasks(),
  ]);

  const legacyActive = legacyAssignments
    .filter((a) => a.status !== 'graded' && a.status !== 'submitted');

  // Merge: upcoming tasks come first, deduplicate by title+courseId
  const seen = new Set<string>();
  const all: ReturnType<typeof toTaskItem>[] = [];

  for (const t of upcomingTasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())) {
    const key = `${t.courseId}:${t.title}`;
    seen.add(key);
    all.push(toTaskItem(t));
  }
  for (const a of legacyActive) {
    const key = `${a.courseId}:${a.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      all.push(toTaskItem(a));
    }
  }
  all.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const active = all;
  const dueToday = active.filter((a) => isSameDay(a.dueDate, now));
  const urgent = active.filter((a) => a.priority === 'high' || isSoon(a.dueDate, now, 3));
  const upcoming = active.filter((a) => !isSameDay(a.dueDate, now) && a.dueDate > now);

  const lines: string[] = ['# Today\'s Plan', '', `> ${randomQuote()}`, ''];

  if (dueToday.length > 0) {
    lines.push('## Due Today', '');
    for (const a of dueToday) {
      const flag = a.priority === 'high' ? ' ⚠️' : '';
      const label = `**${a.title}** — ${a.courseId}${flag}`;
      if (a.mdPath) lines.push(`- [ ] [${label}](${a.mdPath})`);
      else lines.push(`- [ ] ${label}`);
    }
    lines.push('');
  }

  if (urgent.length > 0) {
    lines.push('## Priorities', '');
    for (const a of urgent) {
      const dueStr = fmtDate(a.dueDate);
      const label = `**${a.title}** — ${a.courseId} (due ${dueStr})`;
      if (a.mdPath) lines.push(`- [ ] [${label}](${a.mdPath})`);
      else lines.push(`- [ ] ${label}`);
    }
    lines.push('');
  }

  if (upcoming.length > 0) {
    lines.push('## Upcoming', '');
    for (const a of upcoming) {
      const dueStr = fmtDate(a.dueDate);
      const label = `**${a.title}** — ${a.courseId} (due ${dueStr})`;
      if (a.mdPath) lines.push(`- [ ] [${label}](${a.mdPath})`);
      else lines.push(`- [ ] ${label}`);
    }
    lines.push('');
  }

  if (dueToday.length === 0 && urgent.length === 0 && upcoming.length === 0) {
    lines.push('_No upcoming assignments. Free day to review or get ahead._', '');
  }

  await fs.promises.mkdir(KNOWLEDGE_DIR, { recursive: true });
  await fs.promises.writeFile(DAILY_NOTE_PATH, lines.join('\n'), 'utf-8');
  console.log('[DailyNote] Generated today.md');
}

export async function refreshDailyNote(): Promise<void> {
  return ensureDailyNote();
}
