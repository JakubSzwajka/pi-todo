import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STORE_PATH = join(homedir(), '.pi', '.pi-todo.json');

function readStore() {
  if (!existsSync(STORE_PATH)) return { tasks: [] };
  try { return JSON.parse(readFileSync(STORE_PATH, 'utf8')); }
  catch { return { tasks: [] }; }
}

function writeStore(store) {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export default async function routes(req, res, url, { sendJson, readBody }) {
  // GET /api/pi-todo/tasks
  if (req.method === 'GET' && url.pathname === '/api/pi-todo/tasks') {
    return sendJson(res, 200, readStore().tasks);
  }

  // PATCH /api/pi-todo/tasks/:id  — update status
  if (req.method === 'PATCH' && url.pathname.startsWith('/api/pi-todo/tasks/')) {
    const id = url.pathname.split('/').pop();
    const body = await readBody(req);
    const store = readStore();
    const task = store.tasks.find(t => t.id === id);
    if (!task) return sendJson(res, 404, { error: 'Task not found' });
    if (body.status) {
      task.status = body.status;
      task.updatedAt = new Date().toISOString();
    }
    writeStore(store);
    return sendJson(res, 200, task);
  }
}
