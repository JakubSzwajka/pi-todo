import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  ensureObsidian,
  obsidianDelete,
  obsidianSearch,
} from '../src/obsidian.js';
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
// Helpers
// ---------------------------------------------------------------------------

// Note: slugify() strips leading underscores, so we use 'ztest-' which survives.
const TEST_PREFIX = 'ztest-';

function testTitle(name: string): string {
  return `${TEST_PREFIX}${name}-${Date.now()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanupTestArtifacts(): Promise<void> {
  const taskPaths = await obsidianSearch('tag:type/task', { path: 'tasks' });
  for (const p of taskPaths) {
    const fname = p.split('/').pop() ?? '';
    if (fname.startsWith(TEST_PREFIX)) {
      await obsidianDelete(p).catch(() => {});
    }
  }
  const projPaths = await obsidianSearch('tag:type/project', { path: 'tasks/projects' });
  for (const p of projPaths) {
    const fname = p.split('/').pop() ?? '';
    if (fname.startsWith(TEST_PREFIX)) {
      await obsidianDelete(p).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('pi-todo store (live Obsidian)', () => {
  // Guard: Obsidian must be running
  beforeAll(async () => {
    await ensureObsidian();
  }, 10_000);

  // Cleanup after every test
  afterEach(async () => {
    await cleanupTestArtifacts();
  }, 15_000);

  // 1. Obsidian guard
  it('ensureObsidian() should not throw when Obsidian is running', async () => {
    await expect(ensureObsidian()).resolves.toBeUndefined();
  }, 10_000);

  // 2. Task CRUD round-trip
  it('task CRUD: add → get → update → delete', async () => {
    const title = testTitle('crud');
    const task = await addTask({ title, description: 'A test task', tags: ['backend'] });

    expect(task.id).toBeTruthy();
    expect(task.title).toBe(title);
    expect(task.status).toBe('open');
    expect(task.description).toBe('A test task');
    expect(task.tags).toContain('backend');

    // getTask round-trip
    const fetched = await getTask(task.id);
    expect(fetched.id).toBe(task.id);
    expect(fetched.title).toBe(title);
    expect(fetched.status).toBe('open');
    expect(fetched.description).toBe('A test task');

    // updateTask — change status
    const updated = await updateTask(task.id, { status: 'in_progress' });
    expect(updated.status).toBe('in_progress');

    const refetched = await getTask(task.id);
    expect(refetched.status).toBe('in_progress');

    // deleteTask
    await deleteTask(task.id);
    const gone = await findTask(task.id);
    expect(gone).toBeUndefined();
  }, 30_000);

  // 3. Task with wikilinks
  it('preserves wikilinks in description', async () => {
    const title = testTitle('wikilink');
    const desc = 'Implement using [[saga-pattern]] for reliability';
    const task = await addTask({ title, description: desc });

    const fetched = await getTask(task.id);
    expect(fetched.description).toContain('[[saga-pattern]]');
  }, 15_000);

  // 4. Log append
  it('appendLog adds entries that are readable via getTask', async () => {
    const title = testTitle('log');
    const task = await addTask({ title });

    const entries = [
      { at: nowIso(), author: 'pi', text: 'Started investigation' },
      { at: nowIso(), author: 'kuba', text: 'Reviewed approach' },
      { at: nowIso(), author: 'pi', text: 'Implementation complete' },
    ];

    for (const entry of entries) {
      await appendLog(task.id, entry);
    }

    const fetched = await getTask(task.id);
    expect(fetched.log.length).toBe(3);

    // Verify content (log may be sorted newest-first in markdown, but parsed entries should match)
    const authors = fetched.log.map((l) => l.author);
    expect(authors).toContain('pi');
    expect(authors).toContain('kuba');

    const texts = fetched.log.map((l) => l.text);
    expect(texts).toContain('Started investigation');
    expect(texts).toContain('Reviewed approach');
    expect(texts).toContain('Implementation complete');
  }, 20_000);

  // 5. Parent-child
  it('parent-child: child is listed under parent', async () => {
    const parentTitle = testTitle('parent');
    const parent = await addTask({ title: parentTitle });

    const childTitle = testTitle('child');
    const child = await addTask({ title: childTitle, parentId: parent.id });

    expect(child.parentId).toBe(parent.id);

    const children = await listTasks({ parent: parent.id });
    expect(children.length).toBeGreaterThanOrEqual(1);
    expect(children.some((t) => t.id === child.id)).toBe(true);
  }, 20_000);

  // 6. Dependencies
  it('dependencies: getUnresolvedDependencies returns undone deps', async () => {
    const parentTitle = testTitle('dep-parent');
    const parent = await addTask({ title: parentTitle });

    const depA = await addTask({ title: testTitle('dep-a'), parentId: parent.id });
    const depB = await addTask({ title: testTitle('dep-b'), parentId: parent.id });
    const main = await addTask({
      title: testTitle('dep-main'),
      parentId: parent.id,
      dependsOnIds: [depA.id, depB.id],
    });

    // All deps unresolved
    const unresolved = await getUnresolvedDependencies(main);
    expect(unresolved.length).toBe(2);
    expect(unresolved.map((d) => d.id)).toContain(depA.id);
    expect(unresolved.map((d) => d.id)).toContain(depB.id);

    // Resolve one
    await updateTask(depA.id, { status: 'done' });
    const afterOne = await getUnresolvedDependencies(
      await getTask(main.id),
    );
    expect(afterOne.length).toBe(1);
    expect(afterOne[0]!.id).toBe(depB.id);

    // statusRequiresResolvedDependencies
    expect(statusRequiresResolvedDependencies('in_progress')).toBe(true);
    expect(statusRequiresResolvedDependencies('open')).toBe(false);
  }, 30_000);

  // 7. Slug generation — duplicate titles get different slugs
  it('slug deduplication: same title produces different slugs', async () => {
    const title = testTitle('dup');
    const first = await addTask({ title });
    const second = await addTask({ title });

    expect(first.id).not.toBe(second.id);
    expect(second.id).toMatch(/-2$/);
  }, 15_000);

  // 8. Project CRUD
  it('project CRUD: add → get → delete', async () => {
    const name = testTitle('proj');
    const project = await addProject({
      name,
      description: 'Test project',
      repos: [{ label: 'main', kind: 'local', path: '/tmp/test-repo' }],
    });

    expect(project.id).toBeTruthy();
    expect(project.name).toBe(name);
    expect(project.description).toBe('Test project');
    expect(project.repos.length).toBe(1);
    expect(project.repos[0]!.kind).toBe('local');

    const fetched = await getProject(project.id);
    expect(fetched.id).toBe(project.id);
    expect(fetched.name).toBe(name);

    await deleteProject(project.id);
    const gone = await findProject(project.id);
    expect(gone).toBeUndefined();
  }, 20_000);

  // 9. Search filters
  it('listTasks filters by status and project', async () => {
    const projA = await addProject({ name: testTitle('filter-a') });
    const projB = await addProject({ name: testTitle('filter-b') });

    const taskOpenA = await addTask({
      title: testTitle('open-a'),
      projectId: projA.id,
    });
    const taskDoneA = await addTask({
      title: testTitle('done-a'),
      projectId: projA.id,
    });
    await updateTask(taskDoneA.id, { status: 'done' });

    const taskOpenB = await addTask({
      title: testTitle('open-b'),
      projectId: projB.id,
    });

    // Filter by status=open (should NOT include done unless all=true)
    const openTasks = await listTasks({ status: 'open' });
    const openIds = openTasks.map((t) => t.id);
    expect(openIds).toContain(taskOpenA.id);
    expect(openIds).toContain(taskOpenB.id);
    expect(openIds).not.toContain(taskDoneA.id);

    // Filter by project
    const projATasks = await listTasks({ project: projA.id, all: true });
    const projAIds = projATasks.map((t) => t.id);
    expect(projAIds).toContain(taskOpenA.id);
    expect(projAIds).toContain(taskDoneA.id);
    expect(projAIds).not.toContain(taskOpenB.id);
  }, 60_000);

  // 10. Property update
  it('updateTaskProperty changes a single frontmatter field', async () => {
    const title = testTitle('propup');
    const task = await addTask({ title });
    expect(task.status).toBe('open');

    await updateTaskProperty(task.id, 'status', 'in_progress');

    const fetched = await getTask(task.id);
    expect(fetched.status).toBe('in_progress');
  }, 15_000);
});
