import { readStore, writeStore, generateId, findTask } from './store.js';
import type { Status, Priority, Author, Task } from './types.js';

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

const STATUS_COLOR: Record<Status, string> = {
  open:        c.blue,
  in_progress: c.yellow,
  review:      c.cyan,
  done:        c.green,
  cancelled:   c.gray,
};

const STATUS_LABEL: Record<Status, string> = {
  open:        '○ open',
  in_progress: '◑ in_progress',
  review:      '◉ review',
  done:        '● done',
  cancelled:   '✕ cancelled',
};

const PRIORITY_LABEL: Record<number, string> = {
  1: `${c.gray}p1${c.reset}`,
  2: `${c.yellow}p2${c.reset}`,
  3: `${c.red}p3${c.reset}`,
};

function fmtStatus(s: Status) {
  return `${STATUS_COLOR[s]}${STATUS_LABEL[s]}${c.reset}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function fmtTask(t: Task, showLog = false) {
  const lines: string[] = [];
  lines.push(
    `${c.bold}${c.dim}#${t.id}${c.reset}  ${c.bold}${t.title}${c.reset}` +
    `  ${PRIORITY_LABEL[t.priority]}  ${fmtStatus(t.status)}` +
    `  ${c.gray}${fmtDate(t.createdAt)}${c.reset}`
  );
  if (showLog && t.log.length > 0) {
    for (const e of t.log) {
      const who = e.author === 'pi' ? `${c.cyan}pi${c.reset}` : `${c.green}kuba${c.reset}`;
      lines.push(`  ${c.gray}${fmtDate(e.at)}${c.reset} ${who}  ${e.text}`);
    }
  }
  return lines.join('\n');
}

// ─── Commands ────────────────────────────────────────────────────────────────

export function cmdAdd(title: string, opts: { note?: string; priority?: number }) {
  const store = readStore();
  const now = new Date().toISOString();
  const priority = (opts.priority ?? 1) as Priority;
  const task: Task = {
    id: generateId(),
    title,
    priority,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    log: opts.note ? [{ at: now, author: 'kuba', text: opts.note }] : [],
  };
  store.tasks.push(task);
  writeStore(store);
  console.log(`${c.green}✓${c.reset} Added ${c.bold}#${task.id}${c.reset} — ${task.title}`);
  return task;
}

export function cmdList(opts: { status?: string; all?: boolean }) {
  const store = readStore();
  let tasks = store.tasks;

  if (!opts.all && !opts.status) {
    tasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  } else if (opts.status) {
    tasks = tasks.filter(t => t.status === opts.status);
  }

  if (tasks.length === 0) {
    console.log(`${c.gray}No tasks.${c.reset}`);
    return [];
  }

  for (const t of tasks) console.log(fmtTask(t));
  return tasks;
}

export function cmdShow(id: string) {
  const store = readStore();
  const task = findTask(store, id);
  if (!task) {
    console.error(`${c.red}Task not found: ${id}${c.reset}`);
    process.exit(1);
  }
  console.log(fmtTask(task, true));
  return task;
}

export function cmdStatus(id: string, status: string) {
  const valid: Status[] = ['open', 'in_progress', 'review', 'done', 'cancelled'];
  if (!valid.includes(status as Status)) {
    console.error(`${c.red}Invalid status. Use: ${valid.join(' | ')}${c.reset}`);
    process.exit(1);
  }
  const store = readStore();
  const task = findTask(store, id);
  if (!task) {
    console.error(`${c.red}Task not found: ${id}${c.reset}`);
    process.exit(1);
  }
  const prev = task.status;
  task.status = status as Status;
  task.updatedAt = new Date().toISOString();
  writeStore(store);
  console.log(`${c.green}✓${c.reset} #${task.id}  ${fmtStatus(prev)} → ${fmtStatus(status as Status)}`);
  return task;
}

export function cmdUpdate(id: string, opts: { title?: string; priority?: number }) {
  const store = readStore();
  const task = findTask(store, id);
  if (!task) {
    console.error(`${c.red}Task not found: ${id}${c.reset}`);
    process.exit(1);
  }
  if (opts.title) task.title = opts.title;
  if (opts.priority) task.priority = opts.priority as Priority;
  task.updatedAt = new Date().toISOString();
  writeStore(store);
  console.log(`${c.green}✓${c.reset} Updated #${task.id}`);
  return task;
}

export function cmdLog(id: string, text: string, author: Author = 'kuba') {
  const store = readStore();
  const task = findTask(store, id);
  if (!task) {
    console.error(`${c.red}Task not found: ${id}${c.reset}`);
    process.exit(1);
  }
  const entry = { at: new Date().toISOString(), author, text };
  task.log.push(entry);
  task.updatedAt = entry.at;
  writeStore(store);
  console.log(`${c.green}✓${c.reset} Note added to #${task.id}`);
  return task;
}

export function cmdDelete(id: string) {
  const store = readStore();
  const idx = store.tasks.findIndex(t => t.id === id || t.id.startsWith(id));
  if (idx === -1) {
    console.error(`${c.red}Task not found: ${id}${c.reset}`);
    process.exit(1);
  }
  const [removed] = store.tasks.splice(idx, 1);
  writeStore(store);
  console.log(`${c.green}✓${c.reset} Deleted #${removed.id} — ${removed.title}`);
  return removed;
}
