// Self-check for the agent money guard: npx tsx scripts/lib/agent-guard.check.ts

import assert from 'node:assert/strict';
import {checkAgentSpend, refuseDuringAgentRun} from './agent-guard';

const withRun = (value: string | undefined, fn: () => void) => {
  const previous = process.env.XCITING_AGENT_RUN;
  if (value === undefined) delete process.env.XCITING_AGENT_RUN;
  else process.env.XCITING_AGENT_RUN = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.XCITING_AGENT_RUN;
    else process.env.XCITING_AGENT_RUN = previous;
  }
};

// Outside agent runs nothing changes.
withRun(undefined, () => {
  refuseDuringAgentRun('Publishing');
  checkAgentSpend([], ['--all-approved', '--footage-ok']);
});

// Draft runs never spend, approve, or publish.
withRun('draft', () => {
  assert.throws(() => refuseDuringAgentRun('Approving'));
  assert.throws(() => checkAgentSpend(['a'], []));
});

// Build runs spend only on their one concept, without widening flags.
withRun('build:a', () => {
  checkAgentSpend(['a'], ['--formats', 'portrait']);
  assert.throws(() => checkAgentSpend(['b'], []));
  assert.throws(() => checkAgentSpend(['a', 'b'], []));
  assert.throws(() => checkAgentSpend([], []));
  assert.throws(() => checkAgentSpend(['a_2'], []));
  for (const flag of ['--force', '--footage-ok', '--all', '--all-approved']) {
    assert.throws(() => checkAgentSpend(['a'], [flag]));
  }
  assert.throws(() => refuseDuringAgentRun('Publishing'));
});

console.log('agent-guard: ok');
