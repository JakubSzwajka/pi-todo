import {
  addProject,
  addTask,
  appendLog,
  deleteProject,
  deleteTask,
  findProject,
  findTask,
  listProjects,
  listTasks,
  updateProject,
  updateTask,
} from './store.js';
import type { Author, Status, Task } from './types.js';

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
  done:        c.green,
  cancelled:   c.gray,
};

const STATUS_LABEL: Record<Status, string> = {
  open:        '○ open',
  in_progress: '◑ in_progress',
  done:        '● done',
  cancelled:   '✕ cancelled',
};

function fmtStatus(s: Status) {
  const color = STATUS_COLOR[s] ?? c.gray;
  const label = STATUS_LABEL[s] ?? `? ${s}`;
  return `${color}${label}${c.reset}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function fmtTags(tags: string[]) {
  if (!tags.length) return '';
  return tags.map(tag => `${c.cyan}#${tag}${c.reset}`).join(' ');
}

function fail(message: string): never {
  console.error(`${c.red}${message}${c.reset}`);
  process.exit(1);
}

async function mustTask(id: string): Promise<Task> {
  const task = await findTask(id);
  if (!task) fail(`Task not found: ${id}`);
  return task;
}

async function mustProject(id: string) {
  const project = await findProject(id);
  if (!project) fail(`Project not found: ${id}`);
  return project;
}

// ---------------------------------------------------------------------------
// Task one-line format
// ---------------------------------------------------------------------------

function fmtTaskLine(t: Task) {
  const projectChip = t.projectId ? `  ${c.magenta}@${t.projectId}${c.reset}` : '';
  const tagsChip = fmtTags(t.tags);
  return (
    `${c.bold}${c.dim}#${t.id}${c.reset}  ${c.bold}${t.title}${c.reset}` +
    `  ${fmtStatus(t.status)}` +
    projectChip +
    (tagsChip ? `  ${tagsChip}` : '') +
    `  ${c.gray}${fmtDate(t.createdAt)}${c.reset}`
  );
}

// ---------------------------------------------------------------------------
// Task detail format
// ---------------------------------------------------------------------------

async function fmtTaskDetail(t: Task, allTasks: Task[]) {
  const lines: string[] = [];
  const parent = t.parentId ? allTasks.find(p => p.id === t.parentId) : undefined;

  lines.push(fmtTaskLine(t));

  if (parent) lines.push(`  ${c.gray}↳ parent: #${parent.id} ${parent.title}${c.reset}`);

  if (t.description) {
    lines.push('');
    for (const line of t.description.split('\n')) lines.push(`  ${c.dim}${line}${c.reset}`);
  }

  if (t.log.length > 0) {
    lines.push('');
    for (const e of t.log) {
      const who = e.author === 'pi' ? `${c.cyan}${e.author}${c.reset}` : `${c.green}${e.author}${c.reset}`;
      lines.push(`  ${c.gray}${fmtDate(e.at)}${c.reset} ${who}  ${e.text}`);
    }
  }

  const children = allTasks.filter(child => child.parentId === t.id);
  if (children.length > 0) {
    lines.push('');
    lines.push(`  ${c.dim}Subtasks:${c.reset}`);
    for (const child of children) {
      lines.push(`    ${c.dim}#${child.id}${c.reset}  ${child.title}  ${fmtStatus(child.status)}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tree display
// ---------------------------------------------------------------------------

function renderTree(tasks: Task[], parentId: string | undefined, indent: string): string[] {
  const children = tasks.filter(t => (t.parentId ?? '') === (parentId ?? ''));
  const lines: string[] = [];
  for (const t of children) {
    lines.push(`${indent}${fmtTaskLine(t)}`);
    lines.push(...renderTree(tasks, t.id, indent + '  '));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export async function cmdAdd(title: string, opts: {
  description?: string;
  note?: string;
  parentId?: string;
  projectId?: string;
  tags?: string[];
}) {
  if (opts.parentId) {
    const parent = await findTask(opts.parentId);
    if (!parent) fail(`Parent task not found: ${opts.parentId}`);
  }
  if (opts.projectId) {
    const project = await findProject(opts.projectId);
    if (!project) fail(`Project not found: ${opts.projectId}`);
  }

  const task = await addTask({
    title,
    description: opts.description,
    parentId: opts.parentId,
    projectId: opts.projectId,
    tags: opts.tags,
    note: opts.note ? { text: opts.note, author: 'kuba' } : undefined,
  });

  console.log(`${c.green}✓${c.reset} Added ${c.bold}#${task.id}${c.reset} — ${task.title}`);
  return task;
}

export async function cmdList(opts: { status?: string; all?: boolean; projectId?: string; tag?: string; tree?: boolean }) {
  let projectFilter: string | undefined;
  if (opts.projectId) {
    const project = await mustProject(opts.projectId);
    projectFilter = project.id;
  }

  const tasks = await listTasks({
    status: opts.status as Status | undefined,
    project: projectFilter,
    tag: opts.tag,
    all: opts.all,
  });

  if (tasks.length === 0) {
    console.log(`${c.gray}No tasks.${c.reset}`);
    return [];
  }

  if (opts.tree) {
    const lines = renderTree(tasks, undefined, '');
    for (const line of lines) console.log(line);
  } else {
    for (const t of tasks) console.log(fmtTaskLine(t));
  }
  return tasks;
}

export async function cmdShow(id: string) {
  const task = await mustTask(id);
  const allTasks = await listTasks({ all: true });
  console.log(await fmtTaskDetail(task, allTasks));
  return task;
}

export async function cmdStatus(id: string, status: string) {
  const valid: Status[] = ['open', 'in_progress', 'done', 'cancelled'];
  if (!valid.includes(status as Status)) fail(`Invalid status. Use: ${valid.join(' | ')}`);
  const task = await mustTask(id);
  const nextStatus = status as Status;
  const prev = task.status;
  await updateTask(task.id, { status: nextStatus });
  console.log(`${c.green}✓${c.reset} #${task.id}  ${fmtStatus(prev)} → ${fmtStatus(nextStatus)}`);
  return task;
}

export async function cmdUpdate(id: string, opts: {
  title?: string;
  description?: string;
  parentId?: string;
  projectId?: string;
  tags?: string[];
}) {
  const task = await mustTask(id);

  await updateTask(task.id, {
    title: opts.title,
    description: opts.description,
    parentId: opts.parentId,
    projectId: opts.projectId,
    tags: opts.tags,
  });

  console.log(`${c.green}✓${c.reset} Updated #${task.id}`);
  return task;
}

export async function cmdLog(id: string, text: string, author: Author = 'kuba') {
  const task = await mustTask(id);
  const entry = { at: new Date().toISOString(), author, text };
  await appendLog(task.id, entry);
  console.log(`${c.green}✓${c.reset} Note added to #${task.id}`);
  return task;
}

export async function cmdDelete(id: string) {
  const task = await mustTask(id);
  await deleteTask(task.id);
  console.log(`${c.green}✓${c.reset} Deleted #${task.id} — ${task.title}`);
  return task;
}

export async function cmdProjectAdd(opts: { id?: string; name: string; description?: string }) {
  const project = await addProject(opts);
  console.log(`${c.green}✓${c.reset} Added project ${c.bold}${project.name}${c.reset} (${project.id})`);
  return project;
}

export async function cmdProjectList() {
  const projects = await listProjects();
  if (projects.length === 0) {
    console.log(`${c.gray}No projects.${c.reset}`);
    return [];
  }
  for (const project of projects) {
    const tasks = await listTasks({ project: project.id, all: true });
    const topLevel = tasks.filter(t => !t.parentId).length;
    console.log(`${c.bold}${project.name}${c.reset} ${c.gray}(${project.id})${c.reset}  ${c.magenta}${topLevel} tasks${c.reset}`);
  }
  return projects;
}

export async function cmdProjectShow(id: string) {
  const project = await mustProject(id);
  const tasks = await listTasks({ project: project.id, all: true });
  const lines = [
    `${c.bold}${project.name}${c.reset} ${c.gray}(${project.id})${c.reset}`,
    project.description ? `${c.dim}${project.description}${c.reset}` : '',
    '',
  ].filter(Boolean);

  if (tasks.length > 0) {
    lines.push(`${c.dim}Tasks:${c.reset}`);
    lines.push(...renderTree(tasks, undefined, '  '));
  } else {
    lines.push(`${c.gray}No tasks.${c.reset}`);
  }

  console.log(lines.join('\n'));
  return project;
}

export async function cmdProjectUpdate(id: string, opts: { name?: string; description?: string }) {
  const existing = await mustProject(id);
  const updated = await updateProject(existing.id, opts);
  console.log(`${c.green}✓${c.reset} Updated project ${c.bold}${updated.name}${c.reset} (${updated.id})`);
  return updated;
}

export async function cmdProjectDelete(id: string) {
  const project = await mustProject(id);
  try {
    await deleteProject(project.id);
  } catch (err: unknown) {
    fail((err as Error).message);
  }
  console.log(`${c.green}✓${c.reset} Deleted project ${project.id}`);
}
