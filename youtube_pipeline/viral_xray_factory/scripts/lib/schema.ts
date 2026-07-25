// Single source of truth for the concept data model. Concept JSON files in
// content/concepts/ are validated against this schema, and the Remotion
// composition imports the inferred types (type-only, so zod stays out of the
// video bundle).

import {z} from 'zod';

export const OPENAI_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'cedar',
  'coral',
  'echo',
  'fable',
  'marin',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
] as const;

export const formatSchema = z.enum(['portrait', 'landscape']);
export type Format = z.infer<typeof formatSchema>;

// Presentation archetypes. Each doubles as a procedural-scene key for the
// zero-cost fallback visuals; LLM-generated concepts reuse them as tones.
export const styleSchema = z.enum(['cartoon', 'interview', 'gameshow', 'noir', 'news', 'roundtable']);
export type VideoStyle = z.infer<typeof styleSchema>;

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'expected a #RRGGBB hex color');

export const beatSchema = z.object({
  text: z.string().min(1),
  visual: z.string().min(1),
  speaker: z.string().optional(),
  openaiVoice: z.enum(OPENAI_VOICES).optional(),
  openaiInstructions: z.string().optional(),
  localVoice: z.string().optional(),
  localRate: z.number().optional(),
  role: z.enum(['host', 'physicist', 'humanist', 'artist-history']).optional(),
});

export const cinemaSchema = z.object({
  mode: z.enum(['per-beat', 'ambient']),
  // Style bible prepended to every shot prompt so clips cut together.
  stylePrompt: z.string().min(1),
  // One entry per beat (per-beat mode). Falls back to beat.visual when missing.
  shots: z.array(z.string()).optional(),
  // Reusable establishing loops (ambient mode).
  ambientShots: z.array(z.string()).optional(),
  musicPrompt: z.string().optional(),
});

export const paletteSchema = z.object({
  bg: hexColor,
  accent: hexColor,
  accent2: hexColor,
  ink: hexColor,
  panel: hexColor,
});

export const conceptSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, 'ids are lowercase snake_case'),
  // draft: script written, not yet human-approved for paid footage.
  // approved: cleared to spend on footage and move toward publishing.
  status: z.enum(['draft', 'approved']).default('draft'),
  // Channel series the video belongs to; used for branding and pinned comments.
  series: z.enum(['science', 'xray', 'roundtable']).default('science'),
  style: styleSchema,
  // Output aspect ratios; first entry is the primary (upload) format.
  formats: z.array(formatSchema).min(1).default(['portrait']),
  title: z.string().min(1),
  hook: z.string().min(1),
  topic: z.string().min(1),
  voice: z.enum(OPENAI_VOICES),
  ttsInstructions: z.string().min(1),
  // Optional ElevenLabs narrator voice id; falls back to a per-style default.
  elevenVoiceId: z.string().optional(),
  palette: paletteSchema,
  beats: z.array(beatSchema).min(1),
  cinema: cinemaSchema,
  // Which procedural SVG scene to overlay when no footage exists. Only the
  // hand-built X-ray concepts have bespoke scenes; generated concepts omit it
  // and rely on the palette background + captions.
  proceduralScene: styleSchema.optional(),
  upload: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string()),
  }),
  titleVariants: z.array(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
  pinnedComment: z.string().optional(),
  thumbnailPrompt: z.string().optional(),
});

// Appended to every footage prompt: burned-in captions are composited by
// Remotion, and generated text is the fastest way to look AI-made.
export const NEGATIVE_PROMPT =
  'No on-screen text, no letters, no numbers, no captions, no subtitles, no user interface, no watermark, no logo.';

export const PORTRAIT_FRAMING =
  'Vertical smartphone composition (9:16): keep the main subject centered with generous headroom, nothing important near the edges.';

export type StoredConcept = z.infer<typeof conceptSchema>;
export type Beat = z.infer<typeof beatSchema>;
export type CinemaSpec = z.infer<typeof cinemaSchema>;
export type OpenAiVoice = (typeof OPENAI_VOICES)[number];
