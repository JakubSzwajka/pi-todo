import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import type { Store, Task, LogEntry, Author, Status, Project, ProjectRepo, ProjectRepoKind } from './types.js';

export const STORE_PATH = process.env.PI_TODO_STORE
  ?? join(homedir(), '.pi', '.pi-todo.json');

function nowIso() {
  return new Date().toISOString();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'project';
}

function uniqueSlug(base: string, taken: Set<string>): string {
  let next = slugify(base);
  if (!taken.has(next)) {
    taken.add(next);
    return next;
  }
  let i = 2;
  while (taken.has(`${next}-${i}`)) i++;
  const candidate = `${next}-${i}`;
  taken.add(candidate);
  return candidate;
}

function normalizeLogEntry(value: unknown): LogEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.at !== 'string') return null;
  if (typeof raw.author !== 'string') return null;
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

function normalizeRepoKind(value: unknown): ProjectRepoKind {
  switch (value) {
    case 'local':
    case 'github':
    case 'git':
      return value;
    default:
      return 'git';
  }
}

function normalizeProjectRepo(value: unknown, fallbackLabel = 'repo'): ProjectRepo | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : fallbackLabel;
  const path = typeof raw.path === 'string' && raw.path.trim() ? raw.path.trim() : undefined;
  const url = typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : undefined;
  if (!path && !url) return null;
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? slugify(raw.id) : slugify(label),
    label,
    kind: normalizeRepoKind(raw.kind),
    path,
    url,
    primary: raw.primary === true,
  };
}

function normalizeProject(value: unknown): Project | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined;
  const id = typeof raw.id === 'string' && raw.id.trim() ? slugify(raw.id) : (name ? slugify(name) : undefined);
  if (!id || !name) return null;

  const repos = Array.isArray(raw.repos)
    ? raw.repos.map((repo, i) => normalizeProjectRepo(repo, `repo-${i + 1}`)).filter((repo): repo is ProjectRepo => repo !== null)
    : [];

  let primarySeen = false;
  for (const repo of repos) {
    if (repo.primary && !primarySeen) {
      primarySeen = true;
    } else {
      repo.primary = false;
    }
  }

  return {
    id,
    name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    repos,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
    archived: raw.archived === true ? true : undefined,
  };
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
    projectId: typeof raw.projectId === 'string' && raw.projectId.trim() ? slugify(raw.projectId) : undefined,
    tags: Array.isArray(raw.tags)
      ? [...new Set(raw.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).map(tag => tag.trim()))]
      : [],
    dependsOnIds: Array.isArray(raw.dependsOnIds)
      ? [...new Set(raw.dependsOnIds.filter((id): id is string => typeof id === 'string'))]
      : [],
    status: normalizeStatus(raw.status),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
    log: Array.isArray(raw.log) ? raw.log.map(normalizeLogEntry).filter((entry): entry is LogEntry => entry !== null) : [],
  };
}

function migrateLegacyTasks(rawTasks: Array<Record<string, unknown>>, projects: Project[]): Task[] {
  const takenProjectIds = new Set(projects.map(project => project.id));
  const projectByLegacyTag = new Map(projects.map(project => [project.id, project]));

  const getOrCreateProjectForTag = (tag: string): Project => {
    const normalizedTag = slugify(tag);
    const existing = projectByLegacyTag.get(normalizedTag);
    if (existing) return existing;
    const at = nowIso();
    const project: Project = {
      id: uniqueSlug(normalizedTag, takenProjectIds),
      name: tag,
      repos: [],
      createdAt: at,
      updatedAt: at,
    };
    projects.push(project);
    projectByLegacyTag.set(normalizedTag, project);
    projectByLegacyTag.set(project.id, project);
    return project;
  };

  return rawTasks
    .map(raw => {
      const task = normalizeTask(raw);
      if (!task) return null;

      const tags = task.tags;

      if (!task.projectId && !task.parentId && tags.length > 0) {
        const primaryTag = tags[0]!;
        const project = getOrCreateProjectForTag(primaryTag);
        task.projectId = project.id;
        if (tags.length > 1) {
          task.log.push({
            at: nowIso(),
            author: 'system',
            text: `Legacy tags migrated to projects. Selected project '${project.id}' from tags: ${tags.join(', ')}`,
          });
          task.updatedAt = nowIso();
        }
      }

      if (task.parentId) task.projectId = undefined;
      return task;
    })
    .filter((task): task is Task => task !== null);
}

function normalizeStore(value: unknown): Store {
  if (!value || typeof value !== 'object') return { projects: [], tasks: [] };
  const raw = value as Record<string, unknown>;
  const projects = Array.isArray(raw.projects)
    ? raw.projects.map(normalizeProject).filter((project): project is Project => project !== null)
    : [];

  const tasks = Array.isArray(raw.tasks)
    ? migrateLegacyTasks(raw.tasks.filter((task): task is Record<string, unknown> => Boolean(task) && typeof task === 'object'), projects)
    : [];

  const knownProjectIds = new Set(projects.map(project => project.id));
  for (const task of tasks) {
    if (task.projectId && !knownProjectIds.has(task.projectId)) {
      const placeholder: Project = {
        id: task.projectId,
        name: task.projectId,
        repos: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      projects.push(placeholder);
      knownProjectIds.add(placeholder.id);
      task.log.push({
        at: nowIso(),
        author: 'system',
        text: `Unknown project '${task.projectId}' restored as placeholder during normalization.`,
      });
      task.updatedAt = nowIso();
    }
  }

  return { projects, tasks };
}

export function readStore(): Store {
  if (!existsSync(STORE_PATH)) return { projects: [], tasks: [] };
  try {
    return normalizeStore(JSON.parse(readFileSync(STORE_PATH, 'utf8')));
  } catch {
    return { projects: [], tasks: [] };
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
  return store.tasks.find(t => t.id === id) ?? store.tasks.find(t => t.id.startsWith(id));
}

export function findProject(store: Store, id: string): Project | undefined {
  const normalized = slugify(id);
  return store.projects.find(project => project.id === normalized)
    ?? store.projects.find(project => project.id.startsWith(normalized));
}

export function resolveTaskIds(store: Store, ids: string[] | undefined): Task[] {
  if (!ids?.length) return [];
  return ids.map(id => findTask(store, id)).filter((task): task is Task => task !== undefined);
}

export function getTaskProjectId(store: Store, task: Task): string | undefined {
  if (task.projectId) return task.projectId;
  if (!task.parentId) return undefined;
  const parent = findTask(store, task.parentId);
  return parent?.projectId;
}

export function getTaskProject(store: Store, task: Task): Project | undefined {
  const projectId = getTaskProjectId(store, task);
  return projectId ? findProject(store, projectId) : undefined;
}

export function validateProject(store: Store, project: Project, currentId?: string): string | null {
  if (!project.id.trim()) return 'Project id is required';
  if (!project.name.trim()) return 'Project name is required';
  const duplicate = store.projects.find(candidate => candidate.id === project.id && candidate.id !== currentId);
  if (duplicate) return `Project already exists: ${project.id}`;
  const primaryRepos = project.repos.filter(repo => repo.primary);
  if (primaryRepos.length > 1) return 'Only one repo can be marked primary';
  for (const repo of project.repos) {
    if (!repo.path && !repo.url) return `Repo '${repo.label}' must include a path or url`;
  }
  return null;
}

export function validateTaskProjectAssignment(store: Store, task: Task): string | null {
  if (task.parentId) {
    if (task.projectId) return 'Child tasks inherit the parent project and cannot set projectId directly';
    const parent = findTask(store, task.parentId);
    if (!parent) return `Parent task not found: ${task.parentId}`;
  }

  const projectId = task.projectId;
  if (projectId && !findProject(store, projectId)) {
    return `Project not found: ${projectId}`;
  }

  return null;
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

  return validateTaskProjectConsistency(store, task, normalized);
}

function validateTaskProjectConsistency(store: Store, task: Task, dependsOnIds: string[]): string | null {
  const taskProjectId = getTaskProjectId(store, task);
  for (const dependencyId of dependsOnIds) {
    const dependency = findTask(store, dependencyId);
    if (!dependency) continue;
    const dependencyProjectId = getTaskProjectId(store, dependency);
    if ((taskProjectId ?? '') !== (dependencyProjectId ?? '')) {
      return `Dependency #${dependency.id} must share the same effective project as #${task.id}`;
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

export function normalizeProjectInput(input: {
  id?: string;
  name?: string;
  description?: string;
  repos?: Array<Partial<ProjectRepo>>;
}, existing?: Project): Project {
  const at = existing?.createdAt ?? nowIso();
  const baseId = input.id ?? existing?.id ?? input.name ?? 'project';
  const repos = (input.repos ?? existing?.repos ?? [])
    .map((repo, index) => normalizeProjectRepo(repo, repo.label ?? `repo-${index + 1}`))
    .filter((repo): repo is ProjectRepo => repo !== null);

  let primarySeen = false;
  for (const repo of repos) {
    if (repo.primary && !primarySeen) primarySeen = true;
    else repo.primary = false;
  }

  return {
    id: slugify(baseId),
    name: input.name ?? existing?.name ?? slugify(baseId),
    description: input.description ?? existing?.description,
    repos,
    createdAt: at,
    updatedAt: nowIso(),
    archived: existing?.archived,
  };
}
