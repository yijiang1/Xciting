// content/topic-bank.json: the queue of not-yet-produced topics, grouped by
// theme. generate-concepts.ts consumes it via --auto; daily.ts consumes it
// per-theme and tops it up with the LLM when a theme runs dry, so the daily
// rotation never stalls waiting on a human to add topics.

import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {projectRoot, readJson} from './content';
import {generateStructured, llmModel} from './llm';

const topicEntrySchema = z.object({
  topic: z.string().min(1),
  series: z.enum(['science', 'xray', 'roundtable']),
  theme: z.string().min(1),
  angle: z.string().optional(),
  used: z.boolean().optional(),
  conceptId: z.string().optional(),
});
export type TopicEntry = z.infer<typeof topicEntrySchema>;

const topicBankSchema = z.object({topics: z.array(topicEntrySchema)});
export type TopicBank = z.infer<typeof topicBankSchema>;

export const topicBankFile = path.resolve(projectRoot, 'content/topic-bank.json');

export const loadTopicBank = async (): Promise<TopicBank> =>
  topicBankSchema.parse(await readJson(topicBankFile, {topics: []}));

export const saveTopicBank = async (bank: TopicBank): Promise<void> => {
  await fs.writeFile(topicBankFile, `${JSON.stringify(bank, null, 2)}\n`);
};

const replenishSchema = z.object({
  topics: z.array(z.object({topic: z.string().min(1), angle: z.string().min(1)})).min(1),
});

// Asks the LLM for fresh candidate topics when a theme's queue is empty.
// Mirrors the craft rules in generate-concepts.ts (concrete mechanism,
// visually filmable, no duplicates of what's already in the bank).
export const replenishTheme = async (options: {
  themeLabel: string;
  series: 'science' | 'xray' | 'roundtable';
  existingTopics: string[];
  count?: number;
}): Promise<Array<{topic: string; angle: string}>> => {
  const count = options.count ?? 5;
  const system = `You are the topic researcher for "Exciting", a channel of visually striking, scientifically accurate short explainer videos (YouTube Shorts, TikTok, Reels). Propose brand-new video topics for the theme "${options.themeLabel}". Each topic must be ONE concrete, surprising, visually-filmable mechanism a viewer can retell to a friend afterward -- not a vague subject area. Scientific accuracy is non-negotiable.`;
  const user = [
    `Propose ${count} new topics for the "${options.themeLabel}" theme (channel series: ${options.series}).`,
    options.existingTopics.length > 0
      ? `Already covered -- do not repeat or closely rephrase any of these:\n${options.existingTopics.map((topic) => `- ${topic}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  console.log(`Replenishing "${options.themeLabel}" topic bank (${llmModel()})...`);
  const result = await generateStructured({system, user, schema: replenishSchema});
  return result.topics.slice(0, count);
};
