import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Store, Task, LogEntry, Author, Status } from './types.js';

export const STORE_PATH = join(homedir(), '.pi', '.pi-todo.json');

function normalizeLogEntry(value: unknown): LogEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.at !== 'string') return null;
  if (raw.author !== 'kuba' && raw.author !== 'pi') return null;
  if (typeof raw.text !== 'string') return null;
  return {
    at: raw.at,
    author: raw.author as Author,
    text: raw.text,
  };
}

function normalizeStatus(value: unknown): Status {
  switch (value) {
    case 'open':
    case 'in_progress':
    case 'review':
    case 'testing':
    case 'waiting':
    case 'done':
    case 'cancelled':
      return value;
    default:
      return 'open';
  }
}

function normalizeTask(value: unknown): Task | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;

  return {
    id: raw.id,
    title: raw.title,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    parentId: typeof raw.parentId === 'string' ? raw.parentId : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    status: normalizeStatus(raw.status),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    log: Array.isArray(raw.log) ? raw.log.map(normalizeLogEntry).filter((entry): entry is LogEntry => entry !== null) : [],
  };
}

function normalizeStore(value: unknown): Store {
  if (!value || typeof value !== 'object') return { tasks: [] };
  const raw = value as Record<string, unknown>;
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map(normalizeTask).filter((task): task is Task => task !== null)
    : [];

  return { tasks };
}

export function readStore(): Store {
  if (!existsSync(STORE_PATH)) return { tasks: [] };
  try {
    return normalizeStore(JSON.parse(readFileSync(STORE_PATH, 'utf8')));
  } catch {
    return { tasks: [] };
  }
}

export function writeStore(store: Store): void {
  writeFileSync(STORE_PATH, JSON.stringify(normalizeStore(store), null, 2), 'utf8');
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function findTask(store: Store, id: string): Task | undefined {
  return store.tasks.find(t => t.id === id || t.id.startsWith(id));
}
