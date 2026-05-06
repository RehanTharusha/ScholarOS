import path from 'path';
import fs from 'fs';
import { WorkDir } from '../config/config.js';
import { TaskManager } from '../academic/task-manager.js';

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

export async function ensureDailyNote(): Promise<void> {
  const taskManager = new TaskManager(path.join(WorkDir, 'academic'));
  const now = new Date();
  const all = await taskManager.listAssignments();

  const active = all
    .filter((a) => a.status !== 'graded' && a.status !== 'submitted')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const dueToday = active.filter((a) => isSameDay(new Date(a.dueDate), now));
  const urgent = active.filter((a) => a.priority === 'high' || isSoon(new Date(a.dueDate), now, 3));
  const upcoming = active.filter((a) => !isSameDay(new Date(a.dueDate), now) && new Date(a.dueDate) > now);

  const lines: string[] = ['# Today\'s Plan', '', `> ${randomQuote()}`, ''];

  if (dueToday.length > 0) {
    lines.push('## Due Today', '');
    for (const a of dueToday) {
      lines.push(`- [ ] **${a.title}** — ${a.courseId}${a.priority === 'high' ? ' ⚠️' : ''}`);
    }
    lines.push('');
  }

  if (urgent.length > 0) {
    lines.push('## Priorities', '');
    for (const a of urgent) {
      lines.push(`- [ ] **${a.title}** — ${a.courseId} (due ${fmtDate(new Date(a.dueDate))})`);
    }
    lines.push('');
  }

  if (upcoming.length > 0) {
    lines.push('## Upcoming', '');
    for (const a of upcoming) {
      lines.push(`- [ ] **${a.title}** — ${a.courseId} (due ${fmtDate(new Date(a.dueDate))})`);
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
