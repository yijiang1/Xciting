// Composes the music for a size-comparison video (src/SizeCompare.tsx) from
// the Eleven Music plan stored in its data file; section lengths follow the
// flyover timing so the music peaks when the full row of rings is revealed.
//
// Usage: npx tsx scripts/generate-compare-music.ts content/compare/synchrotrons.json

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config({path: path.resolve('../.env.local')});
dotenv.config({path: path.resolve('.env.local')});

const data = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const response = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
  method: 'POST',
  headers: {'xi-api-key': process.env.ELEVENLABS_API_KEY as string, 'content-type': 'application/json'},
  body: JSON.stringify(data.music),
});
if (!response.ok) throw new Error(`Eleven Music failed (${response.status}): ${await response.text()}`);
const out = `public/footage/compare/${data.id}-music.mp3`;
await fs.writeFile(out, Buffer.from(await response.arrayBuffer()));
console.log(`wrote ${out}`);
