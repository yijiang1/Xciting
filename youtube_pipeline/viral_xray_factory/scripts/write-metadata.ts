import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {loadConcepts} from './lib/content';
import {renderOutputs} from './lib/render-targets';

const root = process.cwd();
const metadataDir = path.resolve(root, 'metadata');

const run = async () => {
  await fs.mkdir(metadataDir, {recursive: true});
  const concepts = await loadConcepts();
  const ids = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const selected = ids.length > 0 ? concepts.filter((concept) => ids.includes(concept.id)) : concepts;
  for (const concept of selected) {
    const body = [
      `# ${concept.upload.title}`,
      '',
      `Video ID: ${concept.id}`,
      `Style: ${concept.style}`,
      `Series: ${concept.series}`,
      `Topic: ${concept.topic}`,
      `Status: ${concept.status}`,
      '',
      '## Asset Files',
      ...renderOutputs(concept).map(({format, relFile}) => `Video (${format}): ${relFile}`),
      `Subtitles: subtitles/${concept.id}.srt`,
      '',
      '## YouTube Title',
      concept.upload.title,
      ...(concept.titleVariants && concept.titleVariants.length > 0 ? ['', '### Title Variants', ...concept.titleVariants.map((title) => `- ${title}`)] : []),
      '',
      '## Description',
      concept.upload.description,
      '',
      '## Tags',
      concept.upload.tags.join(', '),
      '',
      '## Hashtags',
      (concept.hashtags ?? []).join(' '),
      '',
      '## Pinned Comment Draft',
      concept.pinnedComment ?? 'What should we explain next? Drop a topic below.',
      '',
      '## Voiceover Script',
      ...concept.beats.map((beat, index) => `${index + 1}. ${beat.text}`),
      '',
    ].join('\n');
    await fs.writeFile(path.join(metadataDir, `${concept.id}.md`), body);
  }
  console.log(`Wrote ${selected.length} metadata files.`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
