import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {execa} from 'execa';
import {concepts} from '../src/concepts';
import {compositionId} from '../src/Root';

const root = process.cwd();
const entry = path.resolve(root, 'src/index.ts');
const renderDir = path.resolve(root, 'renders');

await fs.mkdir(renderDir, {recursive: true});

for (const concept of concepts) {
  const output = path.join(renderDir, `${concept.id}.mp4`);
  console.log(`Rendering ${concept.id}`);
  await execa(
    'npx',
    [
      'remotion',
      'render',
      entry,
      compositionId(concept.id),
      output,
      '--codec=h264',
      '--pixel-format=yuv420p',
      '--crf=16',
      '--x264-preset=slow',
      '--audio-bitrate=320k',
      '--concurrency=2',
    ],
    {stdio: 'inherit'},
  );
}
