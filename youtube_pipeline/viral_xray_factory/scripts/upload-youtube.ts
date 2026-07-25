// Publishes a concept to YouTube via the official Data API. Uploads the
// concept's primary format by default (portrait uploads under 3 minutes are
// auto-classified as Shorts). Stays private unless --public is passed, and
// records the published video in content/state.json.
//
// Usage:
//   npm run publish -- <conceptId...> [--format portrait|landscape] [--public]
//
// Requires OAuth env vars (see .env.example): YOUTUBE_CLIENT_ID,
// YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN.

import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {google} from 'googleapis';
import type {Format} from './lib/schema';
import {loadConcepts, updateState} from './lib/content';
import {renderFileFor} from './lib/render-targets';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const subtitlesDir = path.resolve(root, 'subtitles');
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

const run = async () => {
  assertEnv();

  const args = process.argv.slice(2);
  const isPublic = args.includes('--public');
  const privacyStatus = isPublic ? 'public' : (process.env.YOUTUBE_PRIVACY_STATUS ?? 'private');
  const formatFlagIndex = args.findIndex((arg) => arg === '--format');
  const formatOverride = formatFlagIndex >= 0 ? (args[formatFlagIndex + 1] as Format) : undefined;
  if (formatOverride && formatOverride !== 'portrait' && formatOverride !== 'landscape') {
    throw new Error(`--format must be portrait or landscape, got "${formatOverride}"`);
  }
  const formatValueIndex = formatFlagIndex >= 0 ? formatFlagIndex + 1 : -1;
  const ids = args.filter((arg, index) => !arg.startsWith('-') && index !== formatValueIndex);

  const concepts = await loadConcepts();
  if (ids.length === 0) {
    throw new Error(`Pass concept ids. Available: ${concepts.map((concept) => concept.id).join(', ')}`);
  }
  const unknown = ids.filter((id) => !concepts.some((concept) => concept.id === id));
  if (unknown.length > 0) throw new Error(`Unknown concept id: ${unknown.join(', ')}`);
  const selected = concepts.filter((concept) => ids.includes(concept.id));

  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({refresh_token: process.env.YOUTUBE_REFRESH_TOKEN});

  const youtube = google.youtube({version: 'v3', auth: oauth2Client});

  for (const concept of selected) {
    if (concept.status !== 'approved') {
      throw new Error(`${concept.id} is still a draft. Approve it first: npm run approve -- ${concept.id}`);
    }
    const format = formatOverride ?? concept.formats[0];
    if (!concept.formats.includes(format)) {
      throw new Error(`${concept.id} has no ${format} format (formats: ${concept.formats.join(', ')}).`);
    }
    const videoFile = await existingFile(path.resolve(root, renderFileFor(concept.id, format)));
    const subtitleFile = await existingFile(path.join(subtitlesDir, `${concept.id}.srt`));

    console.log(`Uploading ${concept.id} [${format}] as ${privacyStatus}`);
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

    // Custom thumbnail for landscape uploads when one has been generated
    // (requires a verified channel; failure is non-fatal).
    if (format === 'landscape') {
      const thumbnail = path.resolve(root, `bundles/${concept.id}/thumbnail.png`);
      const hasThumbnail = await fs
        .access(thumbnail)
        .then(() => true)
        .catch(() => false);
      if (hasThumbnail) {
        try {
          await youtube.thumbnails.set({videoId, media: {mimeType: 'image/png', body: createReadStream(thumbnail)}});
          console.log('  thumbnail set');
        } catch (error) {
          console.warn(`  thumbnail failed (channel not verified?): ${error instanceof Error ? error.message : error}`);
        }
      }
    }

    await updateState(concept.id, {
      published: {youtube: {videoId, at: new Date().toISOString(), privacyStatus, format}},
    });
    console.log(`${concept.id}: https://youtu.be/${videoId}`);
    if (privacyStatus === 'private') {
      console.log('  (private upload — flip to public in YouTube Studio or re-run with --public before uploading)');
    }
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
