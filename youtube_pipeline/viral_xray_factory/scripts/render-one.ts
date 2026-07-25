// Renders a single concept in one format.
//
// Usage: npm run render:one -- <conceptId> [portrait|landscape]
// Defaults to the concept's primary (first declared) format.

import path from 'node:path';
import process from 'node:process';
import {execa} from 'execa';
import {loadConcepts} from './lib/content';
import {compositionIdFor, renderFileFor} from './lib/render-targets';

const [id, formatArg] = process.argv.slice(2);
if (!id) {
  console.error('Usage: npm run render:one -- <conceptId> [portrait|landscape]');
  process.exit(1);
}

const concepts = await loadConcepts();
const concept = concepts.find((candidate) => candidate.id === id);
if (!concept) {
  console.error(`Unknown concept id: ${id}. Available: ${concepts.map((candidate) => candidate.id).join(', ')}`);
  process.exit(1);
}

const format = formatArg === 'portrait' || formatArg === 'landscape' ? formatArg : concept.formats[0];
if (!concept.formats.includes(format)) {
  console.error(`${id} does not declare the ${format} format (formats: ${concept.formats.join(', ')}).`);
  process.exit(1);
}

const root = process.cwd();
const entry = path.resolve(root, 'src/index.ts');
const output = path.resolve(root, renderFileFor(id, format));

await execa(
  'npx',
  [
    'remotion',
    'render',
    entry,
    compositionIdFor(id, format),
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
