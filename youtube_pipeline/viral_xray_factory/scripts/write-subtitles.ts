import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {CaptionWord, buildCaptionPages} from '../src/captions';

type TimedBeat = {
  start: number;
  end: number;
  text: string;
};

type Timings = Record<string, {duration: number; beats: TimedBeat[]; words?: CaptionWord[]}>;

const root = process.cwd();
const dataFile = path.resolve(root, 'public/data/timings.json');
const subtitlesDir = path.resolve(root, 'subtitles');

const formatSrtTime = (seconds: number) => {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const wholeSeconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
};

const splitCaption = (text: string) => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 48 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.join('\n');
};

const run = async () => {
  const raw = await fs.readFile(dataFile, 'utf8');
  const timings = JSON.parse(raw) as Timings;
  await fs.mkdir(subtitlesDir, {recursive: true});

  for (const [id, timeline] of Object.entries(timings)) {
    // Word-accurate short cues when Whisper alignment exists; beat-level
    // blocks otherwise.
    const cues =
      timeline.words && timeline.words.length > 0
        ? buildCaptionPages(timeline.words, {maxWords: 8, maxDuration: 4, maxGap: 0.8}).map((page) => ({
            start: page.start,
            end: page.end,
            text: page.words.map((word) => word.text).join(' '),
          }))
        : timeline.beats;

    const blocks = cues.map((cue, index) =>
      [String(index + 1), `${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}`, splitCaption(cue.text)].join('\n'),
    );
    await fs.writeFile(path.join(subtitlesDir, `${id}.srt`), `${blocks.join('\n\n')}\n`);
  }

  console.log(`Wrote ${Object.keys(timings).length} subtitle files.`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
