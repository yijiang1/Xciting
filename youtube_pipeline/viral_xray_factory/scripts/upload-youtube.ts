import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {google} from 'googleapis';
import {concepts} from '../src/concepts';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const rendersDir = path.resolve(root, 'renders');
const subtitlesDir = path.resolve(root, 'subtitles');
const privacyStatus = process.env.YOUTUBE_PRIVACY_STATUS ?? 'private';
const madeForKids = process.env.YOUTUBE_MADE_FOR_KIDS === 'true';

const requiredEnv = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'] as const;

const assertEnv = () => {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing YouTube OAuth env vars: ${missing.join(', ')}`);
  }
};

const existingFile = async (file: string) => {
  await fs.access(file);
  return file;
};

const selectedConcepts = () => {
  const requested = process.argv.slice(2);
  if (requested.length === 0) {
    return concepts;
  }

  const selected = concepts.filter((concept) => requested.includes(concept.id));
  const known = new Set(concepts.map((concept) => concept.id));
  const unknown = requested.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown concept id: ${unknown.join(', ')}`);
  }

  return selected;
};

const run = async () => {
  assertEnv();

  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({refresh_token: process.env.YOUTUBE_REFRESH_TOKEN});

  const youtube = google.youtube({version: 'v3', auth: oauth2Client});

  for (const concept of selectedConcepts()) {
    const videoFile = await existingFile(path.join(rendersDir, `${concept.id}.mp4`));
    const subtitleFile = await existingFile(path.join(subtitlesDir, `${concept.id}.srt`));

    console.log(`Uploading ${concept.id} as ${privacyStatus}`);
    const upload = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: concept.upload.title,
          description: concept.upload.description,
          tags: concept.upload.tags,
          categoryId: '27',
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: madeForKids,
        },
      },
      media: {
        mimeType: 'video/mp4',
        body: createReadStream(videoFile),
      },
    });

    const videoId = upload.data.id;
    if (!videoId) {
      throw new Error(`YouTube did not return a video id for ${concept.id}`);
    }

    await youtube.captions.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          videoId,
          language: 'en',
          name: 'English',
          isDraft: false,
        },
      },
      media: {
        mimeType: 'application/x-subrip',
        body: createReadStream(subtitleFile),
      },
    });

    console.log(`${concept.id}: https://youtu.be/${videoId}`);
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
