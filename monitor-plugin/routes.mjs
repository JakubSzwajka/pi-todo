import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const STORE_PATH = join(homedir(), '.pi', '.pi-todo.json');

function sanitizeTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: typeof task.description === 'string' ? task.description : undefined,
    parentId: typeof task.parentId === 'string' ? task.parentId : undefined,
    dependsOnIds: Array.isArray(task.dependsOnIds)
      ? [...new Set(task.dependsOnIds.filter(id => typeof id === 'string'))]
      : [],
    tags: Array.isArray(task.tags) ? task.tags.filter(tag => typeof tag === 'string') : [],
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    log: Array.isArray(task.log)
      ? task.log.filter(entry => entry && typeof entry.at === 'string' && typeof entry.text === 'string' && (entry.author === 'kuba' || entry.author === 'pi'))
      : [],
  };
}

function sanitizeStore(store) {
  return {
    tasks: Array.isArray(store?.tasks) ? store.tasks.filter(Boolean).map(sanitizeTask) : [],
  };
}

function readStore() {
  if (!existsSync(STORE_PATH)) return { tasks: [] };
  try { return sanitizeStore(JSON.parse(readFileSync(STORE_PATH, 'utf8'))); }
  catch { return { tasks: [] }; }
}

function writeStore(store) {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(sanitizeStore(store), null, 2), 'utf8');
}

function findTask(store, id) {
  return store.tasks.find(task => task.id === id || task.id.startsWith(id));
}

function getUnresolvedDependencies(store, task) {
  const ids = Array.isArray(task.dependsOnIds) ? task.dependsOnIds : [];
  return ids
    .map(id => findTask(store, id))
    .filter(Boolean)
    .filter(dependency => dependency.status !== 'done');
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
    if (dependency.parentId !== task.parentId) {
      return `Dependency #${dependency.id} must share the same parent as #${task.id}`;
    }
  }

  return null;
}

export default async function routes(req, res, url, { sendJson, readBody }) {
  // GET /api/pi-todo/tasks
  if (req.method === 'GET' && url.pathname === '/api/pi-todo/tasks') {
    sendJson(res, 200, readStore().tasks);
    return true;
  }

  // PATCH /api/pi-todo/tasks/:id  — update status / dependencies
  if (req.method === 'PATCH' && url.pathname.startsWith('/api/pi-todo/tasks/')) {
    const id = url.pathname.split('/').pop();
    const body = await readBody(req);
    const store = readStore();
    const task = store.tasks.find(t => t.id === id);
    if (!task) { sendJson(res, 404, { error: 'Task not found' }); return true; }
    if (body.dependsOnIds !== undefined) {
      const dependencyError = validateDependsOnIds(store, task, body.dependsOnIds);
      if (dependencyError) {
        sendJson(res, 409, { error: dependencyError });
        return true;
      }
      task.dependsOnIds = [...new Set(body.dependsOnIds.map(id => String(id).trim()).filter(Boolean))];
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
    sendJson(res, 200, task);
    return true;
  }
}
