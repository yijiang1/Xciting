// content/topic-bank.json: a log of every topic ever picked (used=true,
// with the concept it produced) plus optional pre-vetted candidates
// (used=false) that scripts/lib/strategist.ts may offer up or ignore.
// generate-concepts.ts also draws from it directly via --auto.

import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {projectRoot, readJson} from './content';

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
