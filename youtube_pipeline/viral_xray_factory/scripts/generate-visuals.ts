// Generates cinematic footage for every beat with a SOTA video model:
//   - Sora 2 / Sora 2 Pro via the OpenAI Videos API (default when only
//     OPENAI_API_KEY is set)
//   - Veo 3.1 / Veo 3.1 Fast via the Gemini API (set GEMINI_API_KEY and/or
//     VIDEO_PROVIDER=veo)
//
// Clips are cached under public/footage/<conceptId>/ and indexed in
// public/data/footage.json. The Remotion composition uses the footage as the
// full-bleed visual layer and falls back to the procedural SVG scenes for any
// beat without a clip.
//
// Usage:
//   npm run generate:visuals -- <conceptId> [conceptId...]
//   npm run generate:visuals -- --all [--force] [--dry-run]

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import {concepts, VideoConcept} from '../src/concepts';
import {cinema, NEGATIVE_PROMPT} from '../src/cinema';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const footageDir = path.resolve(root, 'public/footage');
const dataDir = path.resolve(root, 'public/data');
const manifestFile = path.join(dataDir, 'footage.json');

type FootageClip = {beat?: number; file: string; seconds: number; prompt: string; provider: string; model: string};
type FootageManifest = Record<string, {mode: 'per-beat' | 'ambient'; clips: FootageClip[]}>;

type Provider = 'sora' | 'veo';

const provider: Provider = (() => {
  const requested = process.env.VIDEO_PROVIDER;
  if (requested === 'sora' || requested === 'veo') return requested;
  if (process.env.GEMINI_API_KEY) return 'veo';
  return 'sora';
})();

const soraModel = process.env.SORA_MODEL ?? 'sora-2';
const veoModel = process.env.VEO_MODEL ?? 'veo-3.1-fast-generate-preview';

// Approximate USD per generated second (2026-07 pricing; check current rates).
const pricePerSecond: Record<string, number> = {
  'sora-2': 0.1,
  'sora-2-pro': 0.3,
  'veo-3.1-generate-preview': 0.4,
  'veo-3.1-fast-generate-preview': 0.15,
};

const model = provider === 'sora' ? soraModel : veoModel;
const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const promptFor = (concept: VideoConcept, shot: string): string =>
  `${cinema[concept.id]?.stylePrompt ?? ''}\n\nShot: ${shot}\n\n${NEGATIVE_PROMPT}`.trim();

type PlannedClip = {
  conceptId: string;
  beat?: number;
  seconds: number;
  prompt: string;
  file: string;
  relFile: string;
};

const readJson = async <T>(file: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const clipSeconds = (beatDuration: number | undefined): number => {
  if (provider === 'veo') return 8; // Veo 3.1 clips are up to 8s; we loop in Remotion.
  const target = beatDuration ?? 8;
  if (target <= 4.2) return 4;
  if (target <= 8.4) return 8;
  return 12;
};

const planClips = async (selected: VideoConcept[]): Promise<PlannedClip[]> => {
  const timings = await readJson<Record<string, {beats: Array<{start: number; end: number}>}>>(
    path.join(dataDir, 'timings.json'),
    {},
  );
  const planned: PlannedClip[] = [];

  for (const concept of selected) {
    const spec = cinema[concept.id];
    if (!spec) {
      console.warn(`No cinema spec for ${concept.id}; skipping.`);
      continue;
    }
    if (spec.mode === 'ambient') {
      for (const [index, shot] of (spec.ambientShots ?? []).entries()) {
        const relFile = `footage/${concept.id}/ambient-${String(index + 1).padStart(2, '0')}.mp4`;
        planned.push({
          conceptId: concept.id,
          seconds: clipSeconds(undefined),
          prompt: promptFor(concept, shot),
          file: path.join(root, 'public', relFile),
          relFile,
        });
      }
      continue;
    }
    for (let index = 0; index < concept.beats.length; index += 1) {
      const shot = spec.shots?.[index] ?? concept.beats[index].visual;
      const beatTiming = timings[concept.id]?.beats?.[index];
      const beatDuration = beatTiming ? beatTiming.end - beatTiming.start : undefined;
      const relFile = `footage/${concept.id}/beat-${String(index + 1).padStart(2, '0')}.mp4`;
      planned.push({
        conceptId: concept.id,
        beat: index,
        seconds: clipSeconds(beatDuration),
        prompt: promptFor(concept, shot),
        file: path.join(root, 'public', relFile),
        relFile,
      });
    }
  }
  return planned;
};

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const generateWithSora = async (prompt: string, seconds: number, outFile: string) => {
  const videos = (client as unknown as {videos: any}).videos;
  if (!videos) {
    throw new Error('This openai SDK version has no Videos API. Run: npm install openai@latest');
  }
  const size = soraModel.includes('pro') ? '1792x1024' : '1280x720';
  let video = await videos.create({model: soraModel, prompt, size, seconds: String(seconds)});
  while (video.status === 'queued' || video.status === 'in_progress') {
    await sleep(8000);
    video = await videos.retrieve(video.id);
    process.stdout.write(`\r    status: ${video.status} ${video.progress ?? ''}%   `);
  }
  process.stdout.write('\n');
  if (video.status !== 'completed') {
    throw new Error(`Sora generation failed: ${JSON.stringify(video.error ?? video.status)}`);
  }
  const content = await videos.downloadContent(video.id);
  await fs.writeFile(outFile, Buffer.from(await content.arrayBuffer()));
};

const generateWithVeo = async (prompt: string, outFile: string) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing for VIDEO_PROVIDER=veo.');
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  const start = await fetch(`${base}/models/${veoModel}:predictLongRunning`, {
    method: 'POST',
    headers: {'x-goog-api-key': apiKey, 'content-type': 'application/json'},
    body: JSON.stringify({
      instances: [{prompt}],
      parameters: {aspectRatio: '16:9', resolution: process.env.VEO_RESOLUTION ?? '1080p'},
    }),
  });
  if (!start.ok) throw new Error(`Veo request failed (${start.status}): ${await start.text()}`);
  let operation = (await start.json()) as any;

  while (!operation.done) {
    await sleep(10000);
    const poll = await fetch(`${base}/${operation.name}`, {headers: {'x-goog-api-key': apiKey}});
    if (!poll.ok) throw new Error(`Veo poll failed (${poll.status}): ${await poll.text()}`);
    operation = await poll.json();
    process.stdout.write('\r    status: generating...   ');
  }
  process.stdout.write('\n');
  if (operation.error) throw new Error(`Veo generation failed: ${JSON.stringify(operation.error)}`);

  const uri: string | undefined =
    operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
    operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!uri) throw new Error(`Veo returned no video: ${JSON.stringify(operation.response)}`);
  const download = await fetch(uri, {headers: {'x-goog-api-key': apiKey}});
  if (!download.ok) throw new Error(`Veo download failed (${download.status})`);
  await fs.writeFile(outFile, Buffer.from(await download.arrayBuffer()));
};

// ---------------------------------------------------------------------------

const run = async () => {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');
  const ids = args.filter((arg) => !arg.startsWith('-'));

  const missing = ids.filter((id) => !concepts.some((concept) => concept.id === id));
  if (missing.length > 0) throw new Error(`Unknown concept id(s): ${missing.join(', ')}`);
  if (ids.length === 0 && !all) {
    console.log('Pass concept ids, or --all for everything. Example:');
    console.log('  npm run generate:visuals -- cartoon_bragg_detective');
    console.log(`Available: ${concepts.map((concept) => concept.id).join(', ')}`);
    return;
  }
  if (provider === 'sora' && !process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing.');

  const selected = all ? concepts : concepts.filter((concept) => ids.includes(concept.id));
  const planned = await planClips(selected);
  const manifest = await readJson<FootageManifest>(manifestFile, {});

  const pending = [] as PlannedClip[];
  for (const clip of planned) {
    const exists = await fs
      .access(clip.file)
      .then(() => true)
      .catch(() => false);
    if (exists && !force) continue;
    pending.push(clip);
  }

  const totalSeconds = pending.reduce((sum, clip) => sum + clip.seconds, 0);
  const rate = pricePerSecond[model] ?? 0.2;
  console.log(`Provider: ${provider} (${model})`);
  console.log(`Clips to generate: ${pending.length}/${planned.length} (${totalSeconds}s, ~$${(totalSeconds * rate).toFixed(2)} estimated)`);

  if (dryRun) {
    for (const clip of pending) {
      console.log(`\n--- ${clip.relFile} (${clip.seconds}s) ---\n${clip.prompt}`);
    }
    return;
  }

  for (const clip of planned) {
    const entry = manifest[clip.conceptId] ?? {mode: cinema[clip.conceptId].mode, clips: []};
    manifest[clip.conceptId] = entry;

    const needsGeneration = pending.includes(clip);
    if (needsGeneration) {
      await fs.mkdir(path.dirname(clip.file), {recursive: true});
      console.log(`Generating ${clip.relFile} (${clip.seconds}s)`);
      try {
        if (provider === 'sora') await generateWithSora(clip.prompt, clip.seconds, clip.file);
        else await generateWithVeo(clip.prompt, clip.file);
      } catch (error) {
        console.error(`  FAILED ${clip.relFile}: ${error instanceof Error ? error.message : error}`);
        console.error('  The composition will fall back to procedural visuals for this beat.');
        continue;
      }
    }

    const record: FootageClip = {beat: clip.beat, file: clip.relFile, seconds: clip.seconds, prompt: clip.prompt, provider, model};
    const existingIndex = entry.clips.findIndex((existing) => existing.file === clip.relFile);
    if (existingIndex >= 0) entry.clips[existingIndex] = record;
    else entry.clips.push(record);

    await fs.mkdir(dataDir, {recursive: true});
    await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(`Footage manifest updated: ${path.relative(root, manifestFile)}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
