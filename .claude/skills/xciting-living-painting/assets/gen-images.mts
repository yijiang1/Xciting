// Template: generates one painting per scene with gpt-image-1 into public/scenes/<id>.png.
// Copy into the project folder (youtube_pipeline/remakes/<name>/) and run from there:
//   node_modules/.bin/tsx gen-images.mts           # only missing files are generated
//   node_modules/.bin/tsx gen-images.mts <id> ...  # force-regenerate these ids
// Costs about $0.25 per 1536x1024 image at quality 'high' (Sept 2026). Show the user the job list and cost first.
// Never run two copies at once: both see the same missing files and both pay for them.
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({path: path.resolve('../../viral_xray_factory/.env.local')});
const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
const OUT = path.resolve('public/scenes');

// One shared style sentence keeps every scene looking like the same painter made it.
const STYLE =
  'Traditional Chinese ink-wash painting (shuimo) with delicate watercolor tints on xuan rice paper: muted warm grays, pale ochre, faded blue-green water, soft wet-on-wet mist, generous empty space, poetic and serene. ' +
  'Absolutely no text, no calligraphy, no red seals, no signature, no border, no frame.';
// The lyric text sits in the top ~30% of the frame, so reserve it.
const SKY = ' The top third of the picture is calm, nearly empty pale misty sky, left clear for overlaid text.';

type Job = {id: string; prompt: string; size: '1536x1024' | '1024x1536'};
const JOBS: Job[] = [
  // Describe the moment the line means, with the things you will animate placed where you can find them:
  // {id: 'across', size: '1536x1024', prompt: 'A wide misty river seen from the near bank. On the far bank, small and distant, a woman in pale hanfu stands among reeds, half-veiled by fog, her reflection in the water.' + SKY},
  // Tall portrait images let the camera climb (steep paths, waterfalls, towers):
  // {id: 'steep', size: '1024x1536', prompt: 'Tall vertical composition: a steep stone stair zigzags up sheer cliffs beside a waterfall; a tiny traveler climbs near the middle; peaks rise into clouds.'},
];

const run = async (job: Job) => {
  const file = path.join(OUT, `${job.id}.png`);
  if (!process.argv.includes(job.id) && (await fs.stat(file).catch(() => null))) return console.log(`skip ${job.id}`);
  const t = Date.now();
  const res = await client.images.generate({model: 'gpt-image-1', prompt: `${job.prompt} ${STYLE}`, size: job.size, quality: 'high'});
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error(`no image for ${job.id}`);
  await fs.writeFile(file, Buffer.from(b64, 'base64'));
  console.log(`done ${job.id} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
};

await fs.mkdir(OUT, {recursive: true});
for (let i = 0; i < JOBS.length; i += 5) await Promise.all(JOBS.slice(i, i + 5).map(run)); // 5 at a time
