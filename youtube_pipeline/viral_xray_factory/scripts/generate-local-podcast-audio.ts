import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {execa} from 'execa';
import {ffmpeg, ffprobe} from './lib/ffmpeg';
import {concepts} from '../src/concepts';

type TimedBeat = {
  start: number;
  end: number;
  text: string;
  visual: string;
  speaker?: string;
  role?: 'host' | 'physicist' | 'humanist' | 'artist-history';
};

type Timings = Record<string, {duration: number; beats: TimedBeat[]}>;
type AudioMeta = Record<string, {duration: number}>;

const root = process.cwd();
const conceptId = process.argv[2] ?? 'roundtable_knowledge_wisdom';
const audioDir = path.resolve(root, 'public/audio');
const dataDir = path.resolve(root, 'public/data');
const tmpDir = path.resolve(root, 'cache/local-podcast');
const timingsFile = path.join(dataDir, 'timings.json');
const metadataFile = path.join(dataDir, 'audio-metadata.json');
const gapSeconds = 0.28;

const readJson = async <T>(file: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
};

const durationOf = async (file: string): Promise<number> => {
  const {stdout} = await ffprobe( [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  return Number(stdout.trim());
};

const makeSpeech = async (input: string, voice: string, rate: number, outFile: string) => {
  const aiffFile = outFile.replace(/\.mp3$/, '.aiff');
  await execa('say', ['-v', voice, '-r', String(rate), '-o', aiffFile, input]);
  await ffmpeg( ['-y', '-v', 'error', '-i', aiffFile, '-ar', '44100', '-ac', '2', '-codec:a', 'libmp3lame', '-q:a', '4', outFile]);
};

const makeSilence = async (duration: number, output: string) => {
  await ffmpeg( [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=44100:cl=stereo',
    '-t',
    String(duration),
    '-q:a',
    '9',
    '-acodec',
    'libmp3lame',
    output,
  ]);
};

const concatAudio = async (files: string[], output: string) => {
  const listFile = path.join(tmpDir, `concat-${path.basename(output)}.txt`);
  const lines = files.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n');
  await fs.writeFile(listFile, lines);
  await ffmpeg( ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'libmp3lame', '-q:a', '3', output]);
};

const run = async () => {
  const concept = concepts.find((item) => item.id === conceptId);
  if (!concept) throw new Error(`Unknown concept: ${conceptId}`);

  await fs.mkdir(audioDir, {recursive: true});
  await fs.mkdir(dataDir, {recursive: true});
  await fs.mkdir(tmpDir, {recursive: true});

  const filesToConcat: string[] = [];
  const beats: TimedBeat[] = [];
  let cursor = 0;

  for (let index = 0; index < concept.beats.length; index += 1) {
    const beat = concept.beats[index];
    const voice = beat.localVoice;
    const rate = beat.localRate ?? 170;
    if (!voice) throw new Error(`${concept.id} beat ${index + 1} is missing localVoice`);

    const piece = path.join(tmpDir, `${concept.id}-${String(index + 1).padStart(2, '0')}.mp3`);
    console.log(`Generating local speech ${index + 1}/${concept.beats.length}: ${beat.speaker ?? 'speaker'} (${voice})`);
    await makeSpeech(beat.text, voice, rate, piece);
    const duration = await durationOf(piece);

    beats.push({
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + duration + gapSeconds).toFixed(3)),
      text: beat.text,
      visual: beat.visual,
      speaker: beat.speaker,
      role: beat.role,
    });
    cursor += duration + gapSeconds;
    filesToConcat.push(piece);

    const gap = path.join(tmpDir, `${concept.id}-${String(index + 1).padStart(2, '0')}-gap.mp3`);
    await makeSilence(gapSeconds, gap);
    filesToConcat.push(gap);
  }

  const output = path.join(audioDir, `${concept.id}.mp3`);
  await concatAudio(filesToConcat, output);
  const duration = Number((await durationOf(output)).toFixed(3));
  const timings = await readJson<Timings>(timingsFile, {});
  const metadata = await readJson<AudioMeta>(metadataFile, {});

  timings[concept.id] = {duration, beats};
  metadata[concept.id] = {duration};

  await fs.writeFile(timingsFile, `${JSON.stringify(timings, null, 2)}\n`);
  await fs.writeFile(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Wrote ${output}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
