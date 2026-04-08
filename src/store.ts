import type { LogEntry, Project, Status, Task } from './types.js';
import {
  ensureObsidian,
  obsidianCreate,
  obsidianDelete,
  obsidianProperties,
  obsidianRead,
  obsidianSearch,
  PROJECTS_PATH,
  TASKS_PATH,
} from './obsidian.js';
import {
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

function slugFromPath(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.md$/, '');
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
// Search / list
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

  const entries = await Promise.all(
    paths.map(async (p) => {
      const slug = slugFromPath(p);
      const props = await obsidianProperties(p);
      return { path: p, slug, props };
    }),
  );

  // First pass: apply all filters
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

  // Second pass: include subtasks whose parent matched (project inheritance)
  if (filters?.project) {
    const matchedSlugs = new Set(matching.map(({ slug }) => slug));
    for (const entry of entries) {
      if (matchedSlugs.has(entry.slug)) continue;
      const parent = entry.props.parent as string | undefined;
      if (parent && matchedSlugs.has(parent)) {
        const status = entry.props.status as string | undefined;
        if (!filters.all && !filters.status) {
          if (status === 'done' || status === 'cancelled') continue;
        }
        if (filters.status && status !== filters.status) continue;
        matching.push(entry);
        matchedSlugs.add(entry.slug);
      }
    }
  }

  return Promise.all(
    matching.map(async ({ slug, path: p }) => {
      const [content, props] = await Promise.all([
        obsidianRead(p),
        obsidianProperties(p),
      ]);
      return markdownToTask(slug, content, props);
    }),
  );
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
// Find by ID or prefix
// ---------------------------------------------------------------------------

export async function findTask(id: string): Promise<Task | undefined> {
  await ensureObsidian();
  try {
    return await readTask(id);
  } catch { /* not found */ }

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

// ---------------------------------------------------------------------------
// Task CRUD
// ---------------------------------------------------------------------------

export async function addTask(params: {
  title: string;
  description?: string;
  parentId?: string;
  projectId?: string;
  tags?: string[];
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
    status: 'open',
    createdAt: now,
    updatedAt: now,
    log: params.note ? [{ at: now, author: params.note.author, text: params.note.text }] : [],
  };
  await obsidianCreate(slug, TASKS_PATH, taskToMarkdown(task));
  return task;
}

export async function updateTask(slug: string, updates: Partial<Pick<Task, 'title' | 'description' | 'parentId' | 'projectId' | 'tags' | 'status'>>): Promise<Task> {
  await ensureObsidian();
  const task = await readTask(slug);

  if (updates.title !== undefined) task.title = updates.title;
  if (updates.description !== undefined) task.description = updates.description;
  if (updates.parentId !== undefined) task.parentId = updates.parentId;
  if (updates.projectId !== undefined) task.projectId = updates.projectId;
  if (updates.tags !== undefined) task.tags = updates.tags;
  if (updates.status !== undefined) task.status = updates.status;
  task.updatedAt = nowIso();

  await obsidianDelete(taskPath(slug));
  await obsidianCreate(slug, TASKS_PATH, taskToMarkdown(task));
  return task;
}

export async function appendLog(slug: string, entry: LogEntry): Promise<void> {
  await ensureObsidian();
  const task = await readTask(slug);
  task.log = [entry, ...task.log];
  task.updatedAt = entry.at;
  await obsidianDelete(taskPath(slug));
  await obsidianCreate(slug, TASKS_PATH, taskToMarkdown(task));
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
}): Promise<Project> {
  await ensureObsidian();
  const now = nowIso();
  const baseId = params.id ?? params.name;
  const slug = await uniqueSlugAsync(slugify(baseId), PROJECTS_PATH);
  const project: Project = {
    id: slug,
    name: params.name,
    description: params.description,
    createdAt: now,
    updatedAt: now,
  };
  await obsidianCreate(slug, PROJECTS_PATH, projectToMarkdown(project));
  return project;
}

export async function updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'description'>>): Promise<Project> {
  await ensureObsidian();
  const project = await readProject(id);

  if (updates.name !== undefined) project.name = updates.name;
  if (updates.description !== undefined) project.description = updates.description;
  project.updatedAt = nowIso();

  await obsidianDelete(projectPath(id));
  await obsidianCreate(project.id, PROJECTS_PATH, projectToMarkdown(project));
  return project;
}

export async function deleteProject(id: string): Promise<void> {
  await ensureObsidian();
  const tasks = await listTasks({ project: id, all: true });
  if (tasks.length > 0) {
    throw new Error(`Cannot delete project ${id}; tasks still reference it`);
  }
  await obsidianDelete(projectPath(id));
}
