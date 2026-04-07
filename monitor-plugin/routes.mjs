import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const OBSIDIAN = '/usr/local/bin/obsidian';
const TASKS_PATH = 'tasks';
const PROJECTS_PATH = 'tasks/projects';

// ---------------------------------------------------------------------------
// Obsidian CLI helpers
// ---------------------------------------------------------------------------

async function obsRun(args) {
  const { stdout } = await execFile(OBSIDIAN, args, { timeout: 5000 });
  return stdout;
}

async function obsSearch(query, opts = {}) {
  const args = ['search', `query=${query}`, 'format=json'];
  if (opts.path) args.push(`path=${opts.path}`);
  const out = (await obsRun(args)).trim();
  if (!out || out === 'No matches found.') return [];
  return JSON.parse(out);
}

async function obsRead(path) { return obsRun(['read', `path=${path}`]); }

async function obsCreate(name, path, content) {
  await obsRun(['create', `name=${name}`, `path=${path}`, `content=${content}`]);
}

async function obsDelete(path) { await obsRun(['delete', `path=${path}`, 'permanent']); }

async function obsProperties(path) {
  const out = (await obsRun(['properties', `path=${path}`, 'format=json'])).trim();
  if (!out || out === 'No frontmatter found.') return {};
  return JSON.parse(out);
}

async function obsPropertySet(path, name, value, type) {
  const args = ['property:set', `path=${path}`, `name=${name}`, `value=${Array.isArray(value) ? JSON.stringify(value) : String(value)}`];
  if (type) args.push(`type=${type}`);
  await obsRun(args);
}

async function obsAppend(path, content) {
  await obsRun(['append', `path=${path}`, `content=${content}`]);
}

// ---------------------------------------------------------------------------
// Kanban board sync
// ---------------------------------------------------------------------------

const KANBAN_PATH = `${TASKS_PATH}/Kanban.md`;

async function readKanban() {
  try { return await obsRead(KANBAN_PATH); } catch { return null; }
}

async function writeKanban(content) {
  try { await obsDelete(KANBAN_PATH); } catch { /* may not exist */ }
  await obsCreate('Kanban', TASKS_PATH, content);
}

function removeCardFromContent(content, slug) {
  return content.split('\n').filter(l => !l.includes(`[[${slug}]]`)).join('\n');
}

function insertCardInColumn(content, card, status) {
  const lines = content.split('\n');
  const idx = lines.findIndex(l => l.trim() === `## ${status}`);
  if (idx === -1) return content;
  let insertAt = idx + 1;
  while (insertAt < lines.length && (lines[insertAt].startsWith('- [ ]') || lines[insertAt].trim() === '')) {
    if (lines[insertAt].trim() === '' && insertAt === idx + 1) { insertAt++; continue; }
    if (lines[insertAt].trim() === '') break;
    insertAt++;
  }
  lines.splice(insertAt, 0, card);
  return lines.join('\n');
}

async function kanbanAddCard(slug, status) {
  const content = await readKanban();
  if (!content || content.includes(`[[${slug}]]`)) return;
  await writeKanban(insertCardInColumn(content, `- [ ] [[${slug}]]`, status));
}

async function kanbanMoveCard(slug, fromStatus, toStatus) {
  if (fromStatus === toStatus) return;
  const content = await readKanban();
  if (!content) return;
  const without = removeCardFromContent(content, slug);
  await writeKanban(insertCardInColumn(without, `- [ ] [[${slug}]]`, toStatus));
}

async function kanbanRemoveCard(slug) {
  const content = await readKanban();
  if (!content || !content.includes(`[[${slug}]]`)) return;
  await writeKanban(removeCardFromContent(content, slug));
}

// ---------------------------------------------------------------------------
// Slug / path helpers
// ---------------------------------------------------------------------------

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'untitled';
}

function slugFromPath(p) {
  return p.replace(/^.*\//, '').replace(/\.md$/, '');
}

function taskPath(slug) { return `${TASKS_PATH}/${slug}.md`; }
function projectPath(slug) { return `${PROJECTS_PATH}/${slug}.md`; }

// ---------------------------------------------------------------------------
// Markdown parsing helpers (plain JS port of src/markdown.ts)
// ---------------------------------------------------------------------------

const LOG_RE = /^- \*\*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) \(([^)]+)\):\*\* (.+)$/;

function parseLogEntries(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(LOG_RE);
    if (m) entries.push({ at: new Date(`${m[1].replace(' ', 'T')}:00Z`).toISOString(), author: m[2], text: m[3] });
  }
  return entries;
}

function parseTaskBody(content) {
  const body = content.replace(/^---[\s\S]*?---\s*/, '');
  const logIdx = body.indexOf('## Log');
  const description = (logIdx >= 0 ? body.slice(0, logIdx).trim() : body.trim()) || undefined;
  const log = parseLogEntries(logIdx >= 0 ? body.slice(logIdx) : '');
  return { description, log };
}

function taskFromMarkdown(slug, content, props) {
  const { description, log } = parseTaskBody(content);
  const rawTags = Array.isArray(props.tags) ? props.tags : [];
  const tags = rawTags.filter(t => t !== 'type/task');
  const dependsRaw = props.depends;
  const dependsOnIds = Array.isArray(dependsRaw) && dependsRaw.length > 0 ? dependsRaw : undefined;
  return {
    id: slug,
    title: String(props.title ?? ''),
    description,
    status: props.status ?? 'open',
    projectId: props.project ? String(props.project) : undefined,
    parentId: props.parent ? String(props.parent) : undefined,
    dependsOnIds,
    tags,
    createdAt: String(props.created ?? new Date().toISOString()),
    updatedAt: String(props.updated ?? new Date().toISOString()),
    log,
  };
}

const REPO_RE = /^- \*\*([^*]+)\*\* \(([^,)]+)(?:,\s*primary)?\):\s*`([^`]+)`$/;

function projectFromMarkdown(slug, content, props) {
  const repos = [];
  const body = content.replace(/^---[\s\S]*?---\s*/, '');
  for (const line of body.split('\n')) {
    const m = line.trim().match(REPO_RE);
    if (m) {
      const isPrimary = m[0].includes(', primary');
      const repo = { id: slugify(m[1]), label: m[1], kind: m[2], primary: isPrimary || undefined };
      if (m[2] === 'local') repo.path = m[3]; else repo.url = m[3];
      repos.push(repo);
    }
  }
  return {
    id: slug,
    name: String(props.name ?? slug),
    description: props.description ? String(props.description) : undefined,
    repos,
    createdAt: String(props.created ?? new Date().toISOString()),
    updatedAt: String(props.updated ?? new Date().toISOString()),
    archived: props.archived === true ? true : undefined,
  };
}

// ---------------------------------------------------------------------------
// Markdown serialization helpers (plain JS port of src/markdown.ts)
// ---------------------------------------------------------------------------

function yamlQuote(val) { return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; }
function yamlArray(items) { return items.map(i => `  - ${i}`).join('\n'); }
function fmLine(key, value, quote = false) {
  if (value === undefined || value === '') return '';
  if (typeof value === 'boolean') return `${key}: ${value}`;
  return quote ? `${key}: ${yamlQuote(value)}` : `${key}: ${value}`;
}

function formatLogEntry(entry) {
  const d = new Date(entry.at);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `- **${yyyy}-${mm}-${dd} ${hh}:${mi} (${entry.author}):** ${entry.text}`;
}

function taskToMarkdown(task) {
  const tags = ['type/task', ...task.tags.filter(t => t !== 'type/task')];
  const lines = ['---'];
  lines.push('type: task');
  lines.push(fmLine('title', task.title, true));
  lines.push(fmLine('status', task.status));
  if (task.projectId) lines.push(fmLine('project', task.projectId));
  if (task.parentId) lines.push(fmLine('parent', task.parentId));
  if (task.dependsOnIds && task.dependsOnIds.length > 0) {
    lines.push('depends:');
    lines.push(yamlArray(task.dependsOnIds));
  }
  lines.push('tags:');
  lines.push(yamlArray(tags));
  lines.push(fmLine('created', task.createdAt));
  lines.push(fmLine('updated', task.updatedAt));
  lines.push('---');

  const body = [''];
  if (task.description) { body.push(task.description); body.push(''); }
  body.push('## Log');
  body.push('');
  if (task.log.length > 0) {
    const sorted = [...task.log].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    for (const entry of sorted) body.push(formatLogEntry(entry));
    body.push('');
  }
  return lines.join('\n') + body.join('\n');
}

function formatRepo(repo) {
  const primaryTag = repo.primary ? ', primary' : '';
  const target = repo.kind === 'local' ? (repo.path ?? '') : (repo.url ?? '');
  return `- **${repo.label}** (${repo.kind}${primaryTag}): \`${target}\``;
}

function projectToMarkdown(project) {
  const lines = ['---'];
  lines.push('type: project');
  lines.push(fmLine('name', project.name, true));
  if (project.description) lines.push(fmLine('description', project.description, true));
  if (project.archived) lines.push(fmLine('archived', true));
  lines.push('tags:');
  lines.push(yamlArray(['type/project']));
  lines.push(fmLine('created', project.createdAt));
  lines.push(fmLine('updated', project.updatedAt));
  lines.push('---');

  const body = [''];
  body.push('## Repos');
  body.push('');
  if (project.repos.length > 0) {
    for (const repo of project.repos) body.push(formatRepo(repo));
  } else {
    body.push('No repos configured.');
  }
  body.push('');
  return lines.join('\n') + body.join('\n');
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

async function readTask(slug) {
  const p = taskPath(slug);
  const [content, props] = await Promise.all([obsRead(p), obsProperties(p)]);
  return taskFromMarkdown(slug, content, props);
}

async function readProject(slug) {
  const p = projectPath(slug);
  const [content, props] = await Promise.all([obsRead(p), obsProperties(p)]);
  return projectFromMarkdown(slug, content, props);
}

async function findTask(id) {
  try { return await readTask(id); } catch { /* not found */ }
  const paths = await obsSearch('tag:type/task', { path: TASKS_PATH });
  const match = paths.find(p => slugFromPath(p).startsWith(id));
  if (!match) return undefined;
  return readTask(slugFromPath(match));
}

async function findProject(id) {
  const normalized = slugify(id);
  try { return await readProject(normalized); } catch { /* not found */ }
  const paths = await obsSearch('tag:type/project', { path: PROJECTS_PATH });
  const match = paths.find(p => slugFromPath(p).startsWith(normalized));
  if (!match) return undefined;
  return readProject(slugFromPath(match));
}

// ---------------------------------------------------------------------------
// Task project resolution
// ---------------------------------------------------------------------------

async function getTaskProjectId(task) {
  if (task.projectId) return task.projectId;
  if (!task.parentId) return undefined;
  const parent = await findTask(task.parentId);
  return parent?.projectId;
}

async function getTaskProject(task) {
  const projectId = await getTaskProjectId(task);
  return projectId ? findProject(projectId) : undefined;
}

async function enrichTask(task) {
  const [project, effectiveProjectId] = await Promise.all([
    getTaskProject(task),
    getTaskProjectId(task),
  ]);
  return { ...task, project: project ?? null, effectiveProjectId };
}

// ---------------------------------------------------------------------------
// Dependency helpers
// ---------------------------------------------------------------------------

function statusRequiresResolvedDependencies(status) {
  return ['in_progress', 'review', 'testing', 'done'].includes(status);
}

async function getUnresolvedDependencies(task) {
  const ids = Array.isArray(task.dependsOnIds) ? task.dependsOnIds : [];
  const deps = (await Promise.all(ids.map(id => findTask(id)))).filter(Boolean);
  return deps.filter(d => d.status !== 'done');
}

async function validateDependsOnIds(task, dependsOnIds) {
  const normalized = Array.isArray(dependsOnIds)
    ? [...new Set(dependsOnIds.map(id => String(id).trim()).filter(Boolean))]
    : [];
  if (normalized.includes(task.id)) return 'A task cannot depend on itself';
  for (const depId of normalized) {
    const dep = await findTask(depId);
    if (!dep) return `Dependency task not found: ${depId}`;
    if (dep.id === task.id) return 'A task cannot depend on itself';
    if (dep.parentId !== task.parentId) return `Dependency #${dep.id} must share the same parent as #${task.id}`;
    const depProjId = await getTaskProjectId(dep);
    const taskProjId = await getTaskProjectId(task);
    if ((depProjId ?? '') !== (taskProjId ?? '')) {
      return `Dependency #${dep.id} must share the same effective project as #${task.id}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Slug deduplication
// ---------------------------------------------------------------------------

async function uniqueSlug(base, pathPrefix) {
  const candidate = slugify(base);
  try { await obsRead(`${pathPrefix}/${candidate}.md`); } catch { return candidate; }
  let i = 2;
  while (true) {
    const next = `${candidate}-${i}`;
    try { await obsRead(`${pathPrefix}/${next}.md`); i++; } catch { return next; }
  }
}

// ---------------------------------------------------------------------------
// Project normalization (sync, no I/O)
// ---------------------------------------------------------------------------

function normalizeRepo(repo, fallbackLabel = 'repo') {
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

function normalizeProjectPayload(body, existing = undefined) {
  const repos = Array.isArray(body.repos)
    ? body.repos.map((r, i) => normalizeRepo(r, `repo-${i + 1}`)).filter(Boolean)
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

async function validateProjectPayload(project, currentId) {
  if (!project.id) return 'Project id is required';
  if (!project.name) return 'Project name is required';
  if (project.id !== currentId) {
    try { await readProject(project.id); return `Project already exists: ${project.id}`; } catch { /* good */ }
  }
  if (project.repos.filter(r => r.primary).length > 1) return 'Only one repo can be marked primary';
  return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export default async function routes(req, res, url, { sendJson, readBody }) {

  // ---- GET /api/pi-todo/state ----
  if (req.method === 'GET' && url.pathname === '/api/pi-todo/state') {
    const [taskPaths, projPaths] = await Promise.all([
      obsSearch('tag:type/task', { path: TASKS_PATH }),
      obsSearch('tag:type/project', { path: PROJECTS_PATH }),
    ]);

    const [tasks, projects] = await Promise.all([
      Promise.all(taskPaths.map(async p => {
        const slug = slugFromPath(p);
        const [content, props] = await Promise.all([obsRead(p), obsProperties(p)]);
        return taskFromMarkdown(slug, content, props);
      })),
      Promise.all(projPaths.map(async p => {
        const slug = slugFromPath(p);
        const [content, props] = await Promise.all([obsRead(p), obsProperties(p)]);
        return projectFromMarkdown(slug, content, props);
      })),
    ]);

    const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));

    const enriched = tasks.map(task => {
      let effectiveProjectId = task.projectId;
      if (!effectiveProjectId && task.parentId) {
        effectiveProjectId = taskMap[task.parentId]?.projectId;
      }
      const project = effectiveProjectId ? (projectMap[effectiveProjectId] ?? null) : null;
      return { ...task, project, effectiveProjectId };
    });

    sendJson(res, 200, { projects, tasks: enriched });
    return true;
  }

  // ---- GET /api/pi-todo/projects ----
  if (req.method === 'GET' && url.pathname === '/api/pi-todo/projects') {
    const paths = await obsSearch('tag:type/project', { path: PROJECTS_PATH });
    const projects = await Promise.all(paths.map(async p => {
      const slug = slugFromPath(p);
      return readProject(slug);
    }));
    sendJson(res, 200, projects);
    return true;
  }

  // ---- POST /api/pi-todo/projects ----
  if (req.method === 'POST' && url.pathname === '/api/pi-todo/projects') {
    const body = await readBody(req);
    const project = normalizeProjectPayload(body);
    const error = await validateProjectPayload(project);
    if (error) { sendJson(res, 409, { error }); return true; }
    await obsCreate(project.id, PROJECTS_PATH, projectToMarkdown(project));
    sendJson(res, 200, project);
    return true;
  }

  // ---- PATCH /api/pi-todo/projects/:id ----
  if (req.method === 'PATCH' && url.pathname.startsWith('/api/pi-todo/projects/')) {
    const id = url.pathname.split('/').pop();
    const body = await readBody(req);
    const existing = await findProject(id);
    if (!existing) { sendJson(res, 404, { error: 'Project not found' }); return true; }
    const next = normalizeProjectPayload(body, existing);
    const error = await validateProjectPayload(next, existing.id);
    if (error) { sendJson(res, 409, { error }); return true; }
    const previousId = existing.id;

    // Rewrite the project file
    await obsDelete(projectPath(previousId));
    await obsCreate(next.id, PROJECTS_PATH, projectToMarkdown(next));

    // Update task references if project ID changed
    if (previousId !== next.id) {
      const taskPaths = await obsSearch('tag:type/task', { path: TASKS_PATH });
      for (const tp of taskPaths) {
        const props = await obsProperties(tp);
        if (props.project === previousId) {
          await obsPropertySet(tp, 'project', next.id);
          await obsPropertySet(tp, 'updated', new Date().toISOString());
        }
      }
    }

    sendJson(res, 200, next);
    return true;
  }

  // ---- DELETE /api/pi-todo/projects/:id ----
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/pi-todo/projects/')) {
    const id = url.pathname.split('/').pop();
    const project = await findProject(id);
    if (!project) { sendJson(res, 404, { error: 'Project not found' }); return true; }

    // Check if tasks reference this project
    const taskPaths = await obsSearch('tag:type/task', { path: TASKS_PATH });
    for (const tp of taskPaths) {
      const props = await obsProperties(tp);
      if (props.project === project.id) {
        sendJson(res, 409, { error: 'Cannot delete project while tasks still reference it' });
        return true;
      }
    }

    await obsDelete(projectPath(project.id));
    sendJson(res, 200, { ok: true });
    return true;
  }

  // ---- GET /api/pi-todo/tasks ----
  if (req.method === 'GET' && url.pathname === '/api/pi-todo/tasks') {
    const paths = await obsSearch('tag:type/task', { path: TASKS_PATH });
    const tasks = await Promise.all(paths.map(async p => readTask(slugFromPath(p))));
    const enriched = await Promise.all(tasks.map(t => enrichTask(t)));
    sendJson(res, 200, enriched);
    return true;
  }

  // ---- POST /api/pi-todo/tasks ----
  if (req.method === 'POST' && url.pathname === '/api/pi-todo/tasks') {
    const body = await readBody(req);
    if (!body || typeof body.title !== 'string' || !body.title.trim()) {
      sendJson(res, 400, { error: 'title is required' });
      return true;
    }

    const at = new Date().toISOString();
    let projectId = undefined;
    let parentId = undefined;

    if (typeof body.parentId === 'string' && body.parentId.trim()) {
      const parent = await findTask(body.parentId.trim());
      if (!parent) { sendJson(res, 404, { error: `Parent task not found: ${body.parentId}` }); return true; }
      parentId = parent.id;
    }

    if (!parentId && typeof body.projectId === 'string' && body.projectId.trim()) {
      const project = await findProject(body.projectId.trim());
      if (!project) { sendJson(res, 404, { error: `Project not found: ${body.projectId}` }); return true; }
      projectId = project.id;
    }

    const tags = Array.isArray(body.tags)
      ? [...new Set(body.tags.map(t => String(t).trim()).filter(Boolean))]
      : [];

    const dependsOnIds = Array.isArray(body.dependsOnIds)
      ? [...new Set(body.dependsOnIds.map(d => String(d).trim()).filter(Boolean))]
      : [];

    const slug = await uniqueSlug(slugify(body.title.trim()), TASKS_PATH);
    const task = {
      id: slug,
      title: body.title.trim(),
      description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : undefined,
      parentId,
      projectId,
      tags,
      dependsOnIds: dependsOnIds.length > 0 ? dependsOnIds : undefined,
      status: 'open',
      createdAt: at,
      updatedAt: at,
      log: [],
    };

    if (parentId && dependsOnIds.length > 0) {
      const depError = await validateDependsOnIds(task, dependsOnIds);
      if (depError) { sendJson(res, 409, { error: depError }); return true; }
    }

    await obsCreate(slug, TASKS_PATH, taskToMarkdown(task));
    await kanbanAddCard(slug, 'open');
    const enriched = await enrichTask(task);
    sendJson(res, 200, enriched);
    return true;
  }

  // ---- DELETE /api/pi-todo/tasks/:id ----
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/pi-todo/tasks/')) {
    const id = url.pathname.split('/').pop();
    const task = await findTask(id);
    if (!task) { sendJson(res, 404, { error: 'Task not found' }); return true; }

    // Delete subtasks
    const allPaths = await obsSearch('tag:type/task', { path: TASKS_PATH });
    for (const tp of allPaths) {
      const props = await obsProperties(tp);
      if (props.parent === task.id) {
        await obsDelete(tp);
      }
    }

    // Clean up dependency references
    for (const tp of allPaths) {
      const props = await obsProperties(tp);
      if (Array.isArray(props.depends) && props.depends.includes(task.id)) {
        const newDeps = props.depends.filter(d => d !== task.id);
        await obsPropertySet(tp, 'depends', newDeps, 'list');
        await obsPropertySet(tp, 'updated', new Date().toISOString());
      }
    }

    await obsDelete(taskPath(task.id));
    await kanbanRemoveCard(task.id);
    sendJson(res, 200, { ok: true, deleted: task });
    return true;
  }

  // ---- PATCH /api/pi-todo/tasks/:id ----
  if (req.method === 'PATCH' && url.pathname.startsWith('/api/pi-todo/tasks/')) {
    const id = url.pathname.split('/').pop();
    const body = await readBody(req);
    const task = await findTask(id);
    if (!task) { sendJson(res, 404, { error: 'Task not found' }); return true; }

    const p = taskPath(task.id);

    if (body.dependsOnIds !== undefined) {
      const depError = await validateDependsOnIds(task, body.dependsOnIds);
      if (depError) { sendJson(res, 409, { error: depError }); return true; }
      const newDeps = [...new Set(body.dependsOnIds.map(d => String(d).trim()).filter(Boolean))];
      task.dependsOnIds = newDeps.length > 0 ? newDeps : undefined;
      await obsPropertySet(p, 'depends', newDeps, 'list');
      await obsPropertySet(p, 'updated', new Date().toISOString());
    }

    if (body.projectId !== undefined) {
      if (task.parentId) {
        sendJson(res, 400, { error: 'Child tasks inherit project from parent' });
        return true;
      }
      if (body.projectId !== null && body.projectId !== '') {
        const project = await findProject(body.projectId);
        if (!project) { sendJson(res, 404, { error: 'Project not found' }); return true; }
        task.projectId = project.id;
        await obsPropertySet(p, 'project', project.id);
      } else {
        task.projectId = undefined;
        await obsPropertySet(p, 'project', '');
      }
      await obsPropertySet(p, 'updated', new Date().toISOString());
    }

    if (body.tags !== undefined) {
      task.tags = Array.isArray(body.tags)
        ? [...new Set(body.tags.map(t => String(t).trim()).filter(Boolean))]
        : [];
      const allTags = ['type/task', ...task.tags];
      await obsPropertySet(p, 'tags', allTags, 'list');
      await obsPropertySet(p, 'updated', new Date().toISOString());
    }

    if (body.addTag !== undefined) {
      const tag = String(body.addTag).trim();
      if (tag && !task.tags.includes(tag)) task.tags = [...task.tags, tag];
      const allTags = ['type/task', ...task.tags];
      await obsPropertySet(p, 'tags', allTags, 'list');
      await obsPropertySet(p, 'updated', new Date().toISOString());
    }

    if (body.removeTag !== undefined) {
      const tag = String(body.removeTag).trim();
      task.tags = task.tags.filter(t => t !== tag);
      const allTags = ['type/task', ...task.tags];
      await obsPropertySet(p, 'tags', allTags, 'list');
      await obsPropertySet(p, 'updated', new Date().toISOString());
    }

    if (body.status) {
      const unresolved = statusRequiresResolvedDependencies(body.status)
        ? await getUnresolvedDependencies(task) : [];
      if (unresolved.length > 0) {
        sendJson(res, 409, {
          error: 'Task is blocked by unresolved dependencies',
          unresolvedDependencies: unresolved.map(dep => ({ id: dep.id, title: dep.title, status: dep.status })),
        });
        return true;
      }
      const prevStatus = task.status;
      task.status = body.status;
      await kanbanMoveCard(task.id, prevStatus, body.status);
      await obsPropertySet(p, 'status', body.status);
      await obsPropertySet(p, 'updated', new Date().toISOString());
    }

    // Re-read the task to get the final state
    const updated = await readTask(task.id);
    const enriched = await enrichTask(updated);
    sendJson(res, 200, enriched);
    return true;
  }
}
