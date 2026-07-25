// Turns a topic into a complete, validated video concept: hook-first script
// beats, cinematic shot prompts, palette, voice casting, and platform
// metadata. Concepts land in content/concepts/ as status "draft" so a human
// skims the script before any money is spent on footage.
//
// Usage:
//   npm run concepts -- "why glass is transparent"
//   npm run concepts -- "topic" --series xray --style noir --theme xray_vision --formats portrait,landscape
//   npm run concepts -- --auto 3          # pull the next unused topics from content/topic-bank.json
//   npm run daily                         # LLM-driven pick informed by past performance (scripts/daily.ts)

import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {z} from 'zod';
import {OPENAI_VOICES, StoredConcept, conceptSchema, formatSchema, paletteSchema} from './lib/schema';
import {loadConcepts, projectRoot, readJson, saveConcept, syncGeneratedConcepts} from './lib/content';
import {generateStructured, llmModel} from './lib/llm';
import {loadTopicBank, saveTopicBank} from './lib/topic-bank';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const analyticsFile = path.resolve(projectRoot, 'content/analytics.json');

// What the LLM fills in; the rest (status, formats, series, cinema.mode) is
// stamped on by this script.
const generatedSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  style: z.string().min(1),
  title: z.string().min(1),
  hook: z.string().min(1),
  topic: z.string().min(1),
  voice: z.enum(OPENAI_VOICES),
  ttsInstructions: z.string().min(1),
  palette: paletteSchema,
  beats: z.array(z.object({text: z.string().min(1), visual: z.string().min(1)})).min(5).max(9),
  cinema: z.object({
    stylePrompt: z.string().min(40),
    shots: z.array(z.string().min(20)),
    musicPrompt: z.string().min(10),
  }),
  upload: z.object({
    title: z.string().min(1).max(95),
    description: z.string().min(1),
    tags: z.array(z.string()).min(5).max(14),
  }),
  titleVariants: z.array(z.string()).min(2).max(4),
  hashtags: z.array(z.string()).min(3).max(8),
  pinnedComment: z.string().min(1),
  thumbnailPrompt: z.string().min(20),
});

type AnalyticsSummary = {
  videos?: Array<{conceptId: string; title: string; views: number; averageViewPercentage: number}>;
};

const craftSystemPrompt = (styleHint: string | undefined) => `You are the head writer for "Exciting", a channel of visually striking, scientifically accurate short explainer videos (YouTube Shorts, TikTok, Reels). You write complete production-ready video concepts as JSON.

Non-negotiable craft rules:
- Beat 1 is a cold-open hook: a surprising claim or question, 12 words max, no greetings, no "welcome", no throat-clearing. The viewer decides to stay within 2 seconds.
- 6 to 8 beats total. Each beat is 1-2 short spoken sentences. Whole script 110-160 words (roughly 35-55 seconds of narration).
- Explain ONE concrete mechanism with everyday analogies. The viewer must be able to retell the "aha" to a friend.
- Every technical term gets an instant plain-language translation in the same breath.
- Final beat lands a satisfying button that loops naturally back to the hook. Never say "subscribe", "like", or "follow".
- Scientific accuracy beats punchiness. Never state something false to sound cool.
${styleHint ? `- Use the "${styleHint}" presentation style.` : '- Pick whichever presentation style best fits the topic — reuse a proven archetype (cartoon, interview, gameshow, noir, news) or invent a new one; vary across a series.'}

Cinema rules (for AI-generated footage):
- cinema.stylePrompt: a 40-80 word style bible (medium, texture, color palette, lighting, camera feel) so all clips cut together.
- cinema.shots: exactly one shot per beat, each a concrete 20-60 word visual description that matches its beat's content. Vary shot scale (wide/medium/close). Depict ideas with objects, characters, and light — NEVER request text, letters, numbers, labels, diagrams with words, or UI in the imagery.
- musicPrompt: instrumental, loopable, no vocals; match the style's energy.

Design rules:
- palette: dark, cinematic bg and panel (readable white captions), two vivid accent colors, ink near-white. Valid #RRGGBB hex only.
- voice: pick from the allowed voice list; ttsInstructions describe delivery (pace, tone, character) in 1-2 sentences.

Metadata rules:
- upload.title: max 70 characters, curiosity-first but honest; titleVariants: 2-4 alternates with different angles.
- upload.description: 2-3 sentences with searchable keywords, no hashtags.
- tags: 6-12 search terms. hashtags: 3-8 including #shorts and #science.
- pinnedComment: one engagement question related to the topic.
- thumbnailPrompt: one bold central subject, high contrast, no text, for a 16:9 thumbnail image.
- id: a short lowercase snake_case slug (style prefix + topic, e.g. "noir_glass_transparency").

Return ONLY a JSON object with exactly these keys: id, style, title, hook, topic, voice, ttsInstructions, palette {bg, accent, accent2, ink, panel}, beats [{text, visual}], cinema {stylePrompt, shots, musicPrompt}, upload {title, description, tags}, titleVariants, hashtags, pinnedComment, thumbnailPrompt.
Allowed voices: ${OPENAI_VOICES.join(', ')}.
Reminder: the number of cinema.shots must equal the number of beats.`;

const analyticsContext = async (): Promise<string> => {
  const analytics = await readJson<AnalyticsSummary>(analyticsFile, {});
  const videos = analytics.videos ?? [];
  if (videos.length === 0) return '';
  const sorted = [...videos].sort((a, b) => b.averageViewPercentage - a.averageViewPercentage);
  const top = sorted.slice(0, 5).map((video) => `- "${video.title}" (${video.averageViewPercentage.toFixed(0)}% avg watched, ${video.views} views)`);
  const bottom = sorted.slice(-3).map((video) => `- "${video.title}" (${video.averageViewPercentage.toFixed(0)}% avg watched, ${video.views} views)`);
  return `\n\nAudience data from published videos — lean toward what retains, away from what does not:\nBest retention:\n${top.join('\n')}\nWorst retention:\n${bottom.join('\n')}`;
};

const uniqueId = (requested: string, taken: Set<string>): string => {
  if (!taken.has(requested)) return requested;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${requested}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Could not find a free id for ${requested}`);
};

export const generateOne = async (
  topic: string,
  options: {series: StoredConcept['series']; formats: StoredConcept['formats']; style?: string; angle?: string; theme?: string},
): Promise<StoredConcept> => {
  const existing = await loadConcepts();
  const taken = new Set(existing.map((concept) => concept.id));
  const recentStyles = existing.slice(-5).map((concept) => concept.style);

  const user = [
    `Write a video concept about: ${topic}`,
    options.angle ? `Angle to take: ${options.angle}` : '',
    options.series === 'xray'
      ? 'This belongs to the "X-ray vision" sub-series: connect the topic to X-rays, synchrotrons, or seeing the invisible.'
      : '',
    recentStyles.length > 0 ? `Recently used styles (prefer something different): ${recentStyles.join(', ')}.` : '',
    await analyticsContext(),
  ]
    .filter(Boolean)
    .join('\n');

  console.log(`Generating concept (${llmModel()}): ${topic}`);
  const generated = await generateStructured({system: craftSystemPrompt(options.style), user, schema: generatedSchema});

  if (generated.cinema.shots.length !== generated.beats.length) {
    // Tolerate off-by-a-few: pad with beat visuals / trim extras.
    generated.cinema.shots = generated.beats.map((beat, index) => generated.cinema.shots[index] ?? beat.visual);
  }

  const concept: StoredConcept = conceptSchema.parse({
    ...generated,
    id: uniqueId(generated.id, taken),
    status: 'draft',
    series: options.series,
    theme: options.theme,
    formats: options.formats,
    cinema: {mode: 'per-beat', ...generated.cinema},
    upload: {
      ...generated.upload,
      description: `Voiceover and visuals are AI-generated.\n${generated.upload.description}`,
    },
  });

  const file = await saveConcept(concept);
  console.log(`  -> ${path.relative(projectRoot, file)} (status: draft)`);
  console.log(`  Hook: ${concept.hook}`);
  return concept;
};

const run = async () => {
  const args = process.argv.slice(2);
  const flagValue = (name: string): string | undefined => {
    const index = args.findIndex((arg) => arg === name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const autoIndex = args.findIndex((arg) => arg === '--auto');
  const autoCount = autoIndex >= 0 ? Number(args[autoIndex + 1] ?? 1) : 0;
  const series = (flagValue('--series') ?? 'science') as 'science' | 'xray';
  const style = flagValue('--style');
  const theme = flagValue('--theme');
  const formats = formatSchema.array().parse((flagValue('--formats') ?? 'portrait').split(','));

  const flagValueIndexes = new Set(
    ['--series', '--style', '--theme', '--formats', '--auto']
      .map((name) => args.findIndex((arg) => arg === name) + 1)
      .filter((index) => index > 0),
  );
  const topicArgs = args.filter((arg, index) => !arg.startsWith('-') && !flagValueIndexes.has(index));

  if (autoCount > 0) {
    const bank = await loadTopicBank();
    const unused = bank.topics.filter((entry) => !entry.used);
    if (unused.length === 0) {
      throw new Error('Topic bank has no unused topics. Add more to content/topic-bank.json.');
    }
    for (const entry of unused.slice(0, autoCount)) {
      const concept = await generateOne(entry.topic, {series: entry.series, formats, style, angle: entry.angle, theme: entry.theme});
      entry.used = true;
      entry.conceptId = concept.id;
      await saveTopicBank(bank);
    }
  } else if (topicArgs.length > 0) {
    for (const topic of topicArgs) {
      await generateOne(topic, {series, formats, style, theme});
    }
  } else {
    console.log('Usage:');
    console.log('  npm run concepts -- "why glass is transparent" [--series science|xray] [--style noir] [--theme light_optics] [--formats portrait,landscape]');
    console.log('  npm run concepts -- --auto 3');
    console.log('  npm run daily          # LLM-driven theme/style pick informed by past performance');
    return;
  }

  await syncGeneratedConcepts();
  console.log('\nNext: skim the script, then approve + produce it:');
  console.log('  npm run approve -- <id>');
  console.log('  npm run pipeline -- <id>');
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
