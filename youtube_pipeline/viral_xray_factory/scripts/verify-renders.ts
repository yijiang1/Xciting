// QA gate: checks every expected render exists, has both streams, and has the
// exact dimensions its format demands. Writes renders/qa-report.txt.
//
// Usage: npm run verify [-- <conceptId...>]

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {ffprobe} from './lib/ffmpeg';
import {loadConcepts} from './lib/content';
import {renderOutputs} from './lib/render-targets';

const FORMAT_DIMS = {
  landscape: {width: 1920, height: 1080},
  portrait: {width: 1080, height: 1920},
} as const;

const root = process.cwd();
const renderDir = path.resolve(root, 'renders');

const probe = async (file: string) => {
  const {stdout} = await ffprobe( [
    '-v',
    'error',
    '-show_entries',
    'format=duration,size:stream=codec_type,codec_name,width,height,duration',
    '-of',
    'json',
    file,
  ]);
  return JSON.parse(stdout);
};

const run = async () => {
  const ids = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const concepts = await loadConcepts();
  const selected = ids.length > 0 ? concepts.filter((concept) => ids.includes(concept.id)) : concepts;

  const report: string[] = [];
  for (const concept of selected) {
    for (const target of renderOutputs(concept)) {
      const file = path.resolve(root, target.relFile);
      const exists = await fs
        .access(file)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        throw new Error(`${target.relFile} is missing (render it with: npm run render -- ${concept.id})`);
      }
      const info = await probe(file);
      const video = info.streams.find((stream: any) => stream.codec_type === 'video');
      const audio = info.streams.find((stream: any) => stream.codec_type === 'audio');
      if (!video || !audio) throw new Error(`${target.relFile} missing video or audio stream`);
      const expected = FORMAT_DIMS[target.format];
      if (video.width !== expected.width || video.height !== expected.height) {
        throw new Error(`${target.relFile} is ${video.width}x${video.height}, expected ${expected.width}x${expected.height}`);
      }
      report.push(
        `${concept.id} [${target.format}]: ${Number(info.format.duration).toFixed(2)}s, ${(Number(info.format.size) / 1024 / 1024).toFixed(1)} MB, ${video.codec_name}+${audio.codec_name}`,
      );
    }
  }
  await fs.mkdir(renderDir, {recursive: true});
  await fs.writeFile(path.join(renderDir, 'qa-report.txt'), `${report.join('\n')}\n`);
  console.log(report.join('\n'));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
