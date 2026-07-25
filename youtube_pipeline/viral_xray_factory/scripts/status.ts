// Prints the production status of every concept: script -> audio -> footage
// -> renders -> bundle -> published.
//
// Usage: npm run status

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {loadConcepts, readJson, readState} from './lib/content';
import {renderOutputs} from './lib/render-targets';

const root = process.cwd();

const exists = (file: string) =>
  fs
    .access(path.resolve(root, file))
    .then(() => true)
    .catch(() => false);

type FootageManifest = Record<string, {clips: Array<{orientation?: string}>}>;

const run = async () => {
  const concepts = await loadConcepts();
  const state = await readState();
  const footage = await readJson<FootageManifest>(path.resolve(root, 'public/data/footage.json'), {});

  const rows: string[][] = [['concept', 'status', 'audio', 'footage', 'renders', 'bundle', 'published']];
  for (const concept of concepts) {
    const audio = (await exists(`public/audio/${concept.id}.mp3`)) ? 'yes' : '-';

    const clips = footage[concept.id]?.clips ?? [];
    const portraitClips = clips.filter((clip) => clip.orientation === 'portrait').length;
    const landscapeClips = clips.length - portraitClips;
    const spend = state[concept.id]?.footageSpendUsd;
    const footageCell =
      clips.length === 0
        ? '-'
        : `${portraitClips}p/${landscapeClips}l${spend ? ` $${spend}` : ''}`;

    const renderCells: string[] = [];
    for (const target of renderOutputs(concept)) {
      renderCells.push((await exists(target.relFile)) ? target.format[0] : `(${target.format[0]})`);
    }

    const bundle = (await exists(`bundles/${concept.id}`)) ? 'yes' : '-';
    const youtube = state[concept.id]?.published?.youtube;
    const published = youtube ? `youtu.be/${youtube.videoId} (${youtube.privacyStatus})` : '-';

    rows.push([concept.id, concept.status, audio, footageCell, renderCells.join(' '), bundle, published]);
  }

  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  for (const [index, row] of rows.entries()) {
    console.log(row.map((cell, column) => cell.padEnd(widths[column])).join('  '));
    if (index === 0) console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  }
  console.log('\nrenders: p=portrait l=landscape, parentheses = not rendered yet');
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
