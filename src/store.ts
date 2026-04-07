import type { LogEntry, Project, ProjectRepo, ProjectRepoKind, Status, Task } from './types.js';
import {
  ensureObsidian,
  obsidianAppend,
  obsidianCreate,
  obsidianDelete,
  obsidianProperties,
  obsidianPropertySet,
  obsidianRead,
  obsidianSearch,
  PROJECTS_PATH,
  TASKS_PATH,
} from './obsidian.js';
import {
  formatLogEntry,
  generateSlug,
  markdownToProject,
  markdownToTask,
  projectToMarkdown,
  slugify,
  taskToMarkdown,
} from './markdown.js';

export { slugify } from './markdown.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function taskPath(slug: string): string {
  return `${TASKS_PATH}/${slug}.md`;
}

function projectPath(slug: string): string {
  return `${PROJECTS_PATH}/${slug}.md`;
}

/** Extract the slug (filename without extension) from a vault path. */
function slugFromPath(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.md$/, '');
}

// ---------------------------------------------------------------------------
// Field-name mapping: Task ↔ frontmatter
// ---------------------------------------------------------------------------

const TASK_FIELD_TO_FM: Record<string, string> = {
  projectId: 'project',
  parentId: 'parent',
  dependsOnIds: 'depends',
  createdAt: 'created',
  updatedAt: 'updated',
};

const LIST_PROPERTIES = new Set(['depends', 'tags']);
const BOOLEAN_PROPERTIES = new Set(['archived']);

function fmName(taskField: string): string {
  return TASK_FIELD_TO_FM[taskField] ?? taskField;
}

function fmType(fmKey: string): string | undefined {
  if (LIST_PROPERTIES.has(fmKey)) return 'list';
  return undefined;
}

// ---------------------------------------------------------------------------
// Slug deduplication
// ---------------------------------------------------------------------------

async function uniqueSlugAsync(base: string, pathPrefix: string): Promise<string> {
  const candidate = slugify(base);
  try {
    await obsidianRead(`${pathPrefix}/${candidate}.md`);
  } catch {
    return candidate;
  }
  let i = 2;
  while (true) {
    const next = `${candidate}-${i}`;
    try {
      await obsidianRead(`${pathPrefix}/${next}.md`);
      i++;
    } catch {
      return next;
    }
  }
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

async function readTask(slug: string): Promise<Task> {
  const path = taskPath(slug);
  const [content, props] = await Promise.all([
    obsidianRead(path),
    obsidianProperties(path),
  ]);
  return markdownToTask(slug, content, props);
}

async function readProject(slug: string): Promise<Project> {
  const path = projectPath(slug);
  const [content, props] = await Promise.all([
    obsidianRead(path),
    obsidianProperties(path),
  ]);
  return markdownToProject(slug, content, props);
}

// ---------------------------------------------------------------------------
// Search / list (two-phase)
// ---------------------------------------------------------------------------

export interface TaskFilters {
  status?: Status;
  project?: string;
  tag?: string;
  parent?: string;
  all?: boolean;
}

export async function listTasks(filters?: TaskFilters): Promise<Task[]> {
  await ensureObsidian();
  const paths = await obsidianSearch('tag:type/task', { path: TASKS_PATH });
  if (paths.length === 0) return [];

  // Phase 1: read properties for all matches
  const entries = await Promise.all(
    paths.map(async (p) => {
      const slug = slugFromPath(p);
      const props = await obsidianProperties(p);
      return { path: p, slug, props };
    }),
  );

  // Phase 2: filter by frontmatter properties
  const matching = entries.filter(({ props }) => {
    const status = props.status as string | undefined;
    if (!filters?.all && !filters?.status) {
      if (status === 'done' || status === 'cancelled') return false;
    }
    if (filters?.status && status !== filters.status) return false;
    if (filters?.project) {
      const project = props.project as string | undefined;
      if (project !== filters.project) return false;
    }
    if (filters?.tag) {
      const tags = Array.isArray(props.tags) ? props.tags as string[] : [];
      if (!tags.includes(filters.tag)) return false;
    }
    if (filters?.parent !== undefined) {
      const parent = props.parent as string | undefined;
      if ((parent ?? '') !== filters.parent) return false;
    }
    return true;
  });

  // Phase 3: full read for matching tasks
  return Promise.all(
    matching.map(({ slug, path: p }) => readTaskFromPathAndSlug(slug, p)),
  );
}

async function readTaskFromPathAndSlug(slug: string, path: string): Promise<Task> {
  const [content, props] = await Promise.all([
    obsidianRead(path),
    obsidianProperties(path),
  ]);
  return markdownToTask(slug, content, props);
}

export async function listProjects(): Promise<Project[]> {
  await ensureObsidian();
  const paths = await obsidianSearch('tag:type/project', { path: PROJECTS_PATH });
  if (paths.length === 0) return [];
  return Promise.all(
    paths.map(async (p) => {
      const slug = slugFromPath(p);
      return readProject(slug);
    }),
  );
}

// ---------------------------------------------------------------------------
// Single-record access
// ---------------------------------------------------------------------------

export async function getTask(slug: string): Promise<Task> {
  await ensureObsidian();
  return readTask(slug);
}

export async function getProject(slug: string): Promise<Project> {
  await ensureObsidian();
  return readProject(slug);
}

// ---------------------------------------------------------------------------
// Find by ID or prefix (compat with old findTask / findProject)
// ---------------------------------------------------------------------------

export async function findTask(id: string): Promise<Task | undefined> {
  await ensureObsidian();
  // Try exact match first
  try {
    return await readTask(id);
  } catch { /* not found */ }

  // Prefix search: list all task paths, find prefix match
  const paths = await obsidianSearch('tag:type/task', { path: TASKS_PATH });
  const match = paths.find((p) => slugFromPath(p).startsWith(id));
  if (!match) return undefined;
  return readTask(slugFromPath(match));
}

export async function findProject(id: string): Promise<Project | undefined> {
  await ensureObsidian();
  const normalized = slugify(id);
  try {
    return await readProject(normalized);
  } catch { /* not found */ }

  const paths = await obsidianSearch('tag:type/project', { path: PROJECTS_PATH });
  const match = paths.find((p) => slugFromPath(p).startsWith(normalized));
  if (!match) return undefined;
  return readProject(slugFromPath(match));
}

export async function resolveTaskIds(ids: string[] | undefined): Promise<Task[]> {
  if (!ids?.length) return [];
  const results = await Promise.all(ids.map((id) => findTask(id)));
  return results.filter((t): t is Task => t !== undefined);
}

// ---------------------------------------------------------------------------
// Task project resolution
// ---------------------------------------------------------------------------

export async function getTaskProjectId(task: Task): Promise<string | undefined> {
  if (task.projectId) return task.projectId;
  if (!task.parentId) return undefined;
  const parent = await findTask(task.parentId);
  return parent?.projectId;
}

export async function getTaskProject(task: Task): Promise<Project | undefined> {
  const projectId = await getTaskProjectId(task);
  return projectId ? findProject(projectId) : undefined;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export async function validateProject(project: Project, currentId?: string): Promise<string | null> {
  if (!project.id.trim()) return 'Project id is required';
  if (!project.name.trim()) return 'Project name is required';

  // Check for duplicates
  if (project.id !== currentId) {
    try {
      await readProject(project.id);
      return `Project already exists: ${project.id}`;
    } catch { /* good — doesn't exist */ }
  }

  const primaryRepos = project.repos.filter((r) => r.primary);
  if (primaryRepos.length > 1) return 'Only one repo can be marked primary';
  for (const repo of project.repos) {
    if (!repo.path && !repo.url) return `Repo '${repo.label}' must include a path or url`;
  }
  return null;
}

export async function validateTaskProjectAssignment(task: Task): Promise<string | null> {
  if (task.parentId) {
    if (task.projectId) return 'Child tasks inherit the parent project and cannot set projectId directly';
    const parent = await findTask(task.parentId);
    if (!parent) return `Parent task not found: ${task.parentId}`;
  }
  if (task.projectId) {
    const project = await findProject(task.projectId);
    if (!project) return `Project not found: ${task.projectId}`;
  }
  return null;
}

export async function validateDependsOnIds(task: Task, dependsOnIds: string[] | undefined): Promise<string | null> {
  const normalized = [...new Set((dependsOnIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (normalized.includes(task.id)) return 'A task cannot depend on itself';

  for (const depId of normalized) {
    const dep = await findTask(depId);
    if (!dep) return `Dependency task not found: ${depId}`;
    if (dep.id === task.id) return 'A task cannot depend on itself';
    if (dep.parentId !== task.parentId) {
      return `Dependency #${dep.id} must share the same parent as #${task.id}`;
    }
  }

  return validateTaskProjectConsistency(task, normalized);
}

async function validateTaskProjectConsistency(task: Task, dependsOnIds: string[]): Promise<string | null> {
  const taskProjectId = await getTaskProjectId(task);
  for (const depId of dependsOnIds) {
    const dep = await findTask(depId);
    if (!dep) continue;
    const depProjectId = await getTaskProjectId(dep);
    if ((taskProjectId ?? '') !== (depProjectId ?? '')) {
      return `Dependency #${dep.id} must share the same effective project as #${task.id}`;
    }
  }
  return null;
}

export async function getUnresolvedDependencies(task: Task): Promise<Task[]> {
  const deps = await resolveTaskIds(task.dependsOnIds);
  return deps.filter((d) => d.status !== 'done');
}

export function statusRequiresResolvedDependencies(status: Status): boolean {
  return ['in_progress', 'review', 'testing', 'done'].includes(status);
}

// ---------------------------------------------------------------------------
// Project input normalization (sync — no I/O)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Task CRUD
// ---------------------------------------------------------------------------

export async function addTask(params: {
  title: string;
  description?: string;
  parentId?: string;
  projectId?: string;
  tags?: string[];
  dependsOnIds?: string[];
  note?: { text: string; author: string };
}): Promise<Task> {
  await ensureObsidian();
  const now = nowIso();
  const slug = await uniqueSlugAsync(generateSlug(params.title), TASKS_PATH);
  const task: Task = {
    id: slug,
    title: params.title,
    description: params.description,
    parentId: params.parentId,
    projectId: params.parentId ? undefined : params.projectId,
    tags: [...new Set(params.tags ?? [])],
    dependsOnIds: params.dependsOnIds?.length ? [...new Set(params.dependsOnIds)] : undefined,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    log: params.note ? [{ at: now, author: params.note.author, text: params.note.text }] : [],
  };
  await obsidianCreate(slug, TASKS_PATH, taskToMarkdown(task));
  return task;
}

export async function updateTask(slug: string, updates: Partial<Pick<Task, 'title' | 'description' | 'parentId' | 'projectId' | 'tags' | 'dependsOnIds' | 'status'>>): Promise<Task> {
  await ensureObsidian();
  const task = await readTask(slug);

  if (updates.title !== undefined) task.title = updates.title;
  if (updates.description !== undefined) task.description = updates.description;
  if (updates.parentId !== undefined) task.parentId = updates.parentId;
  if (updates.projectId !== undefined) task.projectId = updates.projectId;
  if (updates.tags !== undefined) task.tags = updates.tags;
  if (updates.dependsOnIds !== undefined) task.dependsOnIds = updates.dependsOnIds;
  if (updates.status !== undefined) task.status = updates.status;
  task.updatedAt = nowIso();

  // Full rewrite — ensures description + frontmatter stay consistent
  await obsidianDelete(taskPath(slug));
  await obsidianCreate(slug, TASKS_PATH, taskToMarkdown(task));
  return task;
}

export async function updateTaskProperty(slug: string, field: string, value: string | string[] | boolean): Promise<void> {
  await ensureObsidian();
  const fm = fmName(field);
  const path = taskPath(slug);
  await obsidianPropertySet(path, fm, value, fmType(fm));
  await obsidianPropertySet(path, 'updated', nowIso());
}

export async function appendLog(slug: string, entry: LogEntry): Promise<void> {
  await ensureObsidian();
  const path = taskPath(slug);
  await obsidianAppend(path, formatLogEntry(entry) + '\n');
  await obsidianPropertySet(path, 'updated', entry.at);
}

export async function deleteTask(slug: string): Promise<void> {
  await ensureObsidian();
  await obsidianDelete(taskPath(slug));
}

// ---------------------------------------------------------------------------
// Project CRUD
// ---------------------------------------------------------------------------

export async function addProject(params: {
  id?: string;
  name: string;
  description?: string;
  repos?: Array<Partial<ProjectRepo>>;
}): Promise<Project> {
  await ensureObsidian();
  const project = normalizeProjectInput(params);
  const slug = await uniqueSlugAsync(project.id, PROJECTS_PATH);
  project.id = slug;
  await obsidianCreate(slug, PROJECTS_PATH, projectToMarkdown(project));
  return project;
}

export async function updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'description' | 'repos' | 'archived'>> & { nextId?: string }): Promise<Project> {
  await ensureObsidian();
  const existing = await readProject(id);
  const next = normalizeProjectInput(
    {
      id: updates.nextId ?? existing.id,
      name: updates.name,
      description: updates.description,
      repos: updates.repos,
    },
    existing,
  );
  if (updates.archived !== undefined) next.archived = updates.archived || undefined;

  // Full rewrite for repos/rename
  await obsidianDelete(projectPath(id));
  await obsidianCreate(next.id, PROJECTS_PATH, projectToMarkdown(next));

  // If ID changed, update task references
  if (id !== next.id) {
    const tasks = await listTasks({ project: id, all: true });
    for (const task of tasks) {
      await updateTaskProperty(task.id, 'projectId', next.id);
    }
  }

  return next;
}

export async function deleteProject(id: string): Promise<void> {
  await ensureObsidian();
  const tasks = await listTasks({ project: id, all: true });
  if (tasks.length > 0) {
    throw new Error(`Cannot delete project ${id}; tasks still reference it`);
  }
  await obsidianDelete(projectPath(id));
}
