import {
  addProject,
  addTask,
  appendLog,
  deleteProject,
  deleteTask,
  findProject,
  findTask,
  getTaskProject,
  getTaskProjectId,
  getUnresolvedDependencies,
  listProjects,
  listTasks,
  normalizeProjectInput,
  resolveTaskIds,
  statusRequiresResolvedDependencies,
  updateProject,
  updateTask,
  updateTaskProperty,
  validateDependsOnIds,
  validateProject,
  validateTaskProjectAssignment,
} from './store.js';
import type { Author, ProjectRepo, Status, Task } from './types.js';

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

async function fmtTask(t: Task, showFull = false, allTasks: Task[] = []) {
  const lines: string[] = [];
  const parent = t.parentId ? allTasks.find(p => p.id === t.parentId) : undefined;
  const dependencies = allTasks.filter(candidate => (t.dependsOnIds ?? []).includes(candidate.id));
  const blockedBy = allTasks.filter(candidate => (candidate.dependsOnIds ?? []).includes(t.id));
  const unresolved = dependencies.filter(candidate => candidate.status !== 'done');
  const project = await getTaskProject(t);
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
      const childProject = await getTaskProject(child);
      lines.push(`    ${c.dim}#${child.id}${c.reset}  ${child.title}  ${fmtStatus(child.status)}${childProject ? `  ${fmtProject(childProject.id, childProject.name)}` : ''}`);
    }
  }

  return lines.join('\n');
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

async function fmtProjectBlock(projectId: string) {
  const project = await mustProject(projectId);
  const tasks = await listTasks({ project: project.id, all: true });
  const parentTasks = tasks.filter(task => !task.parentId);
  const lines = [
    `${c.bold}${project.name}${c.reset} ${c.gray}(${project.id})${c.reset}`,
    project.description ? `${c.dim}${project.description}${c.reset}` : '',
    '',
    `${c.dim}Repos:${c.reset}`,
    ...(project.repos.length > 0 ? project.repos.map(fmtRepo) : ['  - none']),
    '',
    `${c.dim}Parent tasks:${c.reset}`,
    ...(parentTasks.length > 0 ? parentTasks.map(task => `  - #${task.id} ${task.title}  ${STATUS_LABEL[task.status]}`) : ['  - none']),
  ].filter(Boolean);

  return lines.join('\n');
}

export async function cmdAdd(title: string, opts: {
  description?: string;
  note?: string;
  parentId?: string;
  dependsOnIds?: string[];
  projectId?: string;
  tags?: string[];
}) {
  // Build a temporary task-like object for validation
  const tempTask = {
    id: '__pending__',
    title,
    parentId: opts.parentId,
    projectId: opts.parentId ? undefined : opts.projectId,
    tags: [...new Set(opts.tags ?? [])],
    dependsOnIds: [...new Set(opts.dependsOnIds ?? [])],
    status: 'open' as const,
    createdAt: '',
    updatedAt: '',
    log: [],
  };

  const assignmentError = await validateTaskProjectAssignment(tempTask);
  if (assignmentError) fail(assignmentError);

  const dependencyError = await validateDependsOnIds(tempTask, tempTask.dependsOnIds);
  if (dependencyError) fail(dependencyError);

  const task = await addTask({
    title,
    description: opts.description,
    parentId: opts.parentId,
    projectId: opts.projectId,
    tags: opts.tags,
    dependsOnIds: opts.dependsOnIds,
    note: opts.note ? { text: opts.note, author: 'kuba' } : undefined,
  });

  console.log(`${c.green}✓${c.reset} Added ${c.bold}#${task.id}${c.reset} — ${task.title}`);
  return task;
}

export async function cmdList(opts: { status?: string; all?: boolean; projectId?: string; tag?: string }) {
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

  // Fetch all tasks for cross-referencing (dependencies, blocking, etc.)
  const allTasks = await listTasks({ all: true });
  for (const t of tasks) console.log(await fmtTask(t, false, allTasks));
  return tasks;
}

export async function cmdShow(id: string) {
  const task = await mustTask(id);
  const allTasks = await listTasks({ all: true });
  console.log(await fmtTask(task, true, allTasks));
  return task;
}

export async function cmdStatus(id: string, status: string) {
  const valid: Status[] = ['open', 'in_progress', 'review', 'testing', 'waiting', 'done', 'cancelled'];
  if (!valid.includes(status as Status)) fail(`Invalid status. Use: ${valid.join(' | ')}`);
  const task = await mustTask(id);
  const nextStatus = status as Status;
  if (statusRequiresResolvedDependencies(nextStatus)) {
    const unresolved = await getUnresolvedDependencies(task);
    if (unresolved.length > 0) fail(`Cannot move #${task.id} to ${nextStatus}; unresolved dependencies: ${unresolved.map(t => `#${t.id}`).join(', ')}`);
  }
  const prev = task.status;
  await updateTaskProperty(task.id, 'status', nextStatus);
  console.log(`${c.green}✓${c.reset} #${task.id}  ${fmtStatus(prev)} → ${fmtStatus(nextStatus)}`);
  return task;
}

export async function cmdUpdate(id: string, opts: {
  title?: string;
  description?: string;
  parentId?: string;
  dependsOnIds?: string[];
  projectId?: string;
  tags?: string[];
}) {
  const task = await mustTask(id);

  const nextTask: Task = {
    ...task,
    title: opts.title ?? task.title,
    description: opts.description ?? task.description,
    parentId: opts.parentId ?? task.parentId,
    projectId: (opts.parentId ?? task.parentId) ? undefined : (opts.projectId ?? task.projectId),
    tags: opts.tags ?? task.tags,
    dependsOnIds: opts.dependsOnIds ?? task.dependsOnIds ?? [],
  };

  const assignmentError = await validateTaskProjectAssignment(nextTask);
  if (assignmentError) fail(assignmentError);

  const dependencyError = await validateDependsOnIds(nextTask, nextTask.dependsOnIds);
  if (dependencyError) fail(dependencyError);

  await updateTask(task.id, {
    title: nextTask.title,
    description: nextTask.description,
    parentId: nextTask.parentId,
    projectId: nextTask.projectId,
    tags: nextTask.tags,
    dependsOnIds: nextTask.dependsOnIds,
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

export async function cmdProjectAdd(opts: { id?: string; name: string; description?: string; repos?: ProjectRepo[] }) {
  const normalized = normalizeProjectInput(opts);
  const error = await validateProject(normalized);
  if (error) fail(error);
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
    const parentCount = tasks.filter(t => !t.parentId).length;
    console.log(`${c.bold}${project.name}${c.reset} ${c.gray}(${project.id})${c.reset}  ${c.magenta}${parentCount} tasks${c.reset}`);
  }
  return projects;
}

export async function cmdProjectShow(id: string) {
  console.log(await fmtProjectBlock(id));
}

export async function cmdProjectUpdate(id: string, opts: { name?: string; description?: string; repos?: ProjectRepo[]; nextId?: string }) {
  const existing = await mustProject(id);
  const next = normalizeProjectInput({ id: opts.nextId ?? existing.id, name: opts.name, description: opts.description, repos: opts.repos }, existing);
  const error = await validateProject(next, existing.id);
  if (error) fail(error);

  const updated = await updateProject(existing.id, {
    name: opts.name,
    description: opts.description,
    repos: opts.repos,
    nextId: opts.nextId,
  });

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
