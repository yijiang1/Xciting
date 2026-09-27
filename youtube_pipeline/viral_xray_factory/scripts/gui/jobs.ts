// Runs one long-lived job (a pipeline script, or a headless agent run) at a
// time as a child process, buffering its stdout/stderr so the GUI can show a
// live log via SSE. Only one job runs at once -- concurrent runs could race on
// content/state.json and content/concepts/*.json.

import {EventEmitter} from 'node:events';
import {execa, type ResultPromise} from 'execa';

export type JobStatus = 'running' | 'done' | 'error' | 'stopped';

export type JobState = {
  id: number;
  script: string;
  args: string[];
  status: JobStatus;
  startedAt: string;
  endedAt?: string;
  log: string[];
};

// What to actually spawn. Defaults to `npx tsx scripts/<script>.ts <args>`.
// formatLine turns one raw output line into display text (undefined = hide it).
export type JobCommand = {
  file: string;
  args: string[];
  input?: string;
  // Full environment for the child; replaces process.env when set.
  env?: Record<string, string>;
  formatLine?: (line: string) => string | undefined;
};

class JobRunner extends EventEmitter {
  private current: JobState | null = null;
  private child: ResultPromise | null = null;
  private stopRequested = false;
  private nextId = 1;

  getState(): JobState | null {
    return this.current;
  }

  isRunning(): boolean {
    return this.current?.status === 'running';
  }

  start(script: string, args: string[] = [], command?: JobCommand): JobState {
    if (this.isRunning()) {
      throw new Error(`A job is already running: ${this.current!.script} ${this.current!.args.join(' ')}`);
    }

    const job: JobState = {
      id: this.nextId++,
      script,
      args,
      status: 'running',
      startedAt: new Date().toISOString(),
      log: [],
    };
    this.current = job;
    this.stopRequested = false;
    this.emit('start', job);

    const push = (text: string) => {
      for (const line of text.split('\n')) {
        job.log.push(line);
        this.emit('log', job.id, line);
      }
    };
    const pushRaw = (line: string) => {
      if (line.length === 0) return;
      const shown = command?.formatLine ? command.formatLine(line) : line;
      if (shown !== undefined) push(shown);
    };

    // detached = own process group, so stop() can kill grandchildren too
    // (npx -> tsx -> ffmpeg, or claude -> npm run pipeline -> Sora polling).
    const child = execa(command?.file ?? 'npx', command?.args ?? ['tsx', `scripts/${script}.ts`, ...args], {
      cwd: process.cwd(),
      reject: false,
      all: true,
      detached: true,
      input: command?.input,
      env: command?.env,
      extendEnv: !command?.env,
    });
    this.child = child;

    // Chunks can split a line (fatal for JSON-per-line output), so hold the
    // unfinished tail until the next chunk or the end.
    let pending = '';
    child.all?.on('data', (chunk: Buffer | string) => {
      const lines = (pending + chunk.toString()).split('\n');
      pending = lines.pop() ?? '';
      lines.forEach(pushRaw);
    });

    const finish = (status: JobStatus) => {
      pushRaw(pending);
      pending = '';
      job.status = this.stopRequested ? 'stopped' : status;
      job.endedAt = new Date().toISOString();
      this.child = null;
      this.emit('end', job);
    };

    child
      .then((result) => finish(result.exitCode === 0 ? 'done' : 'error'))
      .catch((error) => {
        push(`[gui] job failed to start: ${error instanceof Error ? error.message : String(error)}`);
        finish('error');
      });

    return job;
  }

  stop(): boolean {
    if (!this.isRunning() || !this.child?.pid) return false;
    this.stopRequested = true;
    this.current!.log.push('[gui] stop requested');
    this.emit('log', this.current!.id, '[gui] stop requested');
    try {
      process.kill(-this.child.pid, 'SIGTERM');
    } catch {
      this.child.kill('SIGTERM');
    }
    return true;
  }
}

export const jobRunner = new JobRunner();

// Jobs run in their own process group, so Ctrl-C on the panel no longer
// reaches them; stop the current one on the way out instead of orphaning it.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    jobRunner.stop();
    process.exit(130);
  });
}
