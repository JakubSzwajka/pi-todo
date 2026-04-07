import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from '../tests/yaml-helpers.js';

// ---------------------------------------------------------------------------
// In-memory Obsidian CLI mock
// ---------------------------------------------------------------------------

/** Virtual filesystem: path → content */
const vfs = new Map<string, string>();

/** Parse YAML frontmatter from markdown content. */
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  return parseYaml(match[1]!);
}

vi.mock('../src/obsidian.js', () => ({
  VAULT_PATH: '/mock/vault',
  TASKS_PATH: 'tasks',
  PROJECTS_PATH: 'tasks/projects',

  vaultRelativePath: (p: string) => p,

  ensureObsidian: vi.fn(async () => {}),

  obsidianSearch: vi.fn(async (query: string, opts?: { path?: string }) => {
    const results: string[] = [];
    for (const [path, content] of vfs) {
      if (opts?.path && !path.startsWith(opts.path + '/')) continue;
      // Simple tag search: check if tag appears in frontmatter tags
      const tagMatch = query.match(/^tag:(.+)$/);
      if (tagMatch) {
        const fm = parseFrontmatter(content);
        const tags = Array.isArray(fm.tags) ? fm.tags : [];
        if (tags.includes(tagMatch[1])) results.push(path);
      }
    }
    return results;
  }),

  obsidianRead: vi.fn(async (path: string) => {
    const content = vfs.get(path);
    if (content === undefined) throw new Error(`File not found: ${path}`);
    return content;
  }),

  obsidianCreate: vi.fn(async (name: string, dir: string, content: string) => {
    const path = dir ? `${dir}/${name}.md` : `${name}.md`;
    if (vfs.has(path)) throw new Error(`Error: File already exists: ${path}`);
    vfs.set(path, content);
  }),

  obsidianAppend: vi.fn(async (path: string, content: string) => {
    const existing = vfs.get(path);
    if (existing === undefined) throw new Error(`File not found: ${path}`);
    vfs.set(path, existing + content);
  }),

  obsidianDelete: vi.fn(async (path: string) => {
    if (!vfs.has(path)) throw new Error(`File not found: ${path}`);
    vfs.delete(path);
  }),

  obsidianPropertySet: vi.fn(async (path: string, name: string, value: unknown, _type?: string) => {
    const content = vfs.get(path);
    if (!content) throw new Error(`File not found: ${path}`);
    const fm = parseFrontmatter(content);
    fm[name] = value;
    // Rebuild frontmatter in content
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
    const yamlLines = Object.entries(fm).map(([k, v]) => {
      if (Array.isArray(v)) return `${k}:\n${v.map(i => `  - ${i}`).join('\n')}`;
      if (typeof v === 'boolean') return `${k}: ${v}`;
      if (typeof v === 'string' && (v.includes(':') || v.includes('"'))) return `${k}: "${v}"`;
      return `${k}: ${v}`;
    });
    vfs.set(path, `---\n${yamlLines.join('\n')}\n---\n${body}`);
  }),

  obsidianPropertyRead: vi.fn(async (path: string, name: string) => {
    const content = vfs.get(path);
    if (!content) throw new Error(`File not found: ${path}`);
    const fm = parseFrontmatter(content);
    return String(fm[name] ?? '');
  }),

  obsidianBacklinks: vi.fn(async () => []),

  obsidianProperties: vi.fn(async (path: string) => {
    const content = vfs.get(path);
    if (!content) throw new Error(`File not found: ${path}`);
    return parseFrontmatter(content);
  }),
}));

// Import store AFTER mocking obsidian
import {
  addProject,
  addTask,
  appendLog,
  deleteProject,
  deleteTask,
  findProject,
  findTask,
  getProject,
  getTask,
  getUnresolvedDependencies,
  listTasks,
  statusRequiresResolvedDependencies,
  updateTask,
  updateTaskProperty,
} from '../src/store.js';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('pi-todo store (mocked Obsidian)', () => {
  beforeEach(() => {
    vfs.clear();
    // Seed the Kanban board so kanban sync doesn't fail
    vfs.set('Kanban.md', [
      '---', 'kanban-plugin: basic', '---', '',
      '## open', '', '## in_progress', '', '## review', '',
      '## testing', '', '## waiting', '', '## done', '', '## cancelled', '',
    ].join('\n'));
  });

  afterEach(() => {
    vfs.clear();
  });

  // 1. Task CRUD round-trip
  it('task CRUD: add → get → update → delete', async () => {
    const task = await addTask({ title: 'Test task', description: 'A test task', tags: ['backend'] });

    expect(task.id).toBeTruthy();
    expect(task.title).toBe('Test task');
    expect(task.status).toBe('open');
    expect(task.tags).toContain('backend');

    const fetched = await getTask(task.id);
    expect(fetched.title).toBe('Test task');
    expect(fetched.status).toBe('open');
    expect(fetched.description).toBe('A test task');

    const updated = await updateTask(task.id, { status: 'in_progress' });
    expect(updated.status).toBe('in_progress');

    await deleteTask(task.id);
    const gone = await findTask(task.id);
    expect(gone).toBeUndefined();
  });

  // 2. Wikilinks preserved
  it('preserves wikilinks in description', async () => {
    const task = await addTask({
      title: 'Wikilink test',
      description: 'Implement using [[saga-pattern]] for reliability',
    });

    const fetched = await getTask(task.id);
    expect(fetched.description).toContain('[[saga-pattern]]');
  });

  // 3. Log append
  it('appendLog adds entries readable via getTask', async () => {
    const task = await addTask({ title: 'Log test' });
    const now = new Date().toISOString();

    await appendLog(task.id, { at: now, author: 'pi', text: 'Started investigation' });
    await appendLog(task.id, { at: now, author: 'kuba', text: 'Reviewed approach' });
    await appendLog(task.id, { at: now, author: 'pi', text: 'Implementation complete' });

    const fetched = await getTask(task.id);
    expect(fetched.log.length).toBe(3);
    expect(fetched.log.map((l) => l.author)).toContain('kuba');
    expect(fetched.log.map((l) => l.text)).toContain('Implementation complete');
  });

  // 4. Parent-child
  it('parent-child: child listed under parent', async () => {
    const parent = await addTask({ title: 'Parent task' });
    const child = await addTask({ title: 'Child task', parentId: parent.id });

    expect(child.parentId).toBe(parent.id);

    const children = await listTasks({ parent: parent.id });
    expect(children.length).toBeGreaterThanOrEqual(1);
    expect(children.some((t) => t.id === child.id)).toBe(true);
  });

  // 5. Dependencies
  it('dependencies: getUnresolvedDependencies returns undone deps', async () => {
    const parent = await addTask({ title: 'Dep parent' });
    const depA = await addTask({ title: 'Dep A', parentId: parent.id });
    const depB = await addTask({ title: 'Dep B', parentId: parent.id });
    const main = await addTask({
      title: 'Dep main',
      parentId: parent.id,
      dependsOnIds: [depA.id, depB.id],
    });

    const unresolved = await getUnresolvedDependencies(main);
    expect(unresolved.length).toBe(2);

    await updateTask(depA.id, { status: 'done' });
    const afterOne = await getUnresolvedDependencies(await getTask(main.id));
    expect(afterOne.length).toBe(1);
    expect(afterOne[0]!.id).toBe(depB.id);

    expect(statusRequiresResolvedDependencies('in_progress')).toBe(true);
    expect(statusRequiresResolvedDependencies('open')).toBe(false);
  });

  // 6. Slug deduplication
  it('same title produces different slugs', async () => {
    const first = await addTask({ title: 'Duplicate title' });
    const second = await addTask({ title: 'Duplicate title' });

    expect(first.id).not.toBe(second.id);
    expect(second.id).toMatch(/-2$/);
  });

  // 7. Project CRUD
  it('project CRUD: add → get → delete', async () => {
    const project = await addProject({
      name: 'Test project',
      description: 'A test project',
      repos: [{ label: 'main', kind: 'local', path: '/tmp/test-repo' }],
    });

    expect(project.id).toBeTruthy();
    expect(project.name).toBe('Test project');

    const fetched = await getProject(project.id);
    expect(fetched.name).toBe('Test project');
    expect(fetched.repos.length).toBe(1);

    await deleteProject(project.id);
    const gone = await findProject(project.id);
    expect(gone).toBeUndefined();
  });

  // 8. Search filters
  it('listTasks filters by status and project', async () => {
    const projA = await addProject({ name: 'Filter A' });
    const projB = await addProject({ name: 'Filter B' });

    const taskOpenA = await addTask({ title: 'Open A', projectId: projA.id });
    const taskDoneA = await addTask({ title: 'Done A', projectId: projA.id });
    await updateTask(taskDoneA.id, { status: 'done' });

    const taskOpenB = await addTask({ title: 'Open B', projectId: projB.id });

    // Default list excludes done
    const defaultList = await listTasks();
    expect(defaultList.map((t) => t.id)).not.toContain(taskDoneA.id);

    // Filter by project (all=true to include done)
    const projATasks = await listTasks({ project: projA.id, all: true });
    expect(projATasks.map((t) => t.id)).toContain(taskOpenA.id);
    expect(projATasks.map((t) => t.id)).toContain(taskDoneA.id);
    expect(projATasks.map((t) => t.id)).not.toContain(taskOpenB.id);
  });

  // 9. Property update
  it('updateTaskProperty changes status', async () => {
    const task = await addTask({ title: 'Prop update test' });
    await updateTaskProperty(task.id, 'status', 'in_progress');

    const fetched = await getTask(task.id);
    expect(fetched.status).toBe('in_progress');
  });

  // 10. Kanban sync
  it('addTask adds card to Kanban, deleteTask removes it', async () => {
    const task = await addTask({ title: 'Kanban test' });
    const board = vfs.get('Kanban.md')!;
    expect(board).toContain(`[[${task.id}]]`);

    await deleteTask(task.id);
    const boardAfter = vfs.get('Kanban.md')!;
    expect(boardAfter).not.toContain(`[[${task.id}]]`);
  });
});
