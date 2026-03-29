import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const STORE_PATH = process.env.PI_TODO_STORE
  ?? join(homedir(), '.pi', '.pi-todo.json');

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'project';
}

function sanitizeRepo(repo, fallbackLabel = 'repo') {
  if (!repo || typeof repo !== 'object') return null;
  const label = typeof repo.label === 'string' && repo.label.trim() ? repo.label.trim() : fallbackLabel;
  const path = typeof repo.path === 'string' && repo.path.trim() ? repo.path.trim() : undefined;
  const url = typeof repo.url === 'string' && repo.url.trim() ? repo.url.trim() : undefined;
  if (!path && !url) return null;
  return {
    id: typeof repo.id === 'string' && repo.id.trim() ? slugify(repo.id) : slugify(label),
    label,
    kind: ['local', 'github', 'git'].includes(repo.kind) ? repo.kind : 'git',
    path,
    url,
    primary: repo.primary === true,
  };
}

function sanitizeProject(project) {
  if (!project || typeof project !== 'object') return null;
  const name = typeof project.name === 'string' && project.name.trim() ? project.name.trim() : undefined;
  const id = typeof project.id === 'string' && project.id.trim() ? slugify(project.id) : (name ? slugify(name) : undefined);
  if (!id || !name) return null;
  const repos = Array.isArray(project.repos)
    ? project.repos.map((repo, i) => sanitizeRepo(repo, `repo-${i + 1}`)).filter(Boolean)
    : [];
  let primarySeen = false;
  for (const repo of repos) {
    if (repo.primary && !primarySeen) primarySeen = true;
    else repo.primary = false;
  }
  return {
    id,
    name,
    description: typeof project.description === 'string' ? project.description : undefined,
    repos,
    createdAt: typeof project.createdAt === 'string' ? project.createdAt : new Date().toISOString(),
    updatedAt: typeof project.updatedAt === 'string' ? project.updatedAt : new Date().toISOString(),
    archived: project.archived === true ? true : undefined,
  };
}

function sanitizeTask(task, projects = []) {
  if (!task || typeof task !== 'object') return null;
  if (typeof task.id !== 'string' || typeof task.title !== 'string') return null;
  const legacyTags = Array.isArray(task.tags) ? task.tags.filter(tag => typeof tag === 'string' && tag.trim()) : [];
  const projectId = typeof task.projectId === 'string' && task.projectId.trim()
    ? slugify(task.projectId)
    : (!task.parentId && legacyTags[0] ? slugify(legacyTags[0]) : undefined);

  if (projectId && !projects.some(project => project.id === projectId)) {
    projects.push({
      id: projectId,
      name: legacyTags[0] ?? projectId,
      repos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    id: task.id,
    title: task.title,
    description: typeof task.description === 'string' ? task.description : undefined,
    parentId: typeof task.parentId === 'string' ? task.parentId : undefined,
    projectId: task.parentId ? undefined : projectId,
    dependsOnIds: Array.isArray(task.dependsOnIds) ? [...new Set(task.dependsOnIds.filter(id => typeof id === 'string'))] : [],
    status: ['open', 'in_progress', 'review', 'testing', 'waiting', 'done', 'cancelled'].includes(task.status) ? task.status : 'open',
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : new Date().toISOString(),
    updatedAt: typeof task.updatedAt === 'string' ? task.updatedAt : new Date().toISOString(),
    log: Array.isArray(task.log)
      ? task.log.filter(entry => entry && typeof entry.at === 'string' && typeof entry.text === 'string' && typeof entry.author === 'string')
      : [],
  };
}

function sanitizeStore(store) {
  const projects = Array.isArray(store?.projects) ? store.projects.map(sanitizeProject).filter(Boolean) : [];
  const tasks = Array.isArray(store?.tasks) ? store.tasks.map(task => sanitizeTask(task, projects)).filter(Boolean) : [];
  return { projects, tasks };
}

function readStore() {
  if (!existsSync(STORE_PATH)) return { projects: [], tasks: [] };
  try { return sanitizeStore(JSON.parse(readFileSync(STORE_PATH, 'utf8'))); }
  catch { return { projects: [], tasks: [] }; }
}

function writeStore(store) {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(sanitizeStore(store), null, 2), 'utf8');
}

function findTask(store, id) {
  return store.tasks.find(task => task.id === id) || store.tasks.find(task => task.id.startsWith(id));
}

function findProject(store, id) {
  const normalized = slugify(id);
  return store.projects.find(project => project.id === normalized) || store.projects.find(project => project.id.startsWith(normalized));
}

function getTaskProjectId(store, task) {
  if (task.projectId) return task.projectId;
  if (!task.parentId) return undefined;
  const parent = findTask(store, task.parentId);
  return parent?.projectId;
}

function getTaskProject(store, task) {
  const projectId = getTaskProjectId(store, task);
  return projectId ? findProject(store, projectId) : undefined;
}

function getUnresolvedDependencies(store, task) {
  const ids = Array.isArray(task.dependsOnIds) ? task.dependsOnIds : [];
  return ids.map(id => findTask(store, id)).filter(Boolean).filter(dep => dep.status !== 'done');
}

function statusRequiresResolvedDependencies(status) {
  return ['in_progress', 'review', 'testing', 'done'].includes(status);
}

function validateDependsOnIds(store, task, dependsOnIds) {
  const normalized = Array.isArray(dependsOnIds)
    ? [...new Set(dependsOnIds.map(id => String(id).trim()).filter(Boolean))]
    : [];

  if (normalized.includes(task.id)) return 'A task cannot depend on itself';

  for (const dependencyId of normalized) {
    const dependency = findTask(store, dependencyId);
    if (!dependency) return `Dependency task not found: ${dependencyId}`;
    if (dependency.id === task.id) return 'A task cannot depend on itself';
    if (dependency.parentId !== task.parentId) return `Dependency #${dependency.id} must share the same parent as #${task.id}`;
    if ((getTaskProjectId(store, dependency) ?? '') !== (getTaskProjectId(store, task) ?? '')) {
      return `Dependency #${dependency.id} must share the same effective project as #${task.id}`;
    }
  }

  return null;
}

function enrichTask(store, task) {
  return {
    ...task,
    project: getTaskProject(store, task),
    effectiveProjectId: getTaskProjectId(store, task),
  };
}

function validateProjectPayload(store, project, currentId) {
  if (!project.id) return 'Project id is required';
  if (!project.name) return 'Project name is required';
  if (store.projects.some(candidate => candidate.id === project.id && candidate.id !== currentId)) return `Project already exists: ${project.id}`;
  if (project.repos.filter(repo => repo.primary).length > 1) return 'Only one repo can be marked primary';
  return null;
}

function normalizeProjectPayload(body, existing = undefined) {
  const repos = Array.isArray(body.repos)
    ? body.repos.map((repo, i) => sanitizeRepo(repo, `repo-${i + 1}`)).filter(Boolean)
    : (existing?.repos ?? []);
  let primarySeen = false;
  for (const repo of repos) {
    if (repo.primary && !primarySeen) primarySeen = true;
    else repo.primary = false;
  }
  return {
    id: slugify(body.id ?? existing?.id ?? body.name ?? 'project'),
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : (existing?.name ?? 'project'),
    description: typeof body.description === 'string' ? body.description : existing?.description,
    repos,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: body.archived === undefined ? existing?.archived : (body.archived === true ? true : undefined),
  };
}

export default async function routes(req, res, url, { sendJson, readBody }) {
  if (req.method === 'GET' && url.pathname === '/api/pi-todo/state') {
    const store = readStore();
    sendJson(res, 200, {
      projects: store.projects,
      tasks: store.tasks.map(task => enrichTask(store, task)),
    });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/pi-todo/projects') {
    sendJson(res, 200, readStore().projects);
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/pi-todo/projects') {
    const body = await readBody(req);
    const store = readStore();
    const project = normalizeProjectPayload(body);
    const error = validateProjectPayload(store, project);
    if (error) { sendJson(res, 409, { error }); return true; }
    store.projects.push(project);
    writeStore(store);
    sendJson(res, 200, project);
    return true;
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/pi-todo/projects/')) {
    const id = url.pathname.split('/').pop();
    const body = await readBody(req);
    const store = readStore();
    const project = findProject(store, id);
    if (!project) { sendJson(res, 404, { error: 'Project not found' }); return true; }
    const next = normalizeProjectPayload(body, project);
    const error = validateProjectPayload(store, next, project.id);
    if (error) { sendJson(res, 409, { error }); return true; }
    const previousId = project.id;
    Object.assign(project, next);
    if (previousId !== project.id) {
      for (const task of store.tasks) {
        if (task.projectId === previousId) task.projectId = project.id;
      }
    }
    writeStore(store);
    sendJson(res, 200, project);
    return true;
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/pi-todo/projects/')) {
    const id = url.pathname.split('/').pop();
    const store = readStore();
    const project = findProject(store, id);
    if (!project) { sendJson(res, 404, { error: 'Project not found' }); return true; }
    if (store.tasks.some(task => getTaskProjectId(store, task) === project.id)) {
      sendJson(res, 409, { error: 'Cannot delete project while tasks still reference it' });
      return true;
    }
    store.projects = store.projects.filter(candidate => candidate.id !== project.id);
    writeStore(store);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/pi-todo/tasks') {
    const store = readStore();
    sendJson(res, 200, store.tasks.map(task => enrichTask(store, task)));
    return true;
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/pi-todo/tasks/')) {
    const id = url.pathname.split('/').pop();
    const body = await readBody(req);
    const store = readStore();
    const task = store.tasks.find(t => t.id === id);
    if (!task) { sendJson(res, 404, { error: 'Task not found' }); return true; }

    if (body.dependsOnIds !== undefined) {
      const dependencyError = validateDependsOnIds(store, task, body.dependsOnIds);
      if (dependencyError) { sendJson(res, 409, { error: dependencyError }); return true; }
      task.dependsOnIds = [...new Set(body.dependsOnIds.map(id => String(id).trim()).filter(Boolean))];
      task.updatedAt = new Date().toISOString();
    }

    if (body.projectId !== undefined) {
      if (task.parentId) {
        sendJson(res, 400, { error: 'Child tasks inherit project from parent' });
        return true;
      }
      if (body.projectId !== null && body.projectId !== '') {
        const project = findProject(store, body.projectId);
        if (!project) { sendJson(res, 404, { error: 'Project not found' }); return true; }
        task.projectId = project.id;
      } else {
        task.projectId = undefined;
      }
      task.updatedAt = new Date().toISOString();
    }

    if (body.status) {
      const unresolved = statusRequiresResolvedDependencies(body.status) ? getUnresolvedDependencies(store, task) : [];
      if (unresolved.length > 0) {
        sendJson(res, 409, {
          error: 'Task is blocked by unresolved dependencies',
          unresolvedDependencies: unresolved.map(dep => ({ id: dep.id, title: dep.title, status: dep.status })),
        });
        return true;
      }
      task.status = body.status;
      task.updatedAt = new Date().toISOString();
    }

    writeStore(store);
    sendJson(res, 200, enrichTask(store, task));
    return true;
  }
}
