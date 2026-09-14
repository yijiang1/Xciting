// Runs one long-lived pipeline script (daily / pipeline / publish) at a time
// as a child process, buffering its stdout/stderr so the GUI can show a live
// log via SSE. Only one job runs at once -- concurrent runs could race on
// content/state.json and content/concepts/*.json.

import {EventEmitter} from 'node:events';
import {execa} from 'execa';

export type JobStatus = 'running' | 'done' | 'error';

export type JobState = {
  id: number;
  script: string;
  args: string[];
  status: JobStatus;
  startedAt: string;
  endedAt?: string;
  log: string[];
};

class JobRunner extends EventEmitter {
  private current: JobState | null = null;
  private nextId = 1;

  getState(): JobState | null {
    return this.current;
  }

  isRunning(): boolean {
    return this.current?.status === 'running';
  }

  start(script: string, args: string[] = []): JobState {
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
    this.emit('start', job);

    const child = execa('npx', ['tsx', `scripts/${script}.ts`, ...args], {
      cwd: process.cwd(),
      reject: false,
      all: true,
    });

    const append = (chunk: Buffer | string) => {
      const text = chunk.toString();
      for (const line of text.split('\n')) {
        if (line.length === 0) continue;
        job.log.push(line);
        this.emit('log', job.id, line);
      }
    };
    child.all?.on('data', append);

    child
      .then((result) => {
        job.status = result.exitCode === 0 ? 'done' : 'error';
        job.endedAt = new Date().toISOString();
        this.emit('end', job);
      })
      .catch((error) => {
        job.log.push(`[gui] job failed to start: ${error instanceof Error ? error.message : String(error)}`);
        job.status = 'error';
        job.endedAt = new Date().toISOString();
        this.emit('end', job);
      });

    return job;
  }
}

export const jobRunner = new JobRunner();
