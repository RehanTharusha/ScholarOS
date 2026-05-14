import z from 'zod';

export const TrackScheduleSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('cron').describe('Fires at exact cron times'),
        expression: z.string().describe('5-field cron expression, quoted (e.g. "0 * * * *")'),
    }).describe('Recurring at exact times'),
    z.object({
        type: z.literal('window').describe('Fires at most once per cron occurrence, only within a time-of-day window'),
        cron: z.string().describe('5-field cron expression, quoted'),
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe('24h HH:MM, local time'),
        endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe('24h HH:MM, local time'),
    }).describe('Recurring within a time-of-day window'),
    z.object({
        type: z.literal('once').describe('Fires once and never again'),
        runAt: z.string().describe('ISO 8601 datetime, local time, no Z suffix (e.g. "2026-04-14T09:00:00")'),
    }).describe('One-shot future run'),
]).describe('Optional schedule. Omit entirely for manual-only tracks.');

export type TrackSchedule = z.infer<typeof TrackScheduleSchema>;

export const TrackBlockSchema = z.object({
    trackId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).describe('Kebab-case identifier, unique within the note file'),
    instruction: z.string().min(1).describe('What the agent should produce each run — specific, single-focus, imperative'),
    eventMatchCriteria: z.string().optional().describe('When set, this track participates in event-based triggering. Describe what kinds of events should consider this track for an update (e.g. "Emails about Q3 planning"). Omit to disable event triggers — the track will only run on schedule or manually.'),
    active: z.boolean().default(true).describe('Set false to pause without deleting'),
    schedule: TrackScheduleSchema.optional(),
    model: z.string().optional().describe('ADVANCED — leave unset. Per-track LLM model override (e.g. "anthropic/claude-sonnet-4.6"). Only set when the user explicitly asked for a specific model for THIS track. The global default already picks a tuned model for tracks; overriding usually makes things worse, not better.'),
    provider: z.string().optional().describe('ADVANCED — leave unset. Per-track provider name override (e.g. "openai", "anthropic"). Only set when the user explicitly asked for a specific provider for THIS track. Almost always omitted; the global default flows through correctly.'),
    lastRunAt: z.string().optional().describe('Runtime-managed — never write this yourself'),
    lastRunId: z.string().optional().describe('Runtime-managed — never write this yourself'),
    lastRunSummary: z.string().optional().describe('Runtime-managed — never write this yourself'),
});

export type TrackBlock = z.infer<typeof TrackBlockSchema>;
