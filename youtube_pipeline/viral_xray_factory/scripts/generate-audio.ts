import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import {execa} from 'execa';
import {Beat, OpenAiVoice, concepts} from '../src/concepts';
import type {CaptionWord} from '../src/captions';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const audioDir = path.resolve(root, 'public/audio');
const dataDir = path.resolve(root, 'public/data');
const tmpDir = path.resolve(root, 'cache/audio-pieces');

type TimedBeat = {
  start: number;
  end: number;
  text: string;
  visual: string;
  speaker?: string;
  role?: Beat['role'];
};

type Timeline = {duration: number; beats: TimedBeat[]; words?: CaptionWord[]};

const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

const ttsProvider = (process.env.TTS_PROVIDER ?? (process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'openai')) as
  | 'elevenlabs'
  | 'openai';

// ---------------------------------------------------------------------------
// Voice casting
// ---------------------------------------------------------------------------

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

// ElevenLabs premade voice IDs (https://elevenlabs.io/docs -> default voices).
// Override any entry with the ELEVENLABS_VOICE_MAP env var, a JSON object of
// {"<speaker-or-concept-id>": "<voiceId>"}.
const elevenDefaultVoices: Record<string, string> = {
  // Narrators keyed by concept id
  cartoon_bragg_detective: 'cgSgspJ2msm6clMCkdW9', // Jessica - playful, expressive
  interview_absorption_edge: 'IKne3meq5aSn9XLyUdCB', // Charlie - conversational
  gameshow_xrd_peaks: 'bIHbv24MWmeRgasZH58o', // Will - energetic
  noir_exafs_echo: 'N2lVS1w4EtoT3dr4eOWO', // Callum - gravelly, cinematic
  news_synchrotron_weather: 'nPczCjzI2devNBz1zQrb', // Brian - anchor
  mockumentary_professor_vane: 'JBFqnCBsd6RMkjVDRZzb', // George - dry storyteller
  // Roundtable cast keyed by speaker
  Host: 'onwK4e9ZLuTAKqWW03F9', // Daniel - authoritative host
  Einstein: 'JBFqnCBsd6RMkjVDRZzb', // George - warm, mature
  Curie: 'XrExE9yKIg1WjnnlVkGX', // Matilda - measured, professional
  Feynman: 'iP95p4xoKVk53GoZ742B', // Chris - casual, lively
  Socrates: 'pqHfZKP75CvOlQylNhV4', // Bill - strong, older
  Confucius: 'cjVigY5qzO86Huf0OWal', // Eric - steady, teacherly
  Shakespeare: 'N2lVS1w4EtoT3dr4eOWO', // Callum - theatrical
  Leonardo: 'pNInz6obpgDQGcFmaJgB', // Adam - deep, tactile
  Frida: 'cgSgspJ2msm6clMCkdW9', // Jessica - vivid, direct
  Mandela: 'nPczCjzI2devNBz1zQrb', // Brian - resonant, deliberate
};

const elevenVoiceOverrides: Record<string, string> = (() => {
  try {
    return JSON.parse(process.env.ELEVENLABS_VOICE_MAP ?? '{}');
  } catch {
    console.warn('ELEVENLABS_VOICE_MAP is not valid JSON; ignoring.');
    return {};
  }
})();

const elevenVoiceFor = (conceptId: string, beat: Beat): string => {
  const key = beat.speaker ?? conceptId;
  return elevenVoiceOverrides[key] ?? elevenDefaultVoices[key] ?? elevenDefaultVoices[conceptId] ?? 'onwK4e9ZLuTAKqWW03F9';
};

// ---------------------------------------------------------------------------
// TTS backends
// ---------------------------------------------------------------------------

const speechInputFor = (beat: Beat) => beat.text.replace(/^[A-Za-z .'-]{1,32}:\s*/, '');

const ttsProfileFor = (conceptId: string, beat: Beat, fallbackVoice: OpenAiVoice, fallbackInstructions: string): SpeakerProfile => {
  const speakerProfile = conceptId === 'roundtable_knowledge_wisdom' && beat.speaker ? roundtableSpeakerProfiles[beat.speaker] : undefined;
  return {
    voice: beat.openaiVoice ?? speakerProfile?.voice ?? fallbackVoice,
    instructions: [fallbackInstructions, speakerProfile?.instructions, beat.openaiInstructions].filter(Boolean).join('\n'),
  };
};

const makeOpenAiSpeech = async (input: string, voice: string, instructions: string, outFile: string) => {
  const response = await client.audio.speech.create({
    model: process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts',
    voice,
    input,
    instructions,
    response_format: 'mp3',
  });
  await fs.writeFile(outFile, Buffer.from(await response.arrayBuffer()));
};

const makeElevenSpeech = async (
  input: string,
  voiceId: string,
  context: {previousText?: string; nextText?: string},
  outFile: string,
) => {
  const modelId = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_v3';
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT ?? 'mp3_44100_128';
  const body: Record<string, unknown> = {
    text: input,
    model_id: modelId,
    previous_text: context.previousText,
    next_text: context.nextText,
  };
  if (!modelId.startsWith('eleven_v3')) {
    body.voice_settings = {stability: 0.45, similarity_boost: 0.75, style: 0.25};
  }
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`, {
    method: 'POST',
    headers: {'xi-api-key': process.env.ELEVENLABS_API_KEY as string, 'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${await response.text()}`);
  }
  await fs.writeFile(outFile, Buffer.from(await response.arrayBuffer()));
};

const withRetries = async <T>(label: string, attempts: number, fn: () => Promise<T>): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`  retry ${attempt}/${attempts} for ${label}: ${error instanceof Error ? error.message : error}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  throw lastError;
};

// ---------------------------------------------------------------------------
// Pacing + mastering
// ---------------------------------------------------------------------------

// Natural pauses: sentence ends breathe longer than commas, and a change of
// speaker gets extra air. Fixed identical gaps are one of the strongest
// "this is machine-generated" tells.
const gapAfter = (beat: Beat, nextBeat: Beat | undefined): number => {
  const text = beat.text.trim();
  let gap = 0.36;
  if (/[?!]$/.test(text)) gap = 0.52;
  else if (/[.…]$/.test(text)) gap = 0.44;
  else if (/[,;:]$/.test(text)) gap = 0.3;
  if (nextBeat && nextBeat.speaker && nextBeat.speaker !== beat.speaker) gap += 0.22;
  return gap;
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

const concatAudio = async (files: string[], output: string) => {
  const listFile = path.join(tmpDir, `concat-${path.basename(output)}.txt`);
  const lines = files.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n');
  await fs.writeFile(listFile, lines);
  await execa('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '2', output]);
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

// Master the narration: a whisper-quiet room-tone bed hides the dead digital
// silence between lines, then loudnorm brings the track to the -14 LUFS
// streaming standard.
const masterAudio = async (input: string, output: string) => {
  await execa('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-i',
    input,
    '-filter_complex',
    [
      'anoisesrc=color=pink:amplitude=0.0012:sample_rate=44100[nz]',
      '[nz]volume=0.35[nzq]',
      '[0:a][nzq]amix=inputs=2:duration=first:normalize=0[mix]',
      '[mix]loudnorm=I=-14:TP=-1.5:LRA=11[out]',
    ].join(';'),
    '-map',
    '[out]',
    '-ar',
    '44100',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '192k',
    output,
  ]);
};

// ---------------------------------------------------------------------------
// Word-level timestamps (karaoke captions)
// ---------------------------------------------------------------------------

const transcribeWords = async (file: string): Promise<CaptionWord[] | undefined> => {
  if (process.env.CAPTION_WORDS === '0') return undefined;
  if (!process.env.OPENAI_API_KEY) return undefined;
  try {
    const transcription = (await client.audio.transcriptions.create({
      file: createReadStream(file),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    })) as unknown as {words?: Array<{word: string; start: number; end: number}>};
    return transcription.words?.map((word) => ({
      text: word.word.trim(),
      start: Number(word.start.toFixed(3)),
      end: Number(word.end.toFixed(3)),
    }));
  } catch (error) {
    console.warn(`  word timestamps skipped: ${error instanceof Error ? error.message : error}`);
    return undefined;
  }
};

// ---------------------------------------------------------------------------

const readJson = async <T>(file: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const run = async () => {
  if (ttsProvider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing. Expected ../.env.local or .env.local.');
  }
  if (ttsProvider === 'elevenlabs' && !process.env.ELEVENLABS_API_KEY) {
    throw new Error('TTS_PROVIDER=elevenlabs but ELEVENLABS_API_KEY is missing.');
  }
  await fs.mkdir(audioDir, {recursive: true});
  await fs.mkdir(dataDir, {recursive: true});
  await fs.mkdir(tmpDir, {recursive: true});

  const requestedIds = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const selectedConcepts = requestedIds.length > 0 ? concepts.filter((concept) => requestedIds.includes(concept.id)) : concepts;
  const missingIds = requestedIds.filter((id) => !concepts.some((concept) => concept.id === id));
  if (missingIds.length > 0) {
    throw new Error(`Unknown concept id(s): ${missingIds.join(', ')}`);
  }

  console.log(`TTS provider: ${ttsProvider}${ttsProvider === 'elevenlabs' ? ` (${process.env.ELEVENLABS_MODEL_ID ?? 'eleven_v3'})` : ''}`);

  const timingsFile = path.join(dataDir, 'timings.json');
  const metadataFile = path.join(dataDir, 'audio-metadata.json');
  const timings = await readJson<Record<string, Timeline>>(timingsFile, {});
  const metadata = await readJson<Record<string, {duration: number}>>(metadataFile, {});

  for (const concept of selectedConcepts) {
    console.log(`Generating TTS: ${concept.id}`);
    const filesToConcat: string[] = [];
    const beats: TimedBeat[] = [];
    let cursor = 0;

    for (let index = 0; index < concept.beats.length; index += 1) {
      const beat = concept.beats[index];
      const nextBeat = concept.beats[index + 1];
      const piece = path.join(tmpDir, `${concept.id}-${String(index + 1).padStart(2, '0')}.mp3`);
      const input = speechInputFor(beat);

      if (ttsProvider === 'elevenlabs') {
        const voiceId = elevenVoiceFor(concept.id, beat);
        console.log(`  ${String(index + 1).padStart(2, '0')}/${concept.beats.length}: ${beat.speaker ?? 'Narrator'} -> eleven:${voiceId}`);
        await withRetries(`beat ${index + 1}`, 3, () =>
          makeElevenSpeech(
            input,
            voiceId,
            {
              previousText: index > 0 && concept.beats[index - 1].speaker === beat.speaker ? speechInputFor(concept.beats[index - 1]) : undefined,
              nextText: nextBeat && nextBeat.speaker === beat.speaker ? speechInputFor(nextBeat) : undefined,
            },
            piece,
          ),
        );
      } else {
        const profile = ttsProfileFor(concept.id, beat, concept.voice, concept.ttsInstructions);
        console.log(`  ${String(index + 1).padStart(2, '0')}/${concept.beats.length}: ${beat.speaker ?? 'Narrator'} -> ${profile.voice}`);
        await withRetries(`beat ${index + 1}`, 3, () => makeOpenAiSpeech(input, profile.voice, profile.instructions, piece));
      }

      const duration = await durationOf(piece);
      const gap = gapAfter(beat, nextBeat);
      beats.push({
        start: Number(cursor.toFixed(3)),
        end: Number((cursor + duration + gap).toFixed(3)),
        text: beat.text,
        visual: beat.visual,
        speaker: beat.speaker,
        role: beat.role,
      });
      cursor += duration + gap;
      filesToConcat.push(piece);
      const gapFile = path.join(tmpDir, `${concept.id}-${String(index + 1).padStart(2, '0')}-gap.mp3`);
      await makeSilence(gap, gapFile);
      filesToConcat.push(gapFile);
    }

    const rawOutput = path.join(tmpDir, `${concept.id}-raw.mp3`);
    const output = path.join(audioDir, `${concept.id}.mp3`);
    await concatAudio(filesToConcat, rawOutput);
    await masterAudio(rawOutput, output);
    const duration = await durationOf(output);

    console.log('  transcribing word timestamps for karaoke captions...');
    const words = await transcribeWords(output);
    if (words) console.log(`  ${words.length} words aligned.`);

    timings[concept.id] = {duration: Number(duration.toFixed(3)), beats, words};
    metadata[concept.id] = {duration: Number(duration.toFixed(3))};
  }

  await fs.writeFile(timingsFile, `${JSON.stringify(timings, null, 2)}\n`);
  await fs.writeFile(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log('Wrote timing metadata.');
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
