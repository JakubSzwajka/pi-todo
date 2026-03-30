async function parseJson(response) {
  return response.json().catch(() => null);
}

export async function fetchState() {
  const response = await fetch('/api/pi-todo/state');
  return response.json();
}

export async function createTask(payload) {
  const response = await fetch('/api/pi-todo/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { ok: response.ok, data: await parseJson(response) };
}

export async function updateTask(taskId, payload) {
  const response = await fetch(`/api/pi-todo/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { ok: response.ok, data: await parseJson(response) };
}

export async function deleteTask(taskId) {
  const response = await fetch(`/api/pi-todo/tasks/${taskId}`, { method: 'DELETE' });
  return { ok: response.ok, data: await parseJson(response) };
}

export async function createProject(payload) {
  const response = await fetch('/api/pi-todo/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { ok: response.ok, data: await parseJson(response) };
}

export async function updateProject(projectId, payload) {
  const response = await fetch(`/api/pi-todo/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { ok: response.ok, data: await parseJson(response) };
}

export async function deleteProject(projectId) {
  const response = await fetch(`/api/pi-todo/projects/${projectId}`, { method: 'DELETE' });
  return { ok: response.ok, data: await parseJson(response) };
}
