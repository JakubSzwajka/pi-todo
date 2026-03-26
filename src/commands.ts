import {
  readStore,
  writeStore,
  generateId,
  findTask,
  validateDependsOnIds,
  getUnresolvedDependencies,
  statusRequiresResolvedDependencies,
} from './store.js';
import type { Status, Author, Task } from './types.js';

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  gray:    '\x1b[90m',
};

const STATUS_COLOR: Record<Status, string> = {
  open:        c.blue,
  in_progress: c.yellow,
  review:      c.cyan,
  testing:     c.magenta,
  waiting:     c.red,
  done:        c.green,
  cancelled:   c.gray,
};

const STATUS_LABEL: Record<Status, string> = {
  open:        '○ open',
  in_progress: '◑ in_progress',
  review:      '◉ review',
  testing:     '⬡ testing',
  waiting:     '◌ waiting',
  done:        '● done',
  cancelled:   '✕ cancelled',
};

function fmtStatus(s: Status) {
  return `${STATUS_COLOR[s]}${STATUS_LABEL[s]}${c.reset}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function fmtTags(tags: string[]) {
  if (!tags.length) return '';
  return tags.map(t => `${c.magenta}#${t}${c.reset}`).join(' ');
}

function fmtTask(t: Task, showFull = false, allTasks: Task[] = []) {
  const lines: string[] = [];

  // ── header line ──────────────────────────────────────────────────────────
  const parent = t.parentId ? allTasks.find(p => p.id === t.parentId) : undefined;
  const dependencies = allTasks.filter(candidate => (t.dependsOnIds ?? []).includes(candidate.id));
  const blockedBy = allTasks.filter(candidate => (candidate.dependsOnIds ?? []).includes(t.id));
  const unresolved = dependencies.filter(candidate => candidate.status !== 'done');
  const parentHint = parent ? `${c.gray}↳ #${parent.id} ${parent.title}${c.reset}  ` : '';
  const tags = fmtTags(t.tags);
  lines.push(
    `${c.bold}${c.dim}#${t.id}${c.reset}  ${c.bold}${t.title}${c.reset}` +
    `  ${fmtStatus(t.status)}` +
    (tags ? `  ${tags}` : '') +
    `  ${c.gray}${fmtDate(t.createdAt)}${c.reset}`
  );

  if (showFull) {
    // ── parent ref ───────────────────────────────────────────────────────
    if (parentHint) lines.push(`  ${parentHint}`);

    // ── dependency refs ─────────────────────────────────────────────────
    if (dependencies.length > 0) {
      lines.push('');
      lines.push(`  ${c.dim}Depends on:${c.reset}`);
      for (const dependency of dependencies) {
        const unresolvedMark = dependency.status === 'done' ? `${c.green}✓${c.reset}` : `${c.yellow}!${c.reset}`;
        lines.push(`    ${unresolvedMark} ${c.dim}#${dependency.id}${c.reset}  ${dependency.title}  ${fmtStatus(dependency.status)}`);
      }
      if (unresolved.length > 0) {
        lines.push(`  ${c.yellow}Blocked by ${unresolved.map(task => `#${task.id}`).join(', ')}${c.reset}`);
      }
    }

    if (blockedBy.length > 0) {
      lines.push('');
      lines.push(`  ${c.dim}Blocking:${c.reset}`);
      for (const dependent of blockedBy) {
        lines.push(`    ${c.dim}#${dependent.id}${c.reset}  ${dependent.title}  ${fmtStatus(dependent.status)}`);
      }
    }

    // ── description ──────────────────────────────────────────────────────
    if (t.description) {
      lines.push('');
      for (const line of t.description.split('\n')) {
        lines.push(`  ${c.dim}${line}${c.reset}`);
      }
    }

    // ── log ──────────────────────────────────────────────────────────────
    if (t.log.length > 0) {
      lines.push('');
      for (const e of t.log) {
        const who = e.author === 'pi' ? `${c.cyan}pi${c.reset}` : `${c.green}kuba${c.reset}`;
        lines.push(`  ${c.gray}${fmtDate(e.at)}${c.reset} ${who}  ${e.text}`);
      }
    }

    // ── subtasks ─────────────────────────────────────────────────────────
    const children = allTasks.filter(c => c.parentId === t.id);
    if (children.length > 0) {
      lines.push('');
      lines.push(`  ${c.dim}Subtasks:${c.reset}`);
      for (const child of children) {
        lines.push(`    ${c.dim}#${child.id}${c.reset}  ${child.title}  ${fmtStatus(child.status)}`);
      }
    }
  }

  return lines.join('\n');
}

// ─── Commands ────────────────────────────────────────────────────────────────

export function cmdAdd(title: string, opts: {
  description?: string;
  note?: string;
  parentId?: string;
  dependsOnIds?: string[];
  tags?: string[];
}) {
  const store = readStore();
  const now = new Date().toISOString();
  const task: Task = {
    id: generateId(),
    title,
    description: opts.description,
    parentId: opts.parentId,
    dependsOnIds: [...new Set(opts.dependsOnIds ?? [])],
    tags: opts.tags ?? [],
    status: 'open',
    createdAt: now,
    updatedAt: now,
    log: opts.note ? [{ at: now, author: 'kuba', text: opts.note }] : [],
  };
  const dependencyError = validateDependsOnIds(store, task, task.dependsOnIds);
  if (dependencyError) {
    console.error(`${c.red}${dependencyError}${c.reset}`);
    process.exit(1);
  }
  store.tasks.push(task);
  writeStore(store);
  console.log(`${c.green}✓${c.reset} Added ${c.bold}#${task.id}${c.reset} — ${task.title}`);
  return task;
}

export function cmdList(opts: { status?: string; all?: boolean; tag?: string }) {
  const store = readStore();
  let tasks = store.tasks;

  if (!opts.all && !opts.status) {
    tasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  } else if (opts.status) {
    tasks = tasks.filter(t => t.status === opts.status);
  }

  if (opts.tag) {
    tasks = tasks.filter(t => t.tags.includes(opts.tag!));
  }

  if (tasks.length === 0) {
    console.log(`${c.gray}No tasks.${c.reset}`);
    return [];
  }

  for (const t of tasks) console.log(fmtTask(t, false, store.tasks));
  return tasks;
}

export function cmdShow(id: string) {
  const store = readStore();
  const task = findTask(store, id);
  if (!task) {
    console.error(`${c.red}Task not found: ${id}${c.reset}`);
    process.exit(1);
  }
  console.log(fmtTask(task, true, store.tasks));
  return task;
}

export function cmdStatus(id: string, status: string) {
  const valid: Status[] = ['open', 'in_progress', 'review', 'testing', 'waiting', 'done', 'cancelled'];
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
  const nextStatus = status as Status;
  const unresolved = statusRequiresResolvedDependencies(nextStatus) ? getUnresolvedDependencies(store, task) : [];
  if (unresolved.length > 0) {
    console.error(`${c.red}Cannot move #${task.id} to ${nextStatus}; unresolved dependencies: ${unresolved.map(t => `#${t.id}`).join(', ')}${c.reset}`);
    process.exit(1);
  }
  const prev = task.status;
  task.status = nextStatus;
  task.updatedAt = new Date().toISOString();
  writeStore(store);
  console.log(`${c.green}✓${c.reset} #${task.id}  ${fmtStatus(prev)} → ${fmtStatus(nextStatus)}`);
  return task;
}

export function cmdUpdate(id: string, opts: {
  title?: string;
  description?: string;
  parentId?: string;
  dependsOnIds?: string[];
  tags?: string[];
}) {
  const store = readStore();
  const task = findTask(store, id);
  if (!task) {
    console.error(`${c.red}Task not found: ${id}${c.reset}`);
    process.exit(1);
  }
  const nextTask: Task = {
    ...task,
    title: opts.title ?? task.title,
    description: opts.description ?? task.description,
    parentId: opts.parentId ?? task.parentId,
    dependsOnIds: opts.dependsOnIds ?? task.dependsOnIds ?? [],
    tags: opts.tags ?? task.tags,
  };
  const dependencyError = validateDependsOnIds(store, nextTask, nextTask.dependsOnIds);
  if (dependencyError) {
    console.error(`${c.red}${dependencyError}${c.reset}`);
    process.exit(1);
  }
  task.title = nextTask.title;
  task.description = nextTask.description;
  task.parentId = nextTask.parentId;
  task.dependsOnIds = nextTask.dependsOnIds;
  task.tags = nextTask.tags;
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
