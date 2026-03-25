import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Store, Task } from './types.js';

export const STORE_PATH = join(homedir(), '.pi', '.pi-todo.json');

export function readStore(): Store {
  if (!existsSync(STORE_PATH)) return { tasks: [] };
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return { tasks: [] };
  }
}

export function writeStore(store: Store): void {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function findTask(store: Store, id: string): Task | undefined {
  return store.tasks.find(t => t.id === id || t.id.startsWith(id));
}
