// Validates content/concepts/*.json and rewrites src/concepts.generated.json.
// Run after adding or editing concept files (the pipeline runs it for you).
//
// Usage: npm run sync [-- --prune]  (--prune also drops footage manifest
// entries whose clips are missing on disk)

import process from 'node:process';
import {pruneFootageManifest, syncGeneratedConcepts} from './lib/content';

const run = async () => {
  const concepts = await syncGeneratedConcepts();
  console.log(`${concepts.length} concepts valid: ${concepts.map((concept) => concept.id).join(', ')}`);
  if (process.argv.includes('--prune')) {
    await pruneFootageManifest();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
