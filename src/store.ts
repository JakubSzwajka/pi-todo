import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
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
    dependsOnIds: Array.isArray(raw.dependsOnIds)
      ? [...new Set(raw.dependsOnIds.filter((id): id is string => typeof id === 'string'))]
      : [],
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
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(normalizeStore(store), null, 2), 'utf8');
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function findTask(store: Store, id: string): Task | undefined {
  return store.tasks.find(t => t.id === id || t.id.startsWith(id));
}

export function resolveTaskIds(store: Store, ids: string[] | undefined): Task[] {
  if (!ids?.length) return [];
  return ids.map(id => findTask(store, id)).filter((task): task is Task => task !== undefined);
}

export function validateDependsOnIds(store: Store, task: Task, dependsOnIds: string[] | undefined): string | null {
  const normalized = [...new Set((dependsOnIds ?? []).map(id => id.trim()).filter(Boolean))];
  if (normalized.includes(task.id)) return 'A task cannot depend on itself';

  for (const dependencyId of normalized) {
    const dependency = findTask(store, dependencyId);
    if (!dependency) return `Dependency task not found: ${dependencyId}`;
    if (dependency.id === task.id) return 'A task cannot depend on itself';
    if (dependency.parentId !== task.parentId) {
      return `Dependency #${dependency.id} must share the same parent as #${task.id}`;
    }
  }

  return null;
}

export function getUnresolvedDependencies(store: Store, task: Task): Task[] {
  return resolveTaskIds(store, task.dependsOnIds).filter(dependency => dependency.status !== 'done');
}

export function statusRequiresResolvedDependencies(status: Status): boolean {
  return ['in_progress', 'review', 'testing', 'done'].includes(status);
}
