// One command from concept JSON to review-ready videos. Runs every stage
// idempotently: audio (TTS + word timestamps), optional music bed, subtitles,
// paid footage (budget-guarded, approved concepts only), render in every
// declared format, QA verification, and per-platform bundles.
//
// Publishing is intentionally NOT part of the pipeline — review first, then
// `npm run publish -- <id>`.
//
// Usage:
//   npm run pipeline -- <conceptId...> [--force] [--footage-ok] [--skip-footage]
//   npm run pipeline -- --all-approved      # every approved concept
//
// With no video API key (or --skip-footage) the videos still build with
// procedural visuals at zero cost.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {execa} from 'execa';
import {loadConcepts, pruneFootageManifest, syncGeneratedConcepts} from './lib/content';
import {renderOutputs} from './lib/render-targets';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const args = process.argv.slice(2);
const force = args.includes('--force');
const footageOk = args.includes('--footage-ok');
const skipFootage = args.includes('--skip-footage');
const allApproved = args.includes('--all-approved');
const ids = args.filter((arg) => !arg.startsWith('-'));

const script = async (name: string, scriptArgs: string[]) => {
  console.log(`\n=== ${name} ${scriptArgs.join(' ')} ===`);
  await execa('npx', ['tsx', `scripts/${name}.ts`, ...scriptArgs], {stdio: 'inherit'});
};

const exists = (file: string) =>
  fs
    .access(path.resolve(root, file))
    .then(() => true)
    .catch(() => false);

const run = async () => {
  // Keep the generated module and footage manifest honest before bundling.
  const concepts = await syncGeneratedConcepts();
  await pruneFootageManifest();

  const unknown = ids.filter((id) => !concepts.some((concept) => concept.id === id));
  if (unknown.length > 0) throw new Error(`Unknown concept id(s): ${unknown.join(', ')}`);

  const selected = allApproved
    ? concepts.filter((concept) => concept.status === 'approved')
    : concepts.filter((concept) => ids.includes(concept.id));
  if (selected.length === 0) {
    console.log('Nothing selected. Usage:');
    console.log('  npm run pipeline -- <conceptId...> [--force] [--footage-ok] [--skip-footage]');
    console.log('  npm run pipeline -- --all-approved');
    console.log(`Available: ${concepts.map((concept) => `${concept.id} (${concept.status})`).join(', ')}`);
    return;
  }

  const hasVideoKey = Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);

  for (const concept of selected) {
    console.log(`\n############ ${concept.id} [${concept.status}] ############`);

    // 1. Narration + word timestamps (skipped when already built).
    const audioReady = (await exists(`public/audio/${concept.id}.mp3`)) && !force;
    if (audioReady) console.log(`Audio exists for ${concept.id}; skipping TTS (use --force to redo).`);
    else await script('generate-audio', [concept.id]);

    // 2. Optional music bed (no-ops without ELEVENLABS_API_KEY).
    await script('generate-music', [concept.id]);

    // 3. Subtitles from the timing data.
    await script('write-subtitles', []);

    // 4. Paid footage — approved concepts only, guarded by MAX_VIDEO_BUDGET_USD.
    if (skipFootage) {
      console.log('Footage skipped (--skip-footage): rendering with procedural visuals.');
    } else if (!hasVideoKey) {
      console.log('No video API key: rendering with procedural visuals.');
    } else if (concept.status !== 'approved' && !footageOk) {
      console.log(`${concept.id} is a draft: skipping paid footage (npm run approve -- ${concept.id} to clear it).`);
    } else {
      await script('generate-visuals', [concept.id, ...(footageOk ? ['--footage-ok'] : []), ...(force ? ['--force'] : [])]);
    }

    // 5. Metadata + re-sync so the render sees fresh concept/footage data.
    await script('write-metadata', [concept.id]);
    await syncGeneratedConcepts();

    // 6. Render each declared format, then QA it.
    await script('render-all', [concept.id, ...(force ? ['--force'] : [])]);
    await script('verify-renders', [concept.id]);

    // 7. Per-platform bundle for review + manual posting.
    await script('bundle', [concept.id]);
  }

  console.log('\nAll selected concepts are built. Review, then publish:');
  for (const concept of selected) {
    for (const target of renderOutputs(concept)) {
      console.log(`  open ${target.relFile}`);
    }
  }
  console.log('  npm run publish -- <id>          # uploads to YouTube as private by default');
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
