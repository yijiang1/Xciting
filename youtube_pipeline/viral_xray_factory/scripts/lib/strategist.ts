// Each day's "what to make" decision. Replaces a fixed weekday rotation with
// a single LLM call that reasons over past performance -- views, retention,
// subscriber gain, likes: the best available proxies for future ad revenue
// until the channel is monetized and real revenue metrics exist -- and picks
// today's theme, presentation style, series, topic, and angle.
//
// Explore/exploit: a theme or style needs a handful of published videos
// before its numbers mean anything, so the prompt tells the model to keep
// testing broadly below that sample size and only lean into a proven
// performer once it clears the threshold, while still reserving some picks
// for new/underrepresented ground.

import path from 'node:path';
import {z} from 'zod';
import {StoredConcept} from './schema';
import {loadConcepts, projectRoot, readJson} from './content';
import {generateStructured, llmModel} from './llm';
import {loadTopicBank} from './topic-bank';

const analyticsFile = path.resolve(projectRoot, 'content/analytics.json');

type AnalyticsVideo = {
  conceptId: string;
  views: number;
  averageViewPercentage: number;
  subscribersGained: number;
  likes: number;
};
type Analytics = {videos?: AnalyticsVideo[]};

export type GroupStats = {
  key: string;
  madeCount: number;
  publishedCount: number;
  avgViews?: number;
  avgRetentionPct?: number;
  avgSubsGained?: number;
};

const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

export const buildScoreboard = (concepts: StoredConcept[], videos: AnalyticsVideo[], basis: 'theme' | 'style'): GroupStats[] => {
  const perfByConceptId = new Map(videos.map((video) => [video.conceptId, video]));
  const groups = new Map<string, {made: number; perf: AnalyticsVideo[]}>();
  for (const concept of concepts) {
    const key = basis === 'theme' ? concept.theme : concept.style;
    if (!key) continue;
    const bucket = groups.get(key) ?? {made: 0, perf: []};
    bucket.made += 1;
    const perf = perfByConceptId.get(concept.id);
    if (perf) bucket.perf.push(perf);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .map(([key, {made, perf}]) => ({
      key,
      madeCount: made,
      publishedCount: perf.length,
      avgViews: perf.length > 0 ? average(perf.map((video) => video.views)) : undefined,
      avgRetentionPct: perf.length > 0 ? average(perf.map((video) => video.averageViewPercentage)) : undefined,
      avgSubsGained: perf.length > 0 ? average(perf.map((video) => video.subscribersGained)) : undefined,
    }))
    .sort((a, b) => (b.avgRetentionPct ?? -1) - (a.avgRetentionPct ?? -1));
};

const formatScoreboard = (rows: GroupStats[], label: string): string => {
  if (rows.length === 0) return `No ${label} tried yet -- this is wide open.`;
  return rows
    .map((row) => {
      const perf =
        row.publishedCount > 0
          ? `${row.publishedCount} published, avg ${row.avgViews!.toFixed(0)} views / ${row.avgRetentionPct!.toFixed(0)}% retention / ${row.avgSubsGained!.toFixed(1)} subs gained`
          : `${row.madeCount} made, none published yet -- no performance data`;
      return `- ${row.key}: ${perf}`;
    })
    .join('\n');
};

const CHANNEL_GUARDRAILS = `You are the daily content strategist for "Exciting", a broad, visually striking science-explainer channel on YouTube Shorts/TikTok/Reels. X-ray, synchrotron, and crystallography content is kept as a distinctive, recognizable sub-series (series: "xray") -- not the whole channel; most output should be series "science". Every video explains ONE concrete, surprising, real mechanism a viewer can retell to a friend afterward. Scientific accuracy is non-negotiable. "style" is a presentation archetype (tone/format), e.g. cartoon, interview, gameshow, noir, news, documentary -- you may reuse a proven one or invent a new one that still fits a fast-paced explainer short. "theme" is a recurring content bucket (e.g. "light_optics", "xray_vision") -- reuse an existing theme slug when it's working, or invent a new lowercase_snake_case one.

Return strategy JSON only: theme (slug), themeLabel (human-readable), series, style, topic (one concrete, specific, filmable idea -- not a vague subject), angle (the specific hook/mechanism), rationale (1-2 sentences, cite the data or say you're exploring).`;

const directionSchema = z.object({
  theme: z.string().regex(/^[a-z0-9_]+$/, 'theme must be lowercase snake_case'),
  themeLabel: z.string().min(1),
  series: z.enum(['science', 'xray', 'roundtable']),
  style: z.string().min(1),
  topic: z.string().min(1),
  angle: z.string().min(1),
  rationale: z.string().min(1),
});
export type Direction = z.infer<typeof directionSchema>;

export const chooseDirection = async (): Promise<Direction> => {
  const [concepts, analytics, bank] = await Promise.all([
    loadConcepts(),
    readJson<Analytics>(analyticsFile, {}),
    loadTopicBank(),
  ]);
  const videos = analytics.videos ?? [];

  const themeScoreboard = buildScoreboard(concepts, videos, 'theme');
  const styleScoreboard = buildScoreboard(concepts, videos, 'style');
  const recent = concepts.slice(-8).map((concept) => `${concept.theme ?? 'untagged'}/${concept.style}: "${concept.topic}"`);
  const candidateTopics = bank.topics.filter((entry) => !entry.used).slice(0, 20);
  const coveredTopics = bank.topics.filter((entry) => entry.used).map((entry) => entry.topic);

  const user = [
    `Performance by theme (retention % is the strongest early signal; views/subs tend to follow it):\n${formatScoreboard(themeScoreboard, 'themes')}`,
    `Performance by presentation style:\n${formatScoreboard(styleScoreboard, 'styles')}`,
    recent.length > 0
      ? `Last ${recent.length} videos made, most recent last (avoid repeating these too closely):\n${recent.map((entry) => `- ${entry}`).join('\n')}`
      : 'No videos made yet -- this is the first one, so pick a strong, safe opener.',
    candidateTopics.length > 0
      ? `Optional pre-vetted topic candidates -- pick one verbatim if it fits your chosen theme, or ignore all of them and propose your own:\n${candidateTopics.map((entry) => `- [${entry.theme}] ${entry.topic} (${entry.angle ?? ''})`).join('\n')}`
      : '',
    coveredTopics.length > 0 ? `Already covered -- never repeat or closely rephrase:\n${coveredTopics.map((topic) => `- ${topic}`).join('\n')}` : '',
    `Explore/exploit rule: a theme or style needs at least 3 published videos before its numbers are trustworthy. Below that, keep testing broadly. Once something clears 3+ published videos with a clear retention lead, lean into it more often -- but still spend roughly 1 in 4 picks on something new or underrepresented so the channel keeps learning.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  console.log(`Choosing today's direction (${llmModel()})...`);
  const direction = await generateStructured({system: CHANNEL_GUARDRAILS, user, schema: directionSchema});
  console.log(`  -> [${direction.series}/${direction.style}] ${direction.themeLabel}: ${direction.topic}`);
  console.log(`  Why: ${direction.rationale}`);
  return direction;
};
