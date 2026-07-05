import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import {execa} from 'execa';
import {Beat, OpenAiVoice, concepts} from '../src/concepts';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const audioDir = path.resolve(root, 'public/audio');
const dataDir = path.resolve(root, 'public/data');
const tmpDir = path.resolve(root, 'cache/audio-pieces');

const gapSeconds = 0.22;

type TimedBeat = {
  start: number;
  end: number;
  text: string;
  visual: string;
  speaker?: string;
  role?: Beat['role'];
};

const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

type SpeakerProfile = {
  voice: OpenAiVoice;
  instructions: string;
};

const roundtableSpeakerProfiles: Record<string, SpeakerProfile> = {
  Host: {
    voice: 'marin',
    instructions: 'Neutral podcast host. Warm, restrained, precise, and modern. Keep transitions conversational and never theatrical.',
  },
  Einstein: {
    voice: 'cedar',
    instructions:
      'Thoughtful older theoretical physicist energy: gentle, reflective, slightly wry. Use a generic synthetic voice, not an impersonation or real voice match.',
  },
  Curie: {
    voice: 'shimmer',
    instructions:
      'Measured laboratory scientist. Calm discipline, quiet intensity, and careful emphasis on evidence. Use a generic synthetic voice, not an impersonation.',
  },
  Feynman: {
    voice: 'echo',
    instructions:
      'Restless explainer with playful timing and sharp skepticism. Crisp, lively, curious. Use a generic synthetic voice, not an impersonation.',
  },
  Socrates: {
    voice: 'onyx',
    instructions:
      'Philosophical questioner. Slow enough to sound like live inquiry, with dry wit and pointed pauses. Use a generic synthetic voice, not an impersonation.',
  },
  Confucius: {
    voice: 'sage',
    instructions:
      'Grave teacherly cadence. Balanced, humane, and relational; emphasize duty, ritual, and care. Use a generic synthetic voice, not an impersonation.',
  },
  Shakespeare: {
    voice: 'fable',
    instructions:
      'Dramatic writer at a microphone: literate, nimble, ironic, with theatrical color but modern clarity. Use a generic synthetic voice, not an impersonation.',
  },
  Leonardo: {
    voice: 'ballad',
    instructions:
      'Observant artist-engineer. Curious, visual, tactile, as if describing sketches and mechanisms. Use a generic synthetic voice, not an impersonation.',
  },
  Frida: {
    voice: 'coral',
    instructions:
      'Direct artist voice: intimate, vivid, unsentimental, emotionally honest. Use a generic synthetic voice, not an impersonation.',
  },
  Mandela: {
    voice: 'alloy',
    instructions:
      'Statesmanlike and grounded. Deliberate, humane, resolute, focused on reconciliation and institutions. Use a generic synthetic voice, not an impersonation.',
  },
};

const durationOf = async (file: string): Promise<number> => {
  const {stdout} = await execa('ffprobe', [
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

const makeSpeech = async (input: string, voice: string, instructions: string, outFile: string) => {
  const response = await client.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice,
    input,
    instructions,
    response_format: 'mp3',
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outFile, buffer);
};

const readJson = async <T>(file: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const speechInputFor = (beat: Beat) => beat.text.replace(/^[A-Za-z .'-]{1,32}:\s*/, '');

const ttsProfileFor = (conceptId: string, beat: Beat, fallbackVoice: OpenAiVoice, fallbackInstructions: string): SpeakerProfile => {
  const speakerProfile = conceptId === 'roundtable_knowledge_wisdom' && beat.speaker ? roundtableSpeakerProfiles[beat.speaker] : undefined;
  return {
    voice: beat.openaiVoice ?? speakerProfile?.voice ?? fallbackVoice,
    instructions: [fallbackInstructions, speakerProfile?.instructions, beat.openaiInstructions].filter(Boolean).join('\n'),
  };
};

const concatAudio = async (files: string[], output: string) => {
  const listFile = path.join(tmpDir, `concat-${path.basename(output)}.txt`);
  const lines = files.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n');
  await fs.writeFile(listFile, lines);
  await execa('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'libmp3lame', '-q:a', '3', output]);
};

const makeSilence = async (duration: number, output: string) => {
  await execa('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=44100:cl=stereo`,
    '-t',
    String(duration),
    '-q:a',
    '9',
    '-acodec',
    'libmp3lame',
    output,
  ]);
};

const run = async () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing. Expected ../.env.local or .env.local.');
  }
  await fs.mkdir(audioDir, {recursive: true});
  await fs.mkdir(dataDir, {recursive: true});
  await fs.mkdir(tmpDir, {recursive: true});

  const requestedIds = process.argv.slice(2);
  const selectedConcepts = requestedIds.length > 0 ? concepts.filter((concept) => requestedIds.includes(concept.id)) : concepts;
  const missingIds = requestedIds.filter((id) => !concepts.some((concept) => concept.id === id));
  if (missingIds.length > 0) {
    throw new Error(`Unknown concept id(s): ${missingIds.join(', ')}`);
  }

  const timingsFile = path.join(dataDir, 'timings.json');
  const metadataFile = path.join(dataDir, 'audio-metadata.json');
  const timings = await readJson<Record<string, {duration: number; beats: TimedBeat[]}>>(timingsFile, {});
  const metadata = await readJson<Record<string, {duration: number}>>(metadataFile, {});

  for (const concept of selectedConcepts) {
    console.log(`Generating TTS: ${concept.id}`);
    const filesToConcat: string[] = [];
    const beats: TimedBeat[] = [];
    let cursor = 0;

    for (let index = 0; index < concept.beats.length; index += 1) {
      const beat = concept.beats[index];
      const piece = path.join(tmpDir, `${concept.id}-${String(index + 1).padStart(2, '0')}.mp3`);
      const profile = ttsProfileFor(concept.id, beat, concept.voice, concept.ttsInstructions);
      console.log(`  ${String(index + 1).padStart(2, '0')}/${concept.beats.length}: ${beat.speaker ?? 'Narrator'} -> ${profile.voice}`);
      await makeSpeech(speechInputFor(beat), profile.voice, profile.instructions, piece);
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
    const duration = await durationOf(output);
    timings[concept.id] = {duration: Number(duration.toFixed(3)), beats};
    metadata[concept.id] = {duration: Number(duration.toFixed(3))};
  }

  await fs.writeFile(path.join(dataDir, 'timings.json'), `${JSON.stringify(timings, null, 2)}\n`);
  await fs.writeFile(path.join(dataDir, 'audio-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log('Wrote timing metadata.');
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
