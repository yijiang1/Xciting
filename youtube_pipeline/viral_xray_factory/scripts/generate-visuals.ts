// Generates cinematic footage for every beat with a SOTA video model:
//   - Sora 2 / Sora 2 Pro via the OpenAI Videos API (default when only
//     OPENAI_API_KEY is set)
//   - Veo 3.1 / Veo 3.1 Fast via the Gemini API (set GEMINI_API_KEY and/or
//     VIDEO_PROVIDER=veo)
//
// Clips are generated per orientation (portrait for Shorts/TikTok/Reels,
// landscape for classic YouTube), cached under
// public/footage/<conceptId>/<orientation>/ and indexed in
// public/data/footage.json. The Remotion composition prefers clips matching
// its own orientation and falls back to cover-cropping the other one; beats
// with no clip at all use the procedural SVG scenes.
//
// Money guards: concepts must be status "approved", and the estimated cost per
// concept must stay under MAX_VIDEO_BUDGET_USD (default 6). Override either
// with --footage-ok.
//
// Usage:
//   npm run generate:visuals -- <conceptId> [conceptId...]
//   npm run generate:visuals -- --all [--force] [--dry-run] [--footage-ok]
//   npm run generate:visuals -- <conceptId> --formats portrait,landscape

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import type {StoredConcept, Format} from './lib/schema';
import {NEGATIVE_PROMPT, PORTRAIT_FRAMING} from './lib/schema';
import {loadConcepts, readJson, readState, updateState} from './lib/content';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const dataDir = path.resolve(root, 'public/data');
const manifestFile = path.join(dataDir, 'footage.json');

type FootageClip = {
  beat?: number;
  orientation?: Format;
  file: string;
  seconds: number;
  prompt: string;
  provider: string;
  model: string;
};
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

const maxVideoBudgetUsd = Number(process.env.MAX_VIDEO_BUDGET_USD ?? 6);

const model = provider === 'sora' ? soraModel : veoModel;
// Lazy so key-free commands (--dry-run, Veo-only setups) never construct it.
let cachedClient: OpenAI | undefined;
const client = () => (cachedClient ??= new OpenAI({apiKey: process.env.OPENAI_API_KEY}));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const promptFor = (concept: StoredConcept, shot: string, orientation: Format): string =>
  [concept.cinema.stylePrompt, `Shot: ${shot}`, orientation === 'portrait' ? PORTRAIT_FRAMING : '', NEGATIVE_PROMPT]
    .filter(Boolean)
    .join('\n\n')
    .trim();

type PlannedClip = {
  conceptId: string;
  beat?: number;
  orientation: Format;
  seconds: number;
  prompt: string;
  file: string;
  relFile: string;
};

const clipSeconds = (beatDuration: number | undefined): number => {
  if (provider === 'veo') return 8; // Veo 3.1 clips are up to 8s; we loop in Remotion.
  const target = beatDuration ?? 8;
  if (target <= 4.2) return 4;
  if (target <= 8.4) return 8;
  return 12;
};

const parseFormats = (value: string | undefined): Format[] | undefined => {
  if (!value) return undefined;
  const parts = value.split(',').map((part) => part.trim());
  for (const part of parts) {
    if (part !== 'portrait' && part !== 'landscape') throw new Error(`Unknown format "${part}" (expected portrait|landscape).`);
  }
  return parts as Format[];
};

const planClips = async (selected: StoredConcept[], formatsOverride: Format[] | undefined): Promise<PlannedClip[]> => {
  const timings = await readJson<Record<string, {beats: Array<{start: number; end: number}>}>>(
    path.join(dataDir, 'timings.json'),
    {},
  );
  const planned: PlannedClip[] = [];

  for (const concept of selected) {
    const spec = concept.cinema;
    const orientations = formatsOverride ?? concept.formats;
    for (const orientation of orientations) {
      if (spec.mode === 'ambient') {
        for (const [index, shot] of (spec.ambientShots ?? []).entries()) {
          const relFile = `footage/${concept.id}/${orientation}/ambient-${String(index + 1).padStart(2, '0')}.mp4`;
          planned.push({
            conceptId: concept.id,
            orientation,
            seconds: clipSeconds(undefined),
            prompt: promptFor(concept, shot, orientation),
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
        const relFile = `footage/${concept.id}/${orientation}/beat-${String(index + 1).padStart(2, '0')}.mp4`;
        planned.push({
          conceptId: concept.id,
          beat: index,
          orientation,
          seconds: clipSeconds(beatDuration),
          prompt: promptFor(concept, shot, orientation),
          file: path.join(root, 'public', relFile),
          relFile,
        });
      }
    }
  }
  return planned;
};

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const soraSize = (orientation: Format): string => {
  const pro = soraModel.includes('pro');
  if (orientation === 'portrait') return pro ? '1024x1792' : '720x1280';
  return pro ? '1792x1024' : '1280x720';
};

const generateWithSora = async (prompt: string, seconds: number, orientation: Format, outFile: string) => {
  const videos = (client() as unknown as {videos: any}).videos;
  if (!videos) {
    throw new Error('This openai SDK version has no Videos API. Run: npm install openai@latest');
  }
  let video = await videos.create({model: soraModel, prompt, size: soraSize(orientation), seconds: String(seconds)});
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

const generateWithVeo = async (prompt: string, orientation: Format, outFile: string) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing for VIDEO_PROVIDER=veo.');
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  const start = await fetch(`${base}/models/${veoModel}:predictLongRunning`, {
    method: 'POST',
    headers: {'x-goog-api-key': apiKey, 'content-type': 'application/json'},
    body: JSON.stringify({
      instances: [{prompt}],
      parameters: {
        aspectRatio: orientation === 'portrait' ? '9:16' : '16:9',
        resolution: process.env.VEO_RESOLUTION ?? '1080p',
      },
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
  const footageOk = args.includes('--footage-ok');
  const formatsFlagIndex = args.findIndex((arg) => arg === '--formats');
  const formatsOverride = parseFormats(formatsFlagIndex >= 0 ? args[formatsFlagIndex + 1] : undefined);
  const formatsValueIndex = formatsFlagIndex >= 0 ? formatsFlagIndex + 1 : -1;
  const ids = args.filter((arg, index) => !arg.startsWith('-') && index !== formatsValueIndex);

  const concepts = await loadConcepts();
  const missing = ids.filter((id) => !concepts.some((concept) => concept.id === id));
  if (missing.length > 0) throw new Error(`Unknown concept id(s): ${missing.join(', ')}`);
  if (ids.length === 0 && !all) {
    console.log('Pass concept ids, or --all for everything. Example:');
    console.log('  npm run generate:visuals -- cartoon_bragg_detective');
    console.log(`Available: ${concepts.map((concept) => concept.id).join(', ')}`);
    return;
  }
  if (!dryRun && provider === 'sora' && !process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing.');

  const selected = all ? concepts : concepts.filter((concept) => ids.includes(concept.id));

  // Draft concepts are not cleared for paid footage: skim the script first,
  // set "status": "approved" (npm run approve -- <id>), or pass --footage-ok.
  const drafts = selected.filter((concept) => concept.status !== 'approved');
  const cleared = footageOk ? selected : selected.filter((concept) => concept.status === 'approved');
  if (!footageOk && drafts.length > 0) {
    console.warn(`Skipping draft concepts (approve them or pass --footage-ok): ${drafts.map((concept) => concept.id).join(', ')}`);
  }

  const planned = await planClips(cleared, formatsOverride);
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

  const rate = pricePerSecond[model] ?? 0.2;
  const totalSeconds = pending.reduce((sum, clip) => sum + clip.seconds, 0);
  console.log(`Provider: ${provider} (${model})`);
  console.log(`Clips to generate: ${pending.length}/${planned.length} (${totalSeconds}s, ~$${(totalSeconds * rate).toFixed(2)} estimated)`);

  // Per-concept budget guard.
  const overBudget: string[] = [];
  for (const concept of cleared) {
    const conceptSeconds = pending.filter((clip) => clip.conceptId === concept.id).reduce((sum, clip) => sum + clip.seconds, 0);
    const estimate = conceptSeconds * rate;
    if (estimate > maxVideoBudgetUsd) {
      overBudget.push(`${concept.id} (~$${estimate.toFixed(2)} > $${maxVideoBudgetUsd})`);
    }
  }
  if (overBudget.length > 0 && !footageOk && !dryRun) {
    throw new Error(
      `Estimated cost exceeds MAX_VIDEO_BUDGET_USD for: ${overBudget.join(', ')}.\n` +
        'Re-run with --footage-ok to spend anyway, generate fewer formats (--formats portrait), or raise MAX_VIDEO_BUDGET_USD.',
    );
  }

  if (dryRun) {
    for (const clip of pending) {
      console.log(`\n--- ${clip.relFile} (${clip.seconds}s) ---\n${clip.prompt}`);
    }
    return;
  }

  const spentSecondsByConcept = new Map<string, number>();
  for (const clip of planned) {
    const entry = manifest[clip.conceptId] ?? {mode: concepts.find((concept) => concept.id === clip.conceptId)!.cinema.mode, clips: []};
    manifest[clip.conceptId] = entry;

    const needsGeneration = pending.includes(clip);
    if (needsGeneration) {
      await fs.mkdir(path.dirname(clip.file), {recursive: true});
      console.log(`Generating ${clip.relFile} (${clip.seconds}s)`);
      try {
        if (provider === 'sora') await generateWithSora(clip.prompt, clip.seconds, clip.orientation, clip.file);
        else await generateWithVeo(clip.prompt, clip.orientation, clip.file);
        spentSecondsByConcept.set(clip.conceptId, (spentSecondsByConcept.get(clip.conceptId) ?? 0) + clip.seconds);
      } catch (error) {
        console.error(`  FAILED ${clip.relFile}: ${error instanceof Error ? error.message : error}`);
        console.error('  The composition will fall back to procedural visuals for this beat.');
        continue;
      }
    }

    const record: FootageClip = {
      beat: clip.beat,
      orientation: clip.orientation,
      file: clip.relFile,
      seconds: clip.seconds,
      prompt: clip.prompt,
      provider,
      model,
    };
    const existingIndex = entry.clips.findIndex((existing) => existing.file === clip.relFile);
    if (existingIndex >= 0) entry.clips[existingIndex] = record;
    else entry.clips.push(record);

    await fs.mkdir(dataDir, {recursive: true});
    await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  if (spentSecondsByConcept.size > 0) {
    const state = await readState();
    let totalSpentUsd = 0;
    for (const [conceptId, seconds] of spentSecondsByConcept) {
      const spentUsd = seconds * rate;
      totalSpentUsd += spentUsd;
      await updateState(conceptId, {
        footageSpendUsd: Number(((state[conceptId]?.footageSpendUsd ?? 0) + spentUsd).toFixed(2)),
      });
    }
    console.log(`Approximate spend this run: $${totalSpentUsd.toFixed(2)}`);
  }
  console.log(`Footage manifest updated: ${path.relative(root, manifestFile)}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
