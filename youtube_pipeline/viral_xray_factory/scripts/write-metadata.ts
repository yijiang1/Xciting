import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {concepts} from '../src/concepts';

const root = process.cwd();
const metadataDir = path.resolve(root, 'metadata');

const run = async () => {
  await fs.mkdir(metadataDir, {recursive: true});
  for (const concept of concepts) {
    const pinnedComment =
      concept.style === 'roundtable'
        ? 'Which impossible roundtable should we animate next: climate, AI, education, or the future of science?'
        : `Which X-ray concept should Exciting animate next: XANES, EXAFS fitting, detector dead time, or monochromators?`;
    const body = [
      `# ${concept.upload.title}`,
      '',
      `Video ID: ${concept.id}`,
      `Style: ${concept.style}`,
      `Topic: ${concept.topic}`,
      '',
      '## Asset Files',
      `Video: renders/${concept.id}.mp4`,
      `Subtitles: subtitles/${concept.id}.srt`,
      '',
      '## YouTube Title',
      concept.upload.title,
      '',
      '## Description',
      concept.upload.description,
      '',
      '## Tags',
      concept.upload.tags.join(', '),
      '',
      '## Pinned Comment Draft',
      pinnedComment,
      '',
      '## Voiceover Script',
      ...concept.beats.map((beat, index) => `${index + 1}. ${beat.text}`),
      '',
    ].join('\n');
    await fs.writeFile(path.join(metadataDir, `${concept.id}.md`), body);
  }
  console.log(`Wrote ${concepts.length} metadata files.`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
