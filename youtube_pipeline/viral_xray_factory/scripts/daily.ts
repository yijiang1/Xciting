// The free half of the daily loop: picks today's theme from
// content/theme-calendar.json, pulls the next unused topic for that theme
// (or asks the LLM to mint fresh ones when the theme's queue is empty), and
// writes a draft concept. No money is spent here -- footage/TTS still need
// `npm run approve` + `npm run pipeline` from a human.
//
// Usage: npm run daily

import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {generateOne} from './generate-concepts';
import {syncGeneratedConcepts} from './lib/content';
import {themeForDate} from './lib/theme-calendar';
import {TopicEntry, loadTopicBank, replenishTheme, saveTopicBank} from './lib/topic-bank';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const run = async () => {
  const theme = await themeForDate();
  console.log(`Today's theme: ${theme.label} (${theme.series})`);

  const bank = await loadTopicBank();
  let candidates = bank.topics.filter((entry) => entry.theme === theme.theme && !entry.used);

  if (candidates.length === 0) {
    console.log(`No unused topics for "${theme.label}" -- asking the LLM for more.`);
    const existingTopics = bank.topics.filter((entry) => entry.theme === theme.theme).map((entry) => entry.topic);
    const fresh = await replenishTheme({themeLabel: theme.label, series: theme.series, existingTopics});
    const newEntries: TopicEntry[] = fresh.map((entry) => ({
      topic: entry.topic,
      angle: entry.angle,
      series: theme.series,
      theme: theme.theme,
      used: false,
    }));
    bank.topics.push(...newEntries);
    await saveTopicBank(bank);
    candidates = newEntries;
  }

  const entry = candidates[0];
  const concept = await generateOne(entry.topic, {series: theme.series, formats: ['portrait'], angle: entry.angle});

  entry.used = true;
  entry.conceptId = concept.id;
  await saveTopicBank(bank);
  await syncGeneratedConcepts();

  console.log(`\nDraft ready: ${concept.id} (${theme.label})`);
  console.log(`Next: npm run approve -- ${concept.id}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
