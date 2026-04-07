#!/usr/bin/env tsx
/**
 * One-time migration: JSON store (~/.pi/.pi-todo.json) → Obsidian vault markdown files.
 * Only migrates ACTIVE tasks (not done/cancelled). Done tasks stay in the JSON backup.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-obsidian.ts [--dry-run]
 */
import { readFileSync, copyFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { generateSlug, projectToMarkdown, taskToMarkdown } from '../src/markdown.js';
import { ensureObsidian, obsidianCreate, PROJECTS_PATH, TASKS_PATH } from '../src/obsidian.js';
import type { Store, Task } from '../src/types.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const JSON_PATH = join(homedir(), '.pi', '.pi-todo.json');
const BAK_PATH = `${JSON_PATH}.bak`;

function buildSlugMap(items: { id: string; label: string }[]): Map<string, string> {
  const idToSlug = new Map<string, string>();
  const usedSlugs = new Set<string>();

  for (const { id, label } of items) {
    let base = generateSlug(label) || id;
    let slug = base;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
    usedSlugs.add(slug);
    idToSlug.set(id, slug);
  }
  return idToSlug;
}

async function main(): Promise<void> {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  if (!DRY_RUN) {
    await ensureObsidian();
    console.log('✅ Obsidian is running\n');
  }

  const sourcePath = existsSync(JSON_PATH) ? JSON_PATH : BAK_PATH;
  if (!existsSync(sourcePath)) {
    console.error(`❌ Store not found at ${JSON_PATH} or ${BAK_PATH}`);
    process.exit(1);
  }
  const store: Store = JSON.parse(readFileSync(sourcePath, 'utf8'));

  const activeTasks = store.tasks.filter((t) => !['done', 'cancelled'].includes(t.status));
  console.log(`📦 ${store.tasks.length} tasks (${activeTasks.length} active, ${store.tasks.length - activeTasks.length} skipped)`);
  console.log(`   ${store.projects.length} projects\n`);

  // Slug maps — need ALL tasks for parent/dep remapping
  const projectSlugMap = buildSlugMap(store.projects.map((p) => ({ id: p.id, label: p.name })));
  const taskSlugMap = buildSlugMap(store.tasks.map((t) => ({ id: t.id, label: t.title })));

  // Only migrate projects referenced by active tasks
  const activeProjectIds = new Set<string>();
  for (const task of activeTasks) {
    if (task.projectId) activeProjectIds.add(task.projectId);
    if (task.parentId) {
      const parent = store.tasks.find((t) => t.id === task.parentId);
      if (parent?.projectId) activeProjectIds.add(parent.projectId);
    }
  }

  console.log('── Projects ──');
  let projectsCreated = 0;
  for (const project of store.projects.filter((p) => activeProjectIds.has(p.id))) {
    const slug = projectSlugMap.get(project.id)!;
    console.log(`  ${slug}`);
    if (!DRY_RUN) {
      try { await obsidianCreate(slug, PROJECTS_PATH, projectToMarkdown(project)); projectsCreated++; }
      catch (e) { console.log(`    ⏭️  ${(e as Error).message.includes('already exists') ? 'exists' : (e as Error).message}`); }
    } else { projectsCreated++; }
  }
  console.log(`  → ${projectsCreated} created\n`);

  console.log('── Tasks ──');
  let tasksCreated = 0;
  for (let i = 0; i < activeTasks.length; i++) {
    const orig = activeTasks[i]!;
    const slug = taskSlugMap.get(orig.id)!;

    const remapped: Task = {
      ...orig,
      id: slug,
      parentId: orig.parentId ? taskSlugMap.get(orig.parentId) : undefined,
      dependsOnIds: orig.dependsOnIds?.length
        ? orig.dependsOnIds.map((d) => taskSlugMap.get(d)).filter((s): s is string => !!s)
        : undefined,
      projectId: orig.projectId ? projectSlugMap.get(orig.projectId) ?? orig.projectId : undefined,
    };

    console.log(`  [${i + 1}/${activeTasks.length}] ${slug} (${orig.status})`);
    if (!DRY_RUN) {
      try { await obsidianCreate(slug, TASKS_PATH, taskToMarkdown(remapped)); tasksCreated++; }
      catch (e) { console.log(`    ⏭️  ${(e as Error).message.includes('already exists') ? 'exists' : (e as Error).message}`); }
    } else { tasksCreated++; }
  }
  console.log(`  → ${tasksCreated} created\n`);

  if (!DRY_RUN && existsSync(JSON_PATH)) {
    copyFileSync(JSON_PATH, BAK_PATH);
    console.log(`📁 Backup: ${BAK_PATH}`);
  }
  console.log('✅ Done');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
