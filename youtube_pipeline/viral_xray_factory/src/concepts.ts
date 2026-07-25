// Concept data lives in content/concepts/*.json (see scripts/lib/schema.ts
// for the schema). scripts/lib/content.ts aggregates the store into
// src/concepts.generated.json, which this module re-exports for both the
// Remotion bundle and the node scripts. Types are imported type-only so zod
// never lands in the video bundle.

import type {Beat as StoredBeat, Format, OpenAiVoice as Voice, StoredConcept, VideoStyle as Style} from '../scripts/lib/schema';
import conceptsJson from './concepts.generated.json';

export const FPS = 30;

export const FORMATS: Record<Format, {width: number; height: number}> = {
  landscape: {width: 1920, height: 1080},
  portrait: {width: 1080, height: 1920},
};

// The procedural SVG scenes are drawn in a fixed landscape coordinate space
// and scaled to cover other formats.
export const WIDTH = FORMATS.landscape.width;
export const HEIGHT = FORMATS.landscape.height;

export type VideoConcept = StoredConcept;
export type Beat = StoredBeat;
export type VideoStyle = Style;
export type OpenAiVoice = Voice;
export type {Format};

export const concepts = conceptsJson as unknown as VideoConcept[];

export const primaryFormat = (concept: VideoConcept): Format => concept.formats[0] ?? 'portrait';
