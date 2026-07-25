// Shared naming for compositions and render outputs, one per concept format.
// Landscape keeps the historical unsuffixed names; portrait adds "-portrait".
// Imported by the Remotion root (types only besides these pure helpers) and by
// the render/verify/bundle/upload scripts.

import type {Format, StoredConcept} from './schema';

export const compositionIdFor = (conceptId: string, format: Format): string => {
  const slug = conceptId.replaceAll('_', '-');
  return format === 'landscape' ? slug : `${slug}-portrait`;
};

export const renderFileFor = (conceptId: string, format: Format): string =>
  format === 'landscape' ? `renders/${conceptId}.mp4` : `renders/${conceptId}-portrait.mp4`;

export type RenderTarget = {format: Format; compositionId: string; relFile: string};

export const renderOutputs = (concept: Pick<StoredConcept, 'id' | 'formats'>): RenderTarget[] =>
  concept.formats.map((format) => ({
    format,
    compositionId: compositionIdFor(concept.id, format),
    relFile: renderFileFor(concept.id, format),
  }));
