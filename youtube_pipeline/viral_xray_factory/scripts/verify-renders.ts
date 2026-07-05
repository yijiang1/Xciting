import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {execa} from 'execa';
import {concepts} from '../src/concepts';

const root = process.cwd();
const renderDir = path.resolve(root, 'renders');

const probe = async (file: string) => {
  const {stdout} = await execa('ffprobe', [
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
  const report: string[] = [];
  for (const concept of concepts) {
    const file = path.join(renderDir, `${concept.id}.mp4`);
    const info = await probe(file);
    const video = info.streams.find((stream: any) => stream.codec_type === 'video');
    const audio = info.streams.find((stream: any) => stream.codec_type === 'audio');
    if (!video || !audio) throw new Error(`${concept.id} missing video or audio stream`);
    if (video.width !== 1920 || video.height !== 1080) throw new Error(`${concept.id} has wrong dimensions`);
    report.push(`${concept.id}: ${Number(info.format.duration).toFixed(2)}s, ${(Number(info.format.size) / 1024 / 1024).toFixed(1)} MB, ${video.codec_name}+${audio.codec_name}`);
  }
  await fs.writeFile(path.join(renderDir, 'qa-report.txt'), `${report.join('\n')}\n`);
  console.log(report.join('\n'));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
