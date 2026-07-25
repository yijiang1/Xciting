// Weekday -> content theme lookup for the daily rotation. Config lives in
// content/theme-calendar.json so the schedule is editable without touching
// code.

import path from 'node:path';
import {z} from 'zod';
import {projectRoot, readJson} from './content';

const themeConfigSchema = z.object({
  theme: z.string().min(1),
  label: z.string().min(1),
  series: z.enum(['science', 'xray', 'roundtable']),
});
export type ThemeConfig = z.infer<typeof themeConfigSchema>;

const calendarSchema = z.object({
  timezone: z.string().min(1),
  days: z.record(z.string(), themeConfigSchema),
});
type Calendar = z.infer<typeof calendarSchema>;

const calendarFile = path.resolve(projectRoot, 'content/theme-calendar.json');

export const loadCalendar = async (): Promise<Calendar> =>
  calendarSchema.parse(await readJson(calendarFile, {timezone: 'UTC', days: {}}));

export const themeForDate = async (date = new Date()): Promise<ThemeConfig> => {
  const calendar = await loadCalendar();
  const weekday = new Intl.DateTimeFormat('en-US', {timeZone: calendar.timezone, weekday: 'long'}).format(date).toLowerCase();
  const config = calendar.days[weekday];
  if (!config) throw new Error(`No theme configured for "${weekday}" in content/theme-calendar.json`);
  return config;
};
