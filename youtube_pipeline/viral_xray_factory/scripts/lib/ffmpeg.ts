// ffmpeg/ffprobe runners: use system binaries when installed, otherwise the
// ones Remotion ships inside its per-platform compositor package — so the
// pipeline works on machines without a brew/apt ffmpeg. The bundled binaries
// need their package directory on the dynamic-library path.

import {execa, execaSync, type Options} from 'execa';
import fs from 'node:fs';
import path from 'node:path';

const compositorPackages = [
  '@remotion/compositor-darwin-arm64',
  '@remotion/compositor-darwin-x64',
  '@remotion/compositor-linux-arm64-gnu',
  '@remotion/compositor-linux-arm64-musl',
  '@remotion/compositor-linux-x64-gnu',
  '@remotion/compositor-linux-x64-musl',
  '@remotion/compositor-win32-x64-msvc',
];

export const onPath = (binary: string): boolean => {
  try {
    execaSync(process.platform === 'win32' ? 'where' : 'which', [binary]);
    return true;
  } catch {
    return false;
  }
};

const bundled = (binary: string): string | undefined => {
  for (const pkg of compositorPackages) {
    const candidate = path.resolve(process.cwd(), 'node_modules', pkg, process.platform === 'win32' ? `${binary}.exe` : binary);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
};

type Runner = {file: string; env?: Record<string, string>};

const resolveRunner = (binary: 'ffmpeg' | 'ffprobe'): Runner => {
  if (onPath(binary)) return {file: binary};
  const fallback = bundled(binary);
  if (fallback) {
    const dir = path.dirname(fallback);
    const env: Record<string, string> = {};
    if (process.platform === 'darwin') env.DYLD_LIBRARY_PATH = dir;
    else if (process.platform !== 'win32') env.LD_LIBRARY_PATH = dir;
    return {file: fallback, env};
  }
  throw new Error(`${binary} not found on PATH and no bundled Remotion compositor binary is installed. Run npm install or install ffmpeg.`);
};

const runners: Partial<Record<'ffmpeg' | 'ffprobe', Runner>> = {};

const run = async (binary: 'ffmpeg' | 'ffprobe', args: string[], options?: Options): Promise<{stdout: string}> => {
  const runner = (runners[binary] ??= resolveRunner(binary));
  const result = await execa(runner.file, args, {...options, env: {...runner.env, ...options?.env}});
  return {stdout: typeof result.stdout === 'string' ? result.stdout : String(result.stdout ?? '')};
};

export const ffmpeg = (args: string[], options?: Options) => run('ffmpeg', args, options);
export const ffprobe = (args: string[], options?: Options) => run('ffprobe', args, options);
