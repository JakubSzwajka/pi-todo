import { execFile as execFileCb } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const OBSIDIAN_BIN = '/usr/local/bin/obsidian';
const DEFAULT_TIMEOUT = 5_000;
const MAX_CONCURRENT = 10;

let activeCount = 0;
const waiting: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiting.push(resolve));
}

function releaseSlot(): void {
  const next = waiting.shift();
  if (next) {
    next();
  } else {
    activeCount--;
  }
}

export const VAULT_PATH = process.env.PI_TODO_VAULT ?? join(homedir(), 'knowledge');
export const TASKS_PATH = 'tasks';
export const PROJECTS_PATH = 'tasks/projects';

async function run(args: string[], timeout = DEFAULT_TIMEOUT): Promise<string> {
  await acquireSlot();
  try {
    const { stdout } = await execFile(OBSIDIAN_BIN, args, { timeout });
    if (stdout.startsWith('Error: ')) {
      throw new Error(stdout.trim());
    }
    return stdout;
  } finally {
    releaseSlot();
  }
}

export async function ensureObsidian(): Promise<void> {
  try {
    await run(['version'], 2_000);
  } catch {
    throw new Error('Obsidian is not running. Please open Obsidian and try again.');
  }
}

export async function obsidianSearch(
  query: string,
  opts?: { path?: string },
): Promise<string[]> {
  const args = ['search', `query=${query}`, 'format=json'];
  if (opts?.path) args.push(`path=${opts.path}`);
  const out = (await run(args)).trim();
  if (!out || out === 'No matches found.') return [];
  return JSON.parse(out) as string[];
}

export async function obsidianRead(pathOrFile: string): Promise<string> {
  return run(['read', `path=${pathOrFile}`]);
}

export async function obsidianCreate(
  name: string,
  path: string,
  content: string,
): Promise<void> {
  await run(['create', `name=${name}`, `path=${path}`, `content=${content}`]);
}

export async function obsidianDelete(pathOrFile: string): Promise<void> {
  await run(['delete', `path=${pathOrFile}`, 'permanent']);
}

export async function obsidianProperties(
  pathOrFile: string,
): Promise<Record<string, unknown>> {
  const out = (await run(['properties', `path=${pathOrFile}`, 'format=json'])).trim();
  if (!out || out === 'No frontmatter found.') return {};
  return JSON.parse(out) as Record<string, unknown>;
}
