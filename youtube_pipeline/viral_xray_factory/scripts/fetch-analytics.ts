// Pulls per-video performance from the YouTube Analytics API for everything
// this pipeline has published, writes content/analytics.json, and prints a
// report. generate-concepts reads that file to steer future topics toward
// what actually retains viewers.
//
// Uses the same OAuth client as publishing, but the refresh token must
// include the https://www.googleapis.com/auth/yt-analytics.readonly scope.
//
// Usage: npm run analytics [-- --days 90]

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {google} from 'googleapis';
import {loadConcepts, readState} from './lib/content';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const analyticsFile = path.resolve(root, 'content/analytics.json');

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const run = async () => {
  const missing = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'].filter((key) => !process.env[key]);
  if (missing.length > 0) throw new Error(`Missing YouTube OAuth env vars: ${missing.join(', ')}`);

  const args = process.argv.slice(2);
  const daysFlagIndex = args.findIndex((arg) => arg === '--days');
  const days = daysFlagIndex >= 0 ? Number(args[daysFlagIndex + 1] ?? 90) : 90;

  const concepts = await loadConcepts();
  const state = await readState();
  const published = concepts
    .map((concept) => ({concept, youtube: state[concept.id]?.published?.youtube}))
    .filter((entry): entry is {concept: (typeof concepts)[number]; youtube: NonNullable<typeof entry.youtube>} => Boolean(entry.youtube));

  if (published.length === 0) {
    console.log('Nothing published yet — analytics will be available after the first npm run publish.');
    return;
  }

  const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth2Client.setCredentials({refresh_token: process.env.YOUTUBE_REFRESH_TOKEN});
  const analytics = google.youtubeAnalytics({version: 'v2', auth: oauth2Client});

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const videoIds = published.map((entry) => entry.youtube.videoId);

  const response = await analytics.reports.query({
    ids: 'channel==MINE',
    startDate: isoDate(start),
    endDate: isoDate(end),
    metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,subscribersGained',
    dimensions: 'video',
    filters: `video==${videoIds.join(',')}`,
    maxResults: 200,
  });

  const rows = (response.data.rows ?? []) as Array<[string, number, number, number, number, number, number]>;
  const byVideoId = new Map(rows.map((row) => [row[0], row]));

  const videos = published.map(({concept, youtube}) => {
    const row = byVideoId.get(youtube.videoId);
    return {
      conceptId: concept.id,
      videoId: youtube.videoId,
      title: concept.upload.title,
      topic: concept.topic,
      series: concept.series,
      style: concept.style,
      views: row?.[1] ?? 0,
      estimatedMinutesWatched: row?.[2] ?? 0,
      averageViewDuration: row?.[3] ?? 0,
      averageViewPercentage: row?.[4] ?? 0,
      likes: row?.[5] ?? 0,
      subscribersGained: row?.[6] ?? 0,
    };
  });

  await fs.writeFile(analyticsFile, `${JSON.stringify({fetchedAt: new Date().toISOString(), days, videos}, null, 2)}\n`);

  const sorted = [...videos].sort((a, b) => b.averageViewPercentage - a.averageViewPercentage);
  console.log(`Last ${days} days:`);
  for (const video of sorted) {
    console.log(
      `  ${video.averageViewPercentage.toFixed(0).padStart(3)}% watched  ${String(video.views).padStart(7)} views  ${String(video.subscribersGained).padStart(4)} subs  ${video.conceptId} [${video.style}]`,
    );
  }
  console.log(`\nWrote ${path.relative(root, analyticsFile)} — future npm run concepts -- --auto picks will use it.`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
