// Generates a loopable instrumental music bed per concept with ElevenLabs
// Music. Optional: skipped entirely unless ELEVENLABS_API_KEY is set. Beds are
// written to public/music/ and indexed in public/data/music.json; the Remotion
// composition loops them quietly under the narration.
//
// Usage: npm run generate:music -- [conceptId...] [--force]

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {loadConcepts} from './lib/content';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const musicDir = path.resolve(root, 'public/music');
const dataDir = path.resolve(root, 'public/data');
const manifestFile = path.join(dataDir, 'music.json');

const bedLengthMs = Number(process.env.MUSIC_LENGTH_MS ?? 60_000);

const readJson = async <T>(file: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const run = async () => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.log('ELEVENLABS_API_KEY not set; skipping music generation.');
    return;
  }

  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const ids = args.filter((arg) => !arg.startsWith('-'));
  const concepts = await loadConcepts();
  const selected = ids.length > 0 ? concepts.filter((concept) => ids.includes(concept.id)) : concepts;

  await fs.mkdir(musicDir, {recursive: true});
  await fs.mkdir(dataDir, {recursive: true});
  const manifest = await readJson<Record<string, string>>(manifestFile, {});

  for (const concept of selected) {
    // Sung concepts (concept.song) already carry full instrumentation from
    // Eleven Music; a second background bed would just fight the mix.
    if (concept.song) continue;
    const prompt = concept.cinema.musicPrompt;
    if (!prompt) continue;
    const relFile = `music/${concept.id}.mp3`;
    const outFile = path.join(root, 'public', relFile);
    const exists = await fs
      .access(outFile)
      .then(() => true)
      .catch(() => false);
    if (exists && !force) {
      manifest[concept.id] = relFile;
      continue;
    }

    console.log(`Generating music bed: ${concept.id}`);
    const response = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
      method: 'POST',
      headers: {'xi-api-key': apiKey, 'content-type': 'application/json'},
      body: JSON.stringify({prompt, music_length_ms: bedLengthMs}),
    });
    if (!response.ok) {
      console.error(`  FAILED (${response.status}): ${await response.text()}`);
      continue;
    }
    await fs.writeFile(outFile, Buffer.from(await response.arrayBuffer()));
    manifest[concept.id] = relFile;
  }

  await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Music manifest updated: ${path.relative(root, manifestFile)}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
