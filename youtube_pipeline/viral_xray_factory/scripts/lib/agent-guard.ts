// The control panel sets XCITING_AGENT_RUN on headless agent runs: "draft", or
// "build:<conceptId>". Paid and irreversible scripts check it here, so the
// limits hold whichever agent CLI is driving (Codex has no per-command
// allowlist) and however the command is phrased.
//
// Check: npx tsx scripts/lib/agent-guard.check.ts

export const refuseDuringAgentRun = (action: string): void => {
  const agentRun = process.env.XCITING_AGENT_RUN;
  if (agentRun) throw new Error(`${action} is the user's call; refused during an agent run (${agentRun}).`);
};

// Paid generation: only a build run, only its one concept, no cost-widening flags.
export const checkAgentSpend = (ids: string[], args: string[]): void => {
  const agentRun = process.env.XCITING_AGENT_RUN;
  if (!agentRun) return;
  const pinned = agentRun.startsWith('build:') ? agentRun.slice('build:'.length) : undefined;
  if (!pinned) throw new Error(`Paid generation is refused during a ${agentRun} agent run.`);
  if (ids.length !== 1 || ids[0] !== pinned) {
    throw new Error(`This agent run may only spend on ${pinned} (got: ${ids.join(', ') || 'every concept'}).`);
  }
  const flag = args.find((arg) => ['--force', '--footage-ok', '--all', '--all-approved'].includes(arg));
  if (flag) throw new Error(`${flag} is refused during an agent run.`);
};
