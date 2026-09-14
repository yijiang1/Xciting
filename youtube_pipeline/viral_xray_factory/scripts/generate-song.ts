// Writes a sung, sing-along concept: Verse/Chorus lyrics sent to Eleven
// Music instead of spoken TTS narration. Cheap by construction -- no AI
// footage is ever generated for these (see pipeline.ts), so the only spend
// is the Eleven Music vocal track itself (generate-audio.ts) plus Whisper
// transcription for karaoke captions.
//
// Usage:
//   npm run song -- "why x-rays go through skin but not bone"
//   npm run song -- "topic" --series xray --formats portrait,landscape

import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {z} from 'zod';
import {StoredConcept, conceptSchema, formatSchema, paletteSchema} from './lib/schema';
import {loadConcepts, saveConcept, syncGeneratedConcepts} from './lib/content';
import {generateStructured, llmModel} from './lib/llm';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

// One entry per song section. beats[] and song.sections[] are both built
// from this single array so they can never drift out of length-sync (the
// concept schema requires them to match 1:1).
const sectionSchema = z.object({
  name: z.string().min(1),
  lines: z.array(z.string().min(1).max(200)).min(2).max(30),
  beatText: z.string().min(1),
  beatVisual: z.string().min(1),
});

const generatedSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string().min(1),
  hook: z.string().min(1),
  palette: paletteSchema,
  sections: z.array(sectionSchema).min(4).max(8),
  positiveGlobalStyles: z.array(z.string().min(1)).min(1),
  negativeGlobalStyles: z.array(z.string().min(1)).optional(),
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

const songSystemPrompt = () => `You are the songwriter for "Exciting", a channel of visually striking, scientifically accurate short videos (YouTube Shorts, TikTok, Reels). You write sing-along songs the way "Wheels on the Bus" or other nursery-rhyme-style kids' songs work, but the lyrics are correct X-ray/materials science for a general audience -- simple and hummable, not dumbed-down to the point of being wrong.

Structure (exactly 6 sections, in this order): Verse 1, Chorus, Verse 2, Chorus, Verse 3, Chorus.
- Each verse teaches exactly ONE concrete, correct fact about the topic in short, concrete, sung-friendly words. Natural rhyme where it fits -- never bend a fact to force a rhyme.
- The chorus is the earworm: one or two lines capturing the topic's core idea, repeated verbatim (or near-verbatim) all three times, the way "the wheels on the bus go round and round" repeats.
- 4-8 lines per section. Short lines (a singable phrase each), never a full sentence crammed onto one line.
- Never say "subscribe", "like", or "follow".

Fields per section:
- name: "Verse 1" | "Chorus" | "Verse 2" | "Verse 3" (chorus repeats this same name each time).
- lines: the sung lyric lines for this section.
- beatText: a one-sentence plain-language paraphrase of what this section covers (used in metadata, not sung).
- beatVisual: a short (5-12 word) description of what this section is "about" visually, purely descriptive -- no AI footage is generated from this, it just documents intent.

Design rules:
- palette: bright, warm, cheerful bg and panel (readable white captions), two vivid accent colors, ink near-white. Valid #RRGGBB hex only.
- positiveGlobalStyles: Eleven Music style/instrumentation tags for a warm children's sing-along (e.g. instrumentation, tempo, vocal tone, key). negativeGlobalStyles: optional tags to avoid (e.g. "distorted", "harsh").

Metadata rules (same as the channel's explainer videos):
- upload.title: max 70 characters, curiosity-first but honest; titleVariants: 2-4 alternates.
- upload.description: 2-3 sentences with searchable keywords, no hashtags.
- tags: 6-12 search terms. hashtags: 3-8 including #shorts and #science.
- pinnedComment: one engagement question related to the topic.
- thumbnailPrompt: one bold central subject, high contrast, no text, for a 16:9 thumbnail image.
- id: a short lowercase snake_case slug, e.g. "singalong_bragg_law".

Return ONLY a JSON object with exactly these keys: id, title, hook, palette {bg, accent, accent2, ink, panel}, sections [{name, lines, beatText, beatVisual}], positiveGlobalStyles, negativeGlobalStyles, upload {title, description, tags}, titleVariants, hashtags, pinnedComment, thumbnailPrompt.
Reminder: sections must be exactly 6 entries in the Verse/Chorus/Verse/Chorus/Verse/Chorus order described above.`;

const uniqueId = (requested: string, taken: Set<string>): string => {
  if (!taken.has(requested)) return requested;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${requested}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Could not find a free id for ${requested}`);
};

// Eleven Music treats duration_ms as a guide, not a guarantee -- and LLMs are
// unreliable at estimating milliseconds -- so this is computed from line
// count instead of trusted from the model. generate-audio.ts rescales beat
// timing to the actual rendered duration afterward regardless.
const estimateDurationMs = (lineCount: number): number => lineCount * 2600 + 1500;

export const generateSongOne = async (
  topic: string,
  options: {series: 'xray' | 'science'; formats: StoredConcept['formats']},
): Promise<StoredConcept> => {
  const existing = await loadConcepts();
  const taken = new Set(existing.map((concept) => concept.id));

  const user = [
    `Write a sing-along song about: ${topic}`,
    options.series === 'xray'
      ? 'This belongs to the "X-ray vision" sub-series: connect the topic to X-rays, synchrotrons, or seeing the invisible.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  console.log(`Generating sing-along concept (${llmModel()}): ${topic}`);
  const generated = await generateStructured({system: songSystemPrompt(), user, schema: generatedSchema});

  const concept: StoredConcept = conceptSchema.parse({
    id: uniqueId(generated.id, taken),
    status: 'draft',
    series: options.series,
    style: 'singalong',
    proceduralScene: 'singalong',
    formats: options.formats,
    title: generated.title,
    hook: generated.hook,
    topic,
    palette: generated.palette,
    beats: generated.sections.map((section) => ({text: section.beatText, visual: section.beatVisual})),
    cinema: {mode: 'per-beat', stylePrompt: 'Sing-along short -- no AI footage; procedural visuals only.'},
    song: {
      modelId: 'music_v2',
      positiveGlobalStyles: generated.positiveGlobalStyles,
      negativeGlobalStyles: generated.negativeGlobalStyles,
      sections: generated.sections.map((section) => ({
        name: section.name,
        lines: section.lines,
        durationMs: estimateDurationMs(section.lines.length),
      })),
    },
    upload: {
      ...generated.upload,
      description: `Vocals, music, and visuals are AI-generated.\n${generated.upload.description}`,
    },
    titleVariants: generated.titleVariants,
    hashtags: generated.hashtags,
    pinnedComment: generated.pinnedComment,
    thumbnailPrompt: generated.thumbnailPrompt,
  });

  const file = await saveConcept(concept);
  console.log(`  -> ${path.relative(process.cwd(), file)} (status: draft)`);
  console.log(`  Hook: ${concept.hook}`);
  return concept;
};

const run = async () => {
  const args = process.argv.slice(2);
  const flagValue = (name: string): string | undefined => {
    const index = args.findIndex((arg) => arg === name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const series = (flagValue('--series') ?? 'xray') as 'xray' | 'science';
  const formats = formatSchema.array().parse((flagValue('--formats') ?? 'portrait').split(','));

  const flagValueIndexes = new Set(
    ['--series', '--formats'].map((name) => args.findIndex((arg) => arg === name) + 1).filter((index) => index > 0),
  );
  const topicArgs = args.filter((arg, index) => !arg.startsWith('-') && !flagValueIndexes.has(index));

  if (topicArgs.length === 0) {
    console.log('Usage:');
    console.log('  npm run song -- "why x-rays go through skin but not bone" [--series xray|science] [--formats portrait,landscape]');
    return;
  }

  for (const topic of topicArgs) {
    await generateSongOne(topic, {series, formats});
  }

  await syncGeneratedConcepts();
  console.log('\nNext: skim the lyrics, then approve + produce it:');
  console.log('  npm run approve -- <id>');
  console.log('  npm run pipeline -- <id>   # footage auto-skipped for sing-along concepts');
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
