import { execFile as execFileCb } from 'node:child_process';
import { homedir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
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

/** Resolve a path to be relative to the vault root. */
export function vaultRelativePath(absoluteOrRelative: string): string {
  if (isAbsolute(absoluteOrRelative)) {
    return relative(VAULT_PATH, absoluteOrRelative);
  }
  return absoluteOrRelative;
}

async function run(args: string[], timeout = DEFAULT_TIMEOUT): Promise<string> {
  await acquireSlot();
  try {
    const { stdout } = await execFile(OBSIDIAN_BIN, args, { timeout });
    // Obsidian CLI returns exit code 0 even on errors — detect error responses
    if (stdout.startsWith('Error: ')) {
      throw new Error(stdout.trim());
    }
    return stdout;
  } finally {
    releaseSlot();
  }
}

/** Throw if Obsidian is not running or CLI is unavailable. */
export async function ensureObsidian(): Promise<void> {
  try {
    await run(['version'], 2_000);
  } catch {
    throw new Error('Obsidian is not running. Please open Obsidian and try again.');
  }
}

/** Search the vault. Returns an array of matching file paths. */
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

/** Read a file's markdown content. */
export async function obsidianRead(pathOrFile: string): Promise<string> {
  return run(['read', `path=${pathOrFile}`]);
}

/** Create a new file in the vault. */
export async function obsidianCreate(
  name: string,
  path: string,
  content: string,
): Promise<void> {
  await run(['create', `name=${name}`, `path=${path}`, `content=${content}`]);
}

/** Append content to a file. */
export async function obsidianAppend(pathOrFile: string, content: string): Promise<void> {
  await run(['append', `path=${pathOrFile}`, `content=${content}`]);
}

/** Permanently delete a file. */
export async function obsidianDelete(pathOrFile: string): Promise<void> {
  await run(['delete', `path=${pathOrFile}`, 'permanent']);
}

/** Set a property on a file. */
export async function obsidianPropertySet(
  pathOrFile: string,
  name: string,
  value: string | string[] | boolean | number,
  type?: string,
): Promise<void> {
  const serialized = Array.isArray(value) ? JSON.stringify(value) : String(value);
  const args = ['property:set', `path=${pathOrFile}`, `name=${name}`, `value=${serialized}`];
  if (type) args.push(`type=${type}`);
  await run(args);
}

/** Read a single property value from a file. */
export async function obsidianPropertyRead(
  pathOrFile: string,
  name: string,
): Promise<string> {
  const out = await run(['property:read', `path=${pathOrFile}`, `name=${name}`]);
  return out.trim();
}

/** List backlinks to a file. Returns an array of linking file paths. */
export async function obsidianBacklinks(file: string): Promise<string[]> {
  const out = (await run(['backlinks', `file=${file}`, 'format=json'])).trim();
  if (!out || out === 'No backlinks found.') return [];
  return JSON.parse(out) as string[];
}

/** Read all frontmatter properties of a file as a JSON object. */
export async function obsidianProperties(
  pathOrFile: string,
): Promise<Record<string, unknown>> {
  const out = (await run(['properties', `path=${pathOrFile}`, 'format=json'])).trim();
  if (!out || out === 'No frontmatter found.') return {};
  return JSON.parse(out) as Record<string, unknown>;
}
