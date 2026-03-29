import {
  readStore,
  writeStore,
  generateId,
  findTask,
  findProject,
  validateDependsOnIds,
  validateTaskProjectAssignment,
  validateProject,
  getUnresolvedDependencies,
  statusRequiresResolvedDependencies,
  getTaskProject,
  getTaskProjectId,
  normalizeProjectInput,
} from './store.js';
import type { Status, Author, Task, ProjectRepo } from './types.js';

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

function fmtProject(id?: string, name?: string) {
  if (!id) return '';
  return `${c.magenta}@${name ?? id}${c.reset}`;
}

function fmtRepo(repo: ProjectRepo) {
  const target = repo.path ?? repo.url ?? 'unknown';
  const kind = `${c.gray}${repo.kind}${c.reset}`;
  const primary = repo.primary ? ` ${c.yellow}[primary]${c.reset}` : '';
  return `  - ${c.bold}${repo.label}${c.reset} ${kind}${primary}  ${target}`;
}

function fmtTags(tags: string[]) {
  if (!tags.length) return '';
  return tags.map(tag => `${c.cyan}#${tag}${c.reset}`).join(' ');
}

function fmtTask(t: Task, showFull = false, allTasks: Task[] = []) {
  const store = readStore();
  const lines: string[] = [];
  const parent = t.parentId ? allTasks.find(p => p.id === t.parentId) : undefined;
  const dependencies = allTasks.filter(candidate => (t.dependsOnIds ?? []).includes(candidate.id));
  const blockedBy = allTasks.filter(candidate => (candidate.dependsOnIds ?? []).includes(t.id));
  const unresolved = dependencies.filter(candidate => candidate.status !== 'done');
  const project = getTaskProject(store, t);
  const projectChip = fmtProject(project?.id, project?.name);
  const tagsChip = fmtTags(t.tags);

  lines.push(
    `${c.bold}${c.dim}#${t.id}${c.reset}  ${c.bold}${t.title}${c.reset}` +
    `  ${fmtStatus(t.status)}` +
    (projectChip ? `  ${projectChip}` : '') +
    (tagsChip ? `  ${tagsChip}` : '') +
    `  ${c.gray}${fmtDate(t.createdAt)}${c.reset}`
  );

  if (!showFull) return lines.join('\n');

  if (parent) lines.push(`  ${c.gray}↳ #${parent.id} ${parent.title}${c.reset}`);
  if (project) {
    lines.push('');
    lines.push(`  ${c.dim}Project:${c.reset} ${project.name} ${c.gray}(${project.id})${c.reset}`);
    if (project.description) lines.push(`  ${c.dim}${project.description}${c.reset}`);
    if (project.repos.length > 0) {
      lines.push(`  ${c.dim}Repos:${c.reset}`);
      for (const repo of project.repos) lines.push(fmtRepo(repo));
    }
  }
  if (t.tags.length > 0) {
    lines.push('');
    lines.push(`  ${c.dim}Tags:${c.reset} ${fmtTags(t.tags)}`);
  }

  if (dependencies.length > 0) {
    lines.push('');
    lines.push(`  ${c.dim}Depends on:${c.reset}`);
    for (const dependency of dependencies) {
      const unresolvedMark = dependency.status === 'done' ? `${c.green}✓${c.reset}` : `${c.yellow}!${c.reset}`;
      lines.push(`    ${unresolvedMark} ${c.dim}#${dependency.id}${c.reset}  ${dependency.title}  ${fmtStatus(dependency.status)}`);
    }
    if (unresolved.length > 0) lines.push(`  ${c.yellow}Blocked by ${unresolved.map(task => `#${task.id}`).join(', ')}${c.reset}`);
  }

  if (blockedBy.length > 0) {
    lines.push('');
    lines.push(`  ${c.dim}Blocking:${c.reset}`);
    for (const dependent of blockedBy) {
      lines.push(`    ${c.dim}#${dependent.id}${c.reset}  ${dependent.title}  ${fmtStatus(dependent.status)}`);
    }
  }

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
      const childProject = getTaskProject(store, child);
      lines.push(`    ${c.dim}#${child.id}${c.reset}  ${child.title}  ${fmtStatus(child.status)}${childProject ? `  ${fmtProject(childProject.id, childProject.name)}` : ''}`);
    }
  }

  return lines.join('\n');
}

function fail(message: string): never {
  console.error(`${c.red}${message}${c.reset}`);
  process.exit(1);
}

function mustTask(id: string) {
  const store = readStore();
  const task = findTask(store, id);
  if (!task) fail(`Task not found: ${id}`);
  return { store, task };
}

function mustProject(id: string) {
  const store = readStore();
  const project = findProject(store, id);
  if (!project) fail(`Project not found: ${id}`);
  return { store, project };
}

function fmtProjectBlock(projectId: string) {
  const { store, project } = mustProject(projectId);
  const tasks = store.tasks.filter(task => getTaskProjectId(store, task) === project.id && !task.parentId);
  const lines = [
    `${c.bold}${project.name}${c.reset} ${c.gray}(${project.id})${c.reset}`,
    project.description ? `${c.dim}${project.description}${c.reset}` : '',
    '',
    `${c.dim}Repos:${c.reset}`,
    ...(project.repos.length > 0 ? project.repos.map(fmtRepo) : ['  - none']),
    '',
    `${c.dim}Parent tasks:${c.reset}`,
    ...(tasks.length > 0 ? tasks.map(task => `  - #${task.id} ${task.title}  ${STATUS_LABEL[task.status]}`) : ['  - none']),
  ].filter(Boolean);

  return lines.join('\n');
}

export function cmdAdd(title: string, opts: {
  description?: string;
  note?: string;
  parentId?: string;
  dependsOnIds?: string[];
  projectId?: string;
  tags?: string[];
}) {
  const store = readStore();
  const now = new Date().toISOString();
  const task: Task = {
    id: generateId(),
    title,
    description: opts.description,
    parentId: opts.parentId,
    projectId: opts.parentId ? undefined : opts.projectId,
    tags: [...new Set(opts.tags ?? [])],
    dependsOnIds: [...new Set(opts.dependsOnIds ?? [])],
    status: 'open',
    createdAt: now,
    updatedAt: now,
    log: opts.note ? [{ at: now, author: 'kuba', text: opts.note }] : [],
  };

  const assignmentError = validateTaskProjectAssignment(store, task);
  if (assignmentError) fail(assignmentError);

  const dependencyError = validateDependsOnIds(store, task, task.dependsOnIds);
  if (dependencyError) fail(dependencyError);

  store.tasks.push(task);
  writeStore(store);
  console.log(`${c.green}✓${c.reset} Added ${c.bold}#${task.id}${c.reset} — ${task.title}`);
  return task;
}

export function cmdList(opts: { status?: string; all?: boolean; projectId?: string; tag?: string }) {
  const store = readStore();
  let tasks = store.tasks;

  if (!opts.all && !opts.status) tasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  else if (opts.status) tasks = tasks.filter(t => t.status === opts.status);

  if (opts.projectId) {
    const { project } = mustProject(opts.projectId);
    tasks = tasks.filter(task => getTaskProjectId(store, task) === project.id);
  }
  if (opts.tag) {
    tasks = tasks.filter(task => task.tags.includes(opts.tag!));
  }

  if (tasks.length === 0) {
    console.log(`${c.gray}No tasks.${c.reset}`);
    return [];
  }

  for (const t of tasks) console.log(fmtTask(t, false, store.tasks));
  return tasks;
}

export function cmdShow(id: string) {
  const { store, task } = mustTask(id);
  console.log(fmtTask(task, true, store.tasks));
  return task;
}

export function cmdStatus(id: string, status: string) {
  const valid: Status[] = ['open', 'in_progress', 'review', 'testing', 'waiting', 'done', 'cancelled'];
  if (!valid.includes(status as Status)) fail(`Invalid status. Use: ${valid.join(' | ')}`);
  const { store, task } = mustTask(id);
  const nextStatus = status as Status;
  const unresolved = statusRequiresResolvedDependencies(nextStatus) ? getUnresolvedDependencies(store, task) : [];
  if (unresolved.length > 0) fail(`Cannot move #${task.id} to ${nextStatus}; unresolved dependencies: ${unresolved.map(t => `#${t.id}`).join(', ')}`);
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
  projectId?: string;
  tags?: string[];
}) {
  const { store, task } = mustTask(id);

  const nextTask: Task = {
    ...task,
    title: opts.title ?? task.title,
    description: opts.description ?? task.description,
    parentId: opts.parentId ?? task.parentId,
    projectId: (opts.parentId ?? task.parentId) ? undefined : (opts.projectId ?? task.projectId),
    tags: opts.tags ?? task.tags,
    dependsOnIds: opts.dependsOnIds ?? task.dependsOnIds ?? [],
  };

  const assignmentError = validateTaskProjectAssignment(store, nextTask);
  if (assignmentError) fail(assignmentError);

  const dependencyError = validateDependsOnIds(store, nextTask, nextTask.dependsOnIds);
  if (dependencyError) fail(dependencyError);

  task.title = nextTask.title;
  task.description = nextTask.description;
  task.parentId = nextTask.parentId;
  task.projectId = nextTask.projectId;
  task.tags = nextTask.tags;
  task.dependsOnIds = nextTask.dependsOnIds;
  task.updatedAt = new Date().toISOString();
  writeStore(store);
  console.log(`${c.green}✓${c.reset} Updated #${task.id}`);
  return task;
}

export function cmdLog(id: string, text: string, author: Author = 'kuba') {
  const { store, task } = mustTask(id);
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
  if (idx === -1) fail(`Task not found: ${id}`);
  const [removed] = store.tasks.splice(idx, 1);
  writeStore(store);
  console.log(`${c.green}✓${c.reset} Deleted #${removed.id} — ${removed.title}`);
  return removed;
}

export function cmdProjectAdd(opts: { id?: string; name: string; description?: string; repos?: ProjectRepo[] }) {
  const store = readStore();
  const project = normalizeProjectInput(opts);
  const error = validateProject(store, project);
  if (error) fail(error);
  store.projects.push(project);
  writeStore(store);
  console.log(`${c.green}✓${c.reset} Added project ${c.bold}${project.name}${c.reset} (${project.id})`);
  return project;
}

export function cmdProjectList() {
  const store = readStore();
  if (store.projects.length === 0) {
    console.log(`${c.gray}No projects.${c.reset}`);
    return [];
  }
  for (const project of store.projects) {
    const taskCount = store.tasks.filter(task => getTaskProjectId(store, task) === project.id && !task.parentId).length;
    console.log(`${c.bold}${project.name}${c.reset} ${c.gray}(${project.id})${c.reset}  ${c.magenta}${taskCount} tasks${c.reset}`);
  }
  return store.projects;
}

export function cmdProjectShow(id: string) {
  console.log(fmtProjectBlock(id));
}

export function cmdProjectUpdate(id: string, opts: { name?: string; description?: string; repos?: ProjectRepo[]; nextId?: string }) {
  const { store, project: existing } = mustProject(id);
  const next = normalizeProjectInput({ id: opts.nextId ?? existing.id, name: opts.name, description: opts.description, repos: opts.repos }, existing);
  const error = validateProject(store, next, existing.id);
  if (error) fail(error);

  const previousId = existing.id;
  existing.id = next.id;
  existing.name = next.name;
  existing.description = next.description;
  existing.repos = next.repos;
  existing.updatedAt = next.updatedAt;

  if (previousId !== existing.id) {
    for (const task of store.tasks) {
      if (task.projectId === previousId) task.projectId = existing.id;
    }
  }

  writeStore(store);
  console.log(`${c.green}✓${c.reset} Updated project ${c.bold}${existing.name}${c.reset} (${existing.id})`);
  return existing;
}

export function cmdProjectDelete(id: string) {
  const { store, project } = mustProject(id);
  const inUse = store.tasks.some(task => getTaskProjectId(store, task) === project.id);
  if (inUse) fail(`Cannot delete project ${project.id}; tasks still reference it`);
  store.projects = store.projects.filter(candidate => candidate.id !== project.id);
  writeStore(store);
  console.log(`${c.green}✓${c.reset} Deleted project ${project.id}`);
}
