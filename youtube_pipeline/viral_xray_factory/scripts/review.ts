// Lists videos that are fully rendered and waiting for a human before
// publishing, with the exact commands to watch and ship them.
//
// Usage: npm run review

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {loadConcepts, readState} from './lib/content';
import {renderOutputs} from './lib/render-targets';

const root = process.cwd();

const exists = (file: string) =>
  fs
    .access(path.resolve(root, file))
    .then(() => true)
    .catch(() => false);

const run = async () => {
  const concepts = await loadConcepts();
  const state = await readState();

  let ready = 0;
  for (const concept of concepts) {
    if (state[concept.id]?.published?.youtube) continue;
    const targets = renderOutputs(concept);
    const rendered = await Promise.all(targets.map((target) => exists(target.relFile)));
    if (!rendered.every(Boolean)) continue;

    ready += 1;
    console.log(`\n${concept.upload.title}`);
    console.log(`  id: ${concept.id} (${concept.status}, ${concept.series})`);
    console.log(`  hook: ${concept.hook}`);
    for (const target of targets) {
      console.log(`  watch: open ${target.relFile}`);
    }
    console.log(`  bundle: bundles/${concept.id}/ (YouTube copy + TikTok/Instagram captions)`);
    console.log(`  publish: npm run publish -- ${concept.id}   # private by default; add --public to go live`);
  }

  if (ready === 0) {
    console.log('Nothing waiting for review. Build something: npm run pipeline -- <id>');
  } else {
    console.log(`\n${ready} video${ready === 1 ? '' : 's'} ready for review.`);
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
