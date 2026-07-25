// The free half of the daily loop: scripts/lib/strategist.ts reasons over
// past performance (views/retention/subs -- the closest proxies to revenue
// until the channel is monetized) and picks today's theme, presentation
// style, series, and topic via guided explore/exploit; this script then
// writes the draft concept. No money is spent here -- footage/TTS still
// need `npm run approve` + `npm run pipeline` from a human.
//
// Usage: npm run daily

import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {generateOne} from './generate-concepts';
import {syncGeneratedConcepts} from './lib/content';
import {chooseDirection} from './lib/strategist';
import {loadTopicBank, saveTopicBank} from './lib/topic-bank';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const run = async () => {
  const direction = await chooseDirection();

  const concept = await generateOne(direction.topic, {
    series: direction.series,
    formats: ['portrait'],
    style: direction.style,
    angle: direction.angle,
    theme: direction.theme,
  });

  const bank = await loadTopicBank();
  const reused = bank.topics.find((entry) => !entry.used && entry.topic === direction.topic);
  if (reused) {
    reused.used = true;
    reused.conceptId = concept.id;
  } else {
    bank.topics.push({
      topic: direction.topic,
      angle: direction.angle,
      series: direction.series,
      theme: direction.theme,
      used: true,
      conceptId: concept.id,
    });
  }
  await saveTopicBank(bank);
  await syncGeneratedConcepts();

  console.log(`\nDraft ready: ${concept.id} (${direction.themeLabel} / ${direction.style})`);
  console.log(`Next: npm run approve -- ${concept.id}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
