// Generates a 1280x720 thumbnail for long-form (landscape) uploads from the
// concept's thumbnailPrompt using the OpenAI image API, saved into the
// concept's bundle. npm run publish attaches it automatically.
//
// Usage: npm run thumbnails -- <conceptId...> [--force]

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import {ffmpeg} from './lib/ffmpeg';
import {loadConcepts} from './lib/content';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const run = async () => {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for thumbnail generation.');
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const ids = args.filter((arg) => !arg.startsWith('-'));

  const concepts = await loadConcepts();
  const selected = (ids.length > 0 ? concepts.filter((concept) => ids.includes(concept.id)) : concepts).filter(
    (concept) => concept.formats.includes('landscape') && concept.thumbnailPrompt,
  );
  if (selected.length === 0) {
    console.log('No selected concepts have both a landscape format and a thumbnailPrompt.');
    return;
  }

  const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

  for (const concept of selected) {
    const outFile = path.resolve(root, `bundles/${concept.id}/thumbnail.png`);
    const exists = await fs
      .access(outFile)
      .then(() => true)
      .catch(() => false);
    if (exists && !force) {
      console.log(`${concept.id}: thumbnail exists (use --force to regenerate).`);
      continue;
    }

    console.log(`Generating thumbnail: ${concept.id}`);
    const prompt = `${concept.thumbnailPrompt}\nBold, high-contrast YouTube thumbnail composition. No text, no letters, no watermark.`;
    const image = await client.images.generate({
      model: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
      prompt,
      size: '1536x1024',
    });
    const b64 = image.data?.[0]?.b64_json;
    if (!b64) throw new Error(`Image API returned no data for ${concept.id}`);

    await fs.mkdir(path.dirname(outFile), {recursive: true});
    const rawFile = `${outFile}.raw.png`;
    await fs.writeFile(rawFile, Buffer.from(b64, 'base64'));
    // Center-crop to the exact 1280x720 YouTube expects.
    await ffmpeg( ['-y', '-v', 'error', '-i', rawFile, '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', outFile]);
    await fs.rm(rawFile);
    console.log(`  -> ${path.relative(root, outFile)}`);
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
