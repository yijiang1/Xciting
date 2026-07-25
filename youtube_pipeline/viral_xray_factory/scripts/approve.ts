// Flips a draft concept to "approved", clearing it for paid footage
// generation and publishing. Skim the script in content/concepts/<id>.json
// (or metadata/<id>.md) first.
//
// Usage: npm run approve -- <conceptId...>

import process from 'node:process';
import {loadConcepts, saveConcept, syncGeneratedConcepts, updateState} from './lib/content';

const run = async () => {
  const ids = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  if (ids.length === 0) {
    console.error('Usage: npm run approve -- <conceptId...>');
    process.exit(1);
  }
  const concepts = await loadConcepts();
  for (const id of ids) {
    const concept = concepts.find((candidate) => candidate.id === id);
    if (!concept) throw new Error(`Unknown concept id: ${id}`);
    if (concept.status === 'approved') {
      console.log(`${id} is already approved.`);
      continue;
    }
    await saveConcept({...concept, status: 'approved'});
    await updateState(id, {approvedAt: new Date().toISOString()});
    console.log(`${id}: draft -> approved`);
  }
  await syncGeneratedConcepts();
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
