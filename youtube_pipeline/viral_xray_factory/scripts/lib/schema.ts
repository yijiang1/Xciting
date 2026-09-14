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

// Presentation archetype, e.g. "cartoon", "interview", "noir" -- free text so
// the daily content strategist can invent new ones. The original six
// (cartoon/interview/gameshow/noir/news/roundtable) double as procedural-scene
// keys for the zero-cost fallback visuals; anything else just skips that
// fallback and relies on generated footage + the palette background.
export const styleSchema = z.string().min(1);
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

// A sung song, generated with Eleven Music instead of spoken TTS narration.
// One section per beat (song.sections[i] is what plays during beats[i]), so
// footage prompts, procedural scenes, and captions all key off the same
// index as every other concept -- only the audio backend differs.
export const songSectionSchema = z.object({
  // Section label sent to Eleven Music (e.g. "Verse 1", "Chorus").
  name: z.string().min(1),
  // Sung lyric lines for this section. Eleven Music limits: max 30 lines,
  // max 200 chars per line.
  lines: z.array(z.string().min(1).max(200)).min(1).max(30),
  // Target section length in ms (Eleven Music treats this as a guide, not a
  // guarantee -- generate-audio.ts rescales planned beat timing to the
  // actual rendered duration after the fact).
  durationMs: z.number().int().min(1000).max(600_000),
  positiveStyles: z.array(z.string().min(1)).optional(),
  negativeStyles: z.array(z.string().min(1)).optional(),
});
export type SongSection = z.infer<typeof songSectionSchema>;

export const songSchema = z.object({
  // music_v2 sings; music_v1 is instrumental-only.
  modelId: z.enum(['music_v1', 'music_v2']).default('music_v2'),
  positiveGlobalStyles: z.array(z.string().min(1)).min(1),
  negativeGlobalStyles: z.array(z.string().min(1)).optional(),
  sections: z.array(songSectionSchema).min(1),
});
export type SongSpec = z.infer<typeof songSchema>;

export const conceptSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/, 'ids are lowercase snake_case'),
    // draft: script written, not yet human-approved for paid footage.
    // approved: cleared to spend on footage and move toward publishing.
    status: z.enum(['draft', 'approved']).default('draft'),
    // Channel series the video belongs to; used for branding and pinned comments.
    series: z.enum(['science', 'xray', 'roundtable', 'kids']).default('science'),
    // Content theme/bucket (e.g. "light_optics"), freely chosen by the daily
    // content strategist and reused across videos so performance can be
    // compared theme-to-theme. Undefined for older/hand-authored concepts.
    theme: z.string().min(1).optional(),
    style: styleSchema,
    // Output aspect ratios; first entry is the primary (upload) format.
    formats: z.array(formatSchema).min(1).default(['portrait']),
    title: z.string().min(1),
    hook: z.string().min(1),
    topic: z.string().min(1),
    // Spoken-narration TTS casting. Required unless `song` is set -- sung
    // concepts get their voice from Eleven Music instead.
    voice: z.enum(OPENAI_VOICES).optional(),
    ttsInstructions: z.string().min(1).optional(),
    // Optional ElevenLabs narrator voice id; falls back to a per-style default.
    elevenVoiceId: z.string().optional(),
    palette: paletteSchema,
    beats: z.array(beatSchema).min(1),
    cinema: cinemaSchema,
    // Sung song spec (Eleven Music). When set, generate-audio.ts generates a
    // full vocal track instead of concatenating spoken TTS beats, and skips
    // the separate instrumental music bed in generate-music.ts.
    song: songSchema.optional(),
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
  })
  .superRefine((concept, ctx) => {
    if (concept.song) {
      if (concept.song.sections.length !== concept.beats.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['song', 'sections'],
          message: `song.sections (${concept.song.sections.length}) must have exactly one entry per beat (${concept.beats.length}).`,
        });
      }
    } else {
      if (!concept.voice) {
        ctx.addIssue({code: 'custom', path: ['voice'], message: 'voice is required unless the concept declares a song.'});
      }
      if (!concept.ttsInstructions) {
        ctx.addIssue({code: 'custom', path: ['ttsInstructions'], message: 'ttsInstructions is required unless the concept declares a song.'});
      }
    }
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
