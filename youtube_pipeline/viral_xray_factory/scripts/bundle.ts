// Packages a finished concept for publishing: renders + subtitles + per-
// platform copy into bundles/<id>/. YouTube uploads are API-automated
// (npm run publish); TikTok and Instagram get ready-to-paste caption files
// since their posting APIs are approval-gated.
//
// Usage: npm run bundle -- <conceptId...>

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {loadConcepts} from './lib/content';
import {renderOutputs} from './lib/render-targets';

const root = process.cwd();
const bundlesDir = path.resolve(root, 'bundles');

const copyIfExists = async (from: string, to: string): Promise<boolean> => {
  try {
    await fs.copyFile(from, to);
    return true;
  } catch {
    return false;
  }
};

const run = async () => {
  const ids = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const concepts = await loadConcepts();
  const selected = ids.length > 0 ? concepts.filter((concept) => ids.includes(concept.id)) : concepts;

  for (const concept of selected) {
    const dir = path.join(bundlesDir, concept.id);
    await fs.mkdir(dir, {recursive: true});

    for (const target of renderOutputs(concept)) {
      const copied = await copyIfExists(path.resolve(root, target.relFile), path.join(dir, `${concept.id}-${target.format}.mp4`));
      if (!copied) console.warn(`  ${concept.id}: no ${target.format} render yet (${target.relFile})`);
    }
    await copyIfExists(path.resolve(root, `subtitles/${concept.id}.srt`), path.join(dir, `${concept.id}.srt`));
    await copyIfExists(path.resolve(root, `metadata/${concept.id}.md`), path.join(dir, 'youtube.md'));

    const hashtags = (concept.hashtags ?? []).join(' ');
    const tiktok = [concept.upload.title, '', concept.hook, '', 'AI-generated visuals and voiceover.', '', hashtags].join('\n');
    const instagram = [concept.upload.title, '', concept.upload.description, '', hashtags, '#reels'].join('\n');
    await fs.writeFile(path.join(dir, 'tiktok.txt'), `${tiktok}\n`);
    await fs.writeFile(path.join(dir, 'instagram.txt'), `${instagram}\n`);

    console.log(`Bundled ${concept.id} -> ${path.relative(root, dir)}/`);
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
