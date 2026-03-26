import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STORE_PATH = join(homedir(), '.pi', '.pi-todo.json');

function sanitizeTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: typeof task.description === 'string' ? task.description : undefined,
    parentId: typeof task.parentId === 'string' ? task.parentId : undefined,
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
  writeFileSync(STORE_PATH, JSON.stringify(sanitizeStore(store), null, 2), 'utf8');
}

export default async function routes(req, res, url, { sendJson, readBody }) {
  // GET /api/pi-todo/tasks
  if (req.method === 'GET' && url.pathname === '/api/pi-todo/tasks') {
    sendJson(res, 200, readStore().tasks);
    return true;
  }

  // PATCH /api/pi-todo/tasks/:id  — update status
  if (req.method === 'PATCH' && url.pathname.startsWith('/api/pi-todo/tasks/')) {
    const id = url.pathname.split('/').pop();
    const body = await readBody(req);
    const store = readStore();
    const task = store.tasks.find(t => t.id === id);
    if (!task) { sendJson(res, 404, { error: 'Task not found' }); return true; }
    if (body.status) {
      task.status = body.status;
      task.updatedAt = new Date().toISOString();
    }
    writeStore(store);
    sendJson(res, 200, task);
    return true;
  }
}
