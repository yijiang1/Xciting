// Renders concepts in every format they declare (portrait for Shorts/TikTok/
// Reels, landscape for classic YouTube).
//
// Usage:
//   npm run render                       # everything
//   npm run render -- <conceptId...>     # selected concepts
//   npm run render -- <id> --formats portrait
//   npm run render -- <id> --force       # re-render even if the file exists

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {execa} from 'execa';
import type {Format} from './lib/schema';
import {loadConcepts} from './lib/content';
import {renderOutputs} from './lib/render-targets';

const root = process.cwd();
const entry = path.resolve(root, 'src/index.ts');

const args = process.argv.slice(2);
const force = args.includes('--force');
const formatsFlagIndex = args.findIndex((arg) => arg === '--formats');
const formatsFilter = formatsFlagIndex >= 0 ? (args[formatsFlagIndex + 1]?.split(',') as Format[]) : undefined;
const formatsValueIndex = formatsFlagIndex >= 0 ? formatsFlagIndex + 1 : -1;
const ids = args.filter((arg, index) => !arg.startsWith('-') && index !== formatsValueIndex);

const concepts = await loadConcepts();
const missing = ids.filter((id) => !concepts.some((concept) => concept.id === id));
if (missing.length > 0) {
  console.error(`Unknown concept id(s): ${missing.join(', ')}`);
  process.exit(1);
}
const selected = ids.length > 0 ? concepts.filter((concept) => ids.includes(concept.id)) : concepts;

await fs.mkdir(path.resolve(root, 'renders'), {recursive: true});

for (const concept of selected) {
  for (const target of renderOutputs(concept)) {
    if (formatsFilter && !formatsFilter.includes(target.format)) continue;
    const output = path.resolve(root, target.relFile);
    const exists = await fs
      .access(output)
      .then(() => true)
      .catch(() => false);
    if (exists && !force) {
      console.log(`Skipping ${target.relFile} (exists; use --force to re-render)`);
      continue;
    }
    console.log(`Rendering ${concept.id} [${target.format}] -> ${target.relFile}`);
    await execa(
      'npx',
      [
        'remotion',
        'render',
        entry,
        target.compositionId,
        output,
        '--codec=h264',
        '--pixel-format=yuv420p',
        '--crf=16',
        '--x264-preset=slow',
        '--audio-bitrate=320k',
        '--concurrency=2',
      ],
      {stdio: 'inherit'},
    );
  }
}
