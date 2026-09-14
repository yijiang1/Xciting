// Local-only control panel for the daily pipeline. Wraps the same scripts and
// content-store helpers the CLI uses -- reads go straight through
// scripts/lib/content.ts, and the money-spending / YouTube-touching steps
// (pipeline, publish) run as real child processes via jobs.ts so their output
// streams to the browser exactly like it would in a terminal.
//
// Usage: npm run gui   (open http://localhost:4321)

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import express from 'express';
import {z} from 'zod';
import {
  loadConcepts,
  projectRoot,
  readJson,
  readState,
  saveConcept,
  syncGeneratedConcepts,
  updateState,
} from '../lib/content';
import {renderOutputs} from '../lib/render-targets';
import {conceptSchema, paletteSchema} from '../lib/schema';
import {buildScoreboard} from '../lib/strategist';
import {jobRunner} from './jobs';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const PORT = Number(process.env.GUI_PORT ?? 4321);

const analyticsFile = path.resolve(projectRoot, 'content/analytics.json');
type AnalyticsVideo = {
  conceptId: string;
  title?: string;
  views: number;
  averageViewPercentage: number;
  subscribersGained: number;
  likes: number;
};
type Analytics = {videos?: AnalyticsVideo[]};

const fileExists = (file: string) =>
  fs
    .access(path.resolve(root, file))
    .then(() => true)
    .catch(() => false);

type FootageManifest = Record<string, {clips: Array<{orientation?: string}>}>;

const conceptSummaries = async () => {
  const [concepts, state, footage] = await Promise.all([
    loadConcepts(),
    readState(),
    readJson<FootageManifest>(path.resolve(root, 'public/data/footage.json'), {}),
  ]);

  return Promise.all(
    concepts.map(async (concept) => {
      const audio = await fileExists(`public/audio/${concept.id}.mp3`);
      const clips = footage[concept.id]?.clips ?? [];
      const targets = renderOutputs(concept);
      const renders = await Promise.all(
        targets.map(async (target) => ({format: target.format, ready: await fileExists(target.relFile)})),
      );
      const bundle = await fileExists(`bundles/${concept.id}`);
      const conceptState = state[concept.id];

      return {
        id: concept.id,
        status: concept.status,
        series: concept.series,
        theme: concept.theme,
        style: concept.style,
        title: concept.title,
        hook: concept.hook,
        topic: concept.topic,
        formats: concept.formats,
        audioReady: audio,
        footageClips: clips.length,
        renders,
        bundleReady: bundle,
        footageSpendUsd: conceptState?.footageSpendUsd,
        approvedAt: conceptState?.approvedAt,
        published: conceptState?.published?.youtube,
      };
    }),
  );
};

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

app.get('/api/concepts', async (_req, res) => {
  res.json(await conceptSummaries());
});

app.get('/api/concepts/:id', async (req, res) => {
  const concepts = await loadConcepts();
  const concept = concepts.find((candidate) => candidate.id === req.params.id);
  if (!concept) return res.status(404).json({error: `Unknown concept id: ${req.params.id}`});
  res.json(concept);
});

app.get('/api/state', async (_req, res) => {
  res.json(await readState());
});

app.get('/api/analytics', async (_req, res) => {
  res.json(await readJson<Analytics>(analyticsFile, {}));
});

app.get('/api/scoreboard', async (_req, res) => {
  const [concepts, analytics] = await Promise.all([loadConcepts(), readJson<Analytics>(analyticsFile, {})]);
  const videos = analytics.videos ?? [];
  res.json({
    theme: buildScoreboard(concepts, videos, 'theme'),
    style: buildScoreboard(concepts, videos, 'style'),
  });
});

// ---------------------------------------------------------------------------
// Fast, safe write: approve (no money spent, just flips a status flag)
// ---------------------------------------------------------------------------

app.post('/api/concepts/:id/approve', async (req, res) => {
  const concepts = await loadConcepts();
  const concept = concepts.find((candidate) => candidate.id === req.params.id);
  if (!concept) return res.status(404).json({error: `Unknown concept id: ${req.params.id}`});
  if (concept.status !== 'approved') {
    await saveConcept({...concept, status: 'approved'});
    await updateState(concept.id, {approvedAt: new Date().toISOString()});
    await syncGeneratedConcepts();
  }
  res.json({id: concept.id, status: 'approved'});
});

// ---------------------------------------------------------------------------
// Content edits: title/hook/palette/script/lyrics/upload metadata. Never
// touches id, status, series, formats, cinema, or song.modelId/styles --
// this is a content patch, not a full concept rewrite. beats/song.sections
// are matched by index and only their text/lines are replaced, so the
// beats<->song.sections length invariant the schema enforces can't break.
// ---------------------------------------------------------------------------

const conceptPatchSchema = z.object({
  title: z.string().min(1).optional(),
  hook: z.string().min(1).optional(),
  palette: paletteSchema.optional(),
  beats: z.array(z.object({text: z.string().min(1), visual: z.string().min(1)})).optional(),
  song: z.object({sections: z.array(z.object({lines: z.array(z.string().min(1).max(200)).min(1).max(30)}))}).optional(),
  upload: z
    .object({
      title: z.string().min(1).max(95).optional(),
      description: z.string().min(1).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

app.put('/api/concepts/:id', async (req, res) => {
  const concepts = await loadConcepts();
  const concept = concepts.find((candidate) => candidate.id === req.params.id);
  if (!concept) return res.status(404).json({error: `Unknown concept id: ${req.params.id}`});

  const parsedPatch = conceptPatchSchema.safeParse(req.body);
  if (!parsedPatch.success) {
    return res.status(400).json({error: parsedPatch.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')});
  }
  const patch = parsedPatch.data;

  if (patch.beats && patch.beats.length !== concept.beats.length) {
    return res.status(400).json({error: `beats patch has ${patch.beats.length} entries, concept has ${concept.beats.length}.`});
  }
  if (patch.song && !concept.song) {
    return res.status(400).json({error: `${concept.id} has no song section to edit.`});
  }
  if (patch.song && concept.song && patch.song.sections.length !== concept.song.sections.length) {
    return res.status(400).json({error: `song patch has ${patch.song.sections.length} sections, concept has ${concept.song.sections.length}.`});
  }

  const updated = {
    ...concept,
    title: patch.title ?? concept.title,
    hook: patch.hook ?? concept.hook,
    palette: patch.palette ?? concept.palette,
    beats: patch.beats
      ? concept.beats.map((beat, index) => ({...beat, text: patch.beats![index].text, visual: patch.beats![index].visual}))
      : concept.beats,
    song:
      patch.song && concept.song
        ? {...concept.song, sections: concept.song.sections.map((section, index) => ({...section, lines: patch.song!.sections[index].lines}))}
        : concept.song,
    upload: patch.upload ? {...concept.upload, ...patch.upload} : concept.upload,
  };

  const parsed = conceptSchema.safeParse(updated);
  if (!parsed.success) {
    return res.status(400).json({error: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')});
  }

  await saveConcept(parsed.data);
  await syncGeneratedConcepts();
  res.json(parsed.data);
});

// ---------------------------------------------------------------------------
// Jobs: real child processes for the steps that spend money or touch YouTube.
// Only one runs at a time (enforced in jobs.ts).
// ---------------------------------------------------------------------------

app.get('/api/jobs/current', (_req, res) => {
  res.json(jobRunner.getState());
});

app.post('/api/jobs/daily', (_req, res) => {
  try {
    res.json(jobRunner.start('daily'));
  } catch (error) {
    res.status(409).json({error: error instanceof Error ? error.message : String(error)});
  }
});

app.post('/api/jobs/pipeline', (req, res) => {
  const {id, force, footageOk, skipFootage} = req.body ?? {};
  if (!id || typeof id !== 'string') return res.status(400).json({error: 'id is required'});
  const args = [id];
  if (force) args.push('--force');
  if (footageOk) args.push('--footage-ok');
  if (skipFootage) args.push('--skip-footage');
  try {
    res.json(jobRunner.start('pipeline', args));
  } catch (error) {
    res.status(409).json({error: error instanceof Error ? error.message : String(error)});
  }
});

app.post('/api/jobs/publish', (req, res) => {
  const {id, format, isPublic} = req.body ?? {};
  if (!id || typeof id !== 'string') return res.status(400).json({error: 'id is required'});
  const args = [id];
  if (format) args.push('--format', format);
  if (isPublic) args.push('--public');
  try {
    res.json(jobRunner.start('upload-youtube', args));
  } catch (error) {
    res.status(409).json({error: error instanceof Error ? error.message : String(error)});
  }
});

// Server-sent events: replays the current job's buffered log, then streams
// new lines/status changes live. Survives across job restarts.
app.get('/api/jobs/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const current = jobRunner.getState();
  if (current) send('snapshot', current);

  const onStart = (job: unknown) => send('start', job);
  const onLog = (jobId: number, line: string) => send('log', {jobId, line});
  const onEnd = (job: unknown) => send('end', job);

  jobRunner.on('start', onStart);
  jobRunner.on('log', onLog);
  jobRunner.on('end', onEnd);

  req.on('close', () => {
    jobRunner.off('start', onStart);
    jobRunner.off('log', onLog);
    jobRunner.off('end', onEnd);
  });
});

// ---------------------------------------------------------------------------
// Static: dashboard UI + rendered media for in-browser preview
// ---------------------------------------------------------------------------

app.use(express.static(path.resolve(import.meta.dirname, 'public')));
app.use('/media/renders', express.static(path.resolve(root, 'renders')));
app.use('/media/bundles', express.static(path.resolve(root, 'bundles')));
app.use('/media/audio', express.static(path.resolve(root, 'public/audio')));

app.listen(PORT, () => {
  console.log(`Xciting control panel: http://localhost:${PORT}`);
});
