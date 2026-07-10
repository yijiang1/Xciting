import path from 'node:path';
import process from 'node:process';
import {execa} from 'execa';
import {compositionId} from '../src/Root';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run render:one -- <composition-id>');
  process.exit(1);
}

const root = process.cwd();
const entry = path.resolve(root, 'src/index.ts');
const output = path.resolve(root, 'renders', `${id}.mp4`);

await execa(
  'npx',
  [
    'remotion',
    'render',
    entry,
    compositionId(id),
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
