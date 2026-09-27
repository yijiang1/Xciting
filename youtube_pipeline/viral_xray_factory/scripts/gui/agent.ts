// Headless agent runs for the control panel, on Claude Code or Codex: a
// skill's playbook from <repo>/.claude/skills/<name>/SKILL.md plus a task.
//   draft -- write + science-check a concept, footage --dry-run. Free.
//   build -- pipeline + QA + targeted fixes for ONE approved concept. Spends.
//
// Limits, strongest first:
//   1. XCITING_AGENT_RUN env -> scripts/lib/agent-guard.ts: the paid and
//      irreversible scripts refuse to approve, publish, or spend outside the
//      run's one concept. Holds for both CLIs.
//   2. Claude only: a per-task tool allowlist (--permission-mode dontAsk
//      denies everything else). Codex has no per-command allowlist; drafts run
//      in its workspace sandbox, builds unsandboxed because Remotion's
//      headless Chrome can't start inside Codex's macOS sandbox.

import {existsSync} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {projectRoot} from '../lib/content';
import {onPath} from '../lib/ffmpeg';
import type {JobCommand} from './jobs';

export const skillsDir = path.resolve(projectRoot, '../../.claude/skills');

export type Skill = {name: string; description: string; body: string};

export const listSkills = async (): Promise<Skill[]> => {
  const entries = await fs.readdir(skillsDir, {withFileTypes: true}).catch(() => []);
  const skills: Skill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const text = await fs.readFile(path.join(skillsDir, entry.name, 'SKILL.md'), 'utf8').catch(() => '');
    const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) continue;
    const field = (key: string) => match[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim() ?? '';
    skills.push({name: field('name') || entry.name, description: field('description'), body: match[2].trim()});
  }
  return skills;
};

export type AgentEngine = 'claude' | 'codex';
export type AgentTask = 'draft' | 'build';
export type AgentRun = {engine: AgentEngine; skill: Skill; task: AgentTask; topic?: string; id?: string; notes?: string};

// The Codex desktop app bundles its CLI; use it when `codex` isn't on PATH.
const CODEX_APP_BIN = '/Applications/ChatGPT.app/Contents/Resources/codex';

export const engineBin = (engine: AgentEngine): string | undefined => {
  if (engine === 'claude') return onPath('claude') ? 'claude' : undefined;
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  if (onPath('codex')) return 'codex';
  return existsSync(CODEX_APP_BIN) ? CODEX_APP_BIN : undefined;
};

// --- prompt -------------------------------------------------------------------

const RUN_RULES = `# Control-panel run rules

You were started headless from the Xciting control panel. Nobody can answer questions until you finish.
- Your working directory is youtube_pipeline/viral_xray_factory. Run npm commands directly, without cd.
- Commands outside this run's scope are refused (by the CLI or by the scripts themselves). Don't work around a refusal; report it.
- Never edit a concept's "status", never approve, never publish. Those are the user's calls in the panel.
- The pipeline and footage steps can take many minutes: give those commands a long timeout (up to an hour) instead of retrying them.
- The user previews audio and renders in the panel, so don't try to send files.
- Wherever the skill says to show the user something, put it in your final summary instead.
- Finish with a summary: what you did; every script line you changed (before → after); QA findings; open questions for the user; lessons worth adding to the skill.`;

const playbook = (run: AgentRun) => `# Skill: ${run.skill.name}\n\n${run.skill.body}\n\n${RUN_RULES}`;

const taskPrompt = ({task, topic, id, notes}: AgentRun): string => {
  const lines =
    task === 'draft'
      ? [
          topic ? `Create a new video concept about: ${topic}` : "Run `npm run daily` to pick today's topic and write the draft concept.",
          'Then science-check it and fix the concept JSON, and run the footage --dry-run so the user sees the prompts and the cost.',
          "Stop there: approving is the user's call.",
        ]
      : [`Build concept ${id}: run the pipeline, QA the renders, fix only what broke, and re-verify.`, 'Stop before publishing.'];
  if (notes) lines.push('', `Notes from the user: ${notes}`);
  return lines.join('\n');
};

// The server loaded .env.local into process.env; agents don't need those keys
// (every script loads its own), and the CLIs themselves can pick up
// OPENAI_API_KEY / ANTHROPIC_API_KEY and switch how they authenticate.
const agentEnv = (run: AgentRun, extra: Record<string, string> = {}): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !/(API_KEY|SECRET|TOKEN)/.test(key)) env[key] = value;
  }
  return {...env, XCITING_AGENT_RUN: run.task === 'build' ? `build:${run.id}` : 'draft', ...extra};
};

export const agentCommand = (run: AgentRun): JobCommand => {
  const file = engineBin(run.engine);
  if (!file) throw new Error(`${run.engine} CLI not found. Install it, or set CODEX_BIN for Codex.`);
  return run.engine === 'codex' ? codexCommand(run, file) : claudeCommand(run, file);
};

// --- Claude Code ----------------------------------------------------------------

const READ_ONLY = ['Read', 'Glob', 'Grep', 'WebSearch', 'Bash(ls *)', 'Bash(head *)', 'Bash(tail *)', 'Bash(grep *)', 'Bash(wc *)'];

const DRAFT_TOOLS = [
  ...READ_ONLY,
  'Edit(content/concepts/**)',
  'Bash(npm run concepts *)',
  'Bash(npm run song *)',
  'Bash(npm run daily)',
  'Bash(npm run sync)',
  'Bash(npm run status)',
  'Bash(npm run generate:visuals *--dry-run*)',
  'Bash(npm run generate:audio *--dry-run*)',
];

// Every paid command is pinned to the one concept the user picked.
const buildTools = (id: string) => [
  ...DRAFT_TOOLS,
  ...['pipeline', 'generate:audio', 'generate:music', 'generate:visuals', 'metadata', 'render', 'render:one', 'verify', 'bundle', 'thumbnails'].flatMap(
    (cmd) => [`Bash(npm run ${cmd} -- ${id})`, `Bash(npm run ${cmd} -- ${id} *)`],
  ),
  'Bash(npm run subtitles)',
  'Bash(ffmpeg *)',
  `Bash(rm public/footage/${id}/*)`,
  'Edit(public/data/timings.json)',
];

// Deny beats allow, including anything in the user's global settings.
const DENIED = [
  'Bash(npm run approve*)',
  'Bash(npm run publish*)',
  'Bash(npm run upload*)',
  'Bash(npm run youtube-auth*)',
  'Bash(*--footage-ok*)',
  'Bash(*--all*)',
  'Bash(npm run pipeline *--force*)',
  'Bash(npm run generate:visuals *--force*)',
  'Bash(npx *)',
  'Bash(node *)',
  'Bash(git *)',
  'Bash(*.env*)',
  'Read(**/.env*)',
  'Edit(**/.env*)',
];

// Bash calls can run a whole pipeline (Sora footage takes many minutes), so
// lift the 2-minute default; the panel's Stop button covers real hangs.
const BASH_TIMEOUT_MS = String(60 * 60 * 1000);

const claudeCommand = (run: AgentRun, file: string): JobCommand => ({
  file,
  args: [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'dontAsk',
    '--append-system-prompt',
    playbook(run),
    '--allowedTools',
    ...(run.task === 'build' ? buildTools(run.id!) : DRAFT_TOOLS),
    '--disallowedTools',
    ...DENIED,
  ],
  input: taskPrompt(run), // via stdin, so the variadic tool lists can't swallow it
  env: agentEnv(run, {BASH_DEFAULT_TIMEOUT_MS: BASH_TIMEOUT_MS, BASH_MAX_TIMEOUT_MS: BASH_TIMEOUT_MS}),
  formatLine: formatClaudeLine,
});

// --- Codex ----------------------------------------------------------------------

const codexCommand = (run: AgentRun, file: string): JobCommand => ({
  file,
  args: [
    'exec',
    '--json',
    '-C',
    projectRoot,
    '-c',
    'approval_policy="never"',
    ...(run.task === 'build'
      ? ['-s', 'danger-full-access']
      : ['-s', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true']),
  ],
  input: `${playbook(run)}\n\n# Task\n\n${taskPrompt(run)}`, // no prompt arg = read from stdin
  env: agentEnv(run),
  formatLine: codexFormatter(),
});

// --- event stream -> readable log -------------------------------------------------

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

const outputLines = (text: string, failed: boolean): string | undefined => {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return failed ? '  ✗ failed' : undefined;
  const shown = lines.slice(0, 4).map((line) => `    ${clip(line, 200)}`);
  if (lines.length > 4) shown.push(`    … ${lines.length - 4} more lines`);
  return `  ${failed ? '✗' : '↳'}\n${shown.join('\n')}`;
};

const parse = (line: string): any => {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

export const formatClaudeLine = (line: string): string | undefined => {
  const event = parse(line);
  if (!event) return line; // stderr or anything else that isn't an event

  if (event.type === 'system' && event.subtype === 'init') return `[agent] claude session ${event.session_id} · ${event.model ?? ''}`;
  if (event.type === 'assistant') {
    const out = (event.message?.content ?? []).map((block: any) => {
      if (block.type === 'text') return block.text;
      if (block.type !== 'tool_use') return undefined;
      const input = block.input ?? {};
      const main = input.command ?? input.file_path ?? input.pattern ?? input.query ?? input.url;
      return `▸ ${block.name}${main ? `: ${clip(String(main), 300)}` : ''}`;
    });
    return out.filter(Boolean).join('\n') || undefined;
  }
  if (event.type === 'user') {
    const out = (event.message?.content ?? [])
      .filter((block: any) => block.type === 'tool_result')
      .map((block: any) => {
        const text =
          typeof block.content === 'string'
            ? block.content
            : (block.content ?? []).map((part: any) => (part.type === 'text' ? part.text : `[${part.type}]`)).join('\n');
        return outputLines(text, Boolean(block.is_error));
      });
    return out.filter(Boolean).join('\n') || undefined;
  }
  if (event.type === 'result') {
    const minutes = ((event.duration_ms ?? 0) / 60000).toFixed(1);
    const cost = event.total_cost_usd === undefined ? '' : `, $${Number(event.total_cost_usd).toFixed(2)}`;
    // An API/auth failure still reports subtype "success"; is_error is the real signal.
    const status = event.is_error ? `error (${event.terminal_reason ?? event.subtype})` : event.subtype;
    const login = /authenticat/i.test(String(event.result ?? '')) ? ['Log the CLI in: run `claude` in a terminal, then /login.'] : [];
    return [
      `── agent ${status} · ${minutes} min, ${event.num_turns ?? '?'} turns${cost} ──`,
      ...login,
      ...(event.permission_denials ?? []).map((d: any) => `  denied: ${d.tool_name} ${clip(JSON.stringify(d.tool_input ?? {}), 200)}`),
      `Continue in a terminal: cd ${projectRoot} && claude --resume ${event.session_id}`,
    ].join('\n');
  }
  return undefined;
};

// Codex wraps each command as `/bin/zsh -lc '<command>'` (or "..."); show just the command.
const unwrapShell = (command: string) => command.match(/^\S+ -lc (['"])([\s\S]*)\1$/)?.[2] ?? command;

const codexFormatter = () => {
  let threadId = '';
  const startedAt = Date.now();
  return (line: string): string | undefined => {
    const event = parse(line);
    if (!event) return line;

    const item = event.item ?? {};
    switch (event.type) {
      case 'thread.started':
        threadId = event.thread_id;
        return `[agent] codex thread ${threadId}`;
      case 'item.started':
        return item.type === 'command_execution' ? `▸ ${clip(unwrapShell(item.command ?? ''), 300)}` : undefined;
      case 'item.completed':
        if (item.type === 'agent_message') return item.text;
        if (item.type === 'command_execution') return outputLines(item.aggregated_output ?? '', item.exit_code !== 0);
        if (item.type === 'file_change') return (item.changes ?? []).map((c: any) => `▸ ${c.kind} ${c.path}`).join('\n') || undefined;
        if (item.type === 'web_search') return `▸ web search: ${item.query ?? ''}`;
        if (item.type === 'error') return `✗ ${item.message}`;
        return undefined; // reasoning, todo lists
      case 'turn.completed': {
        const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
        const usage = event.usage ?? {};
        return [
          `── agent done · ${minutes} min, ${usage.input_tokens ?? '?'} tokens in / ${usage.output_tokens ?? '?'} out ──`,
          `Continue in a terminal: cd ${projectRoot} && codex resume ${threadId}`,
        ].join('\n');
      }
      case 'turn.failed':
        return `── agent failed: ${event.error?.message ?? 'unknown error'} ──`;
      case 'error':
        return `✗ ${event.message}`;
      default:
        return undefined;
    }
  };
};
