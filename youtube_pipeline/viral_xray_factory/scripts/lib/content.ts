// Content store helpers: concept JSON files live in content/concepts/, one
// per video. Node scripts read them through loadConcepts(); the Remotion
// composition consumes the aggregated src/concepts.generated.json written by
// syncGeneratedConcepts() (a static import keeps the bundler happy).

import fs from 'node:fs/promises';
import path from 'node:path';
import {StoredConcept, conceptSchema} from './schema';

export const projectRoot = process.cwd();
export const conceptsDir = path.resolve(projectRoot, 'content/concepts');
export const generatedFile = path.resolve(projectRoot, 'src/concepts.generated.json');
export const footageManifestFile = path.resolve(projectRoot, 'public/data/footage.json');
export const stateFile = path.resolve(projectRoot, 'content/state.json');

export const readJson = async <T>(file: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const writeIfChanged = async (file: string, content: string): Promise<boolean> => {
  const existing = await fs.readFile(file, 'utf8').catch(() => null);
  if (existing === content) return false;
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, content);
  return true;
};

export const loadConcepts = async (): Promise<StoredConcept[]> => {
  const entries = await fs.readdir(conceptsDir).catch(() => [] as string[]);
  const concepts: StoredConcept[] = [];
  for (const entry of entries.filter((name) => name.endsWith('.json')).sort()) {
    const file = path.join(conceptsDir, entry);
    const raw = JSON.parse(await fs.readFile(file, 'utf8'));
    const parsed = conceptSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Invalid concept ${entry}:\n${parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n')}`);
    }
    if (parsed.data.id !== path.basename(entry, '.json')) {
      throw new Error(`Concept file ${entry} has mismatched id "${parsed.data.id}" (file name must equal id).`);
    }
    concepts.push(parsed.data);
  }
  return concepts;
};

export const saveConcept = async (concept: StoredConcept): Promise<string> => {
  const parsed = conceptSchema.parse(concept);
  await fs.mkdir(conceptsDir, {recursive: true});
  const file = path.join(conceptsDir, `${parsed.id}.json`);
  await fs.writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`);
  return file;
};

// Rewrites src/concepts.generated.json from the concept store. Returns the
// loaded concepts so callers can keep working with them.
export const syncGeneratedConcepts = async (): Promise<StoredConcept[]> => {
  const concepts = await loadConcepts();
  const changed = await writeIfChanged(generatedFile, `${JSON.stringify(concepts, null, 2)}\n`);
  if (changed) console.log(`Synced ${concepts.length} concepts -> ${path.relative(projectRoot, generatedFile)}`);
  return concepts;
};

type FootageClip = {beat?: number; orientation?: string; file: string; seconds?: number; [key: string]: unknown};
type FootageManifest = Record<string, {mode: 'per-beat' | 'ambient'; clips: FootageClip[]}>;

// Drops manifest entries whose video files are missing on disk (footage is
// gitignored, so a fresh checkout has the manifest but not the clips). The
// composition must never reference a file that does not exist.
export const pruneFootageManifest = async (): Promise<{removed: number}> => {
  const manifest = await readJson<FootageManifest>(footageManifestFile, {});
  let removed = 0;
  const pruned: FootageManifest = {};
  for (const [conceptId, entry] of Object.entries(manifest)) {
    const clips: FootageClip[] = [];
    for (const clip of entry.clips) {
      const exists = await fs
        .access(path.resolve(projectRoot, 'public', clip.file))
        .then(() => true)
        .catch(() => false);
      if (exists) clips.push(clip);
      else removed += 1;
    }
    if (clips.length > 0) pruned[conceptId] = {...entry, clips};
  }
  if (removed > 0) {
    await fs.writeFile(footageManifestFile, `${JSON.stringify(pruned, null, 2)}\n`);
    console.warn(`Pruned ${removed} footage manifest entr${removed === 1 ? 'y' : 'ies'} with missing files (regenerate with npm run generate:visuals).`);
  }
  return {removed};
};

// ---------------------------------------------------------------------------
// Workflow state (things not derivable from files): footage spend + publishes.
// ---------------------------------------------------------------------------

export type ConceptState = {
  footageSpendUsd?: number;
  approvedAt?: string;
  published?: {
    youtube?: {videoId: string; at: string; privacyStatus: string; format: string};
  };
};

export type PipelineState = Record<string, ConceptState>;

export const readState = async (): Promise<PipelineState> => readJson<PipelineState>(stateFile, {});

export const updateState = async (conceptId: string, patch: Partial<ConceptState>): Promise<void> => {
  const state = await readState();
  state[conceptId] = {...state[conceptId], ...patch};
  await fs.mkdir(path.dirname(stateFile), {recursive: true});
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
};
