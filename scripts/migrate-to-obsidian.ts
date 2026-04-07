#!/usr/bin/env tsx
/**
 * One-time migration: JSON store (~/.pi/.pi-todo.json) → Obsidian vault markdown files.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-obsidian.ts [--dry-run] [--no-archive-done]
 *
 * Flags:
 *   --dry-run          Print what would happen without writing files
 *   --no-archive-done  Keep done/cancelled tasks in tasks/ instead of tasks/archive/
 */
import { readFileSync, copyFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { generateSlug, projectToMarkdown, taskToMarkdown } from '../src/markdown.js';
import { ensureObsidian, obsidianCreate, PROJECTS_PATH, TASKS_PATH } from '../src/obsidian.js';
import type { Project, Store, Task } from '../src/types.js';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ARCHIVE_DONE = !args.includes('--no-archive-done');

const ARCHIVE_PATH = `${TASKS_PATH}/archive`;
const JSON_PATH = join(homedir(), '.pi', '.pi-todo.json');

// ---------------------------------------------------------------------------
// Slug deduplication
// ---------------------------------------------------------------------------

function buildSlugMap(items: { id: string; label: string }[]): Map<string, string> {
  const idToSlug = new Map<string, string>();
  const usedSlugs = new Set<string>();

  for (const { id, label } of items) {
    let base = generateSlug(label);
    if (!base) base = id; // fallback to raw ID if title is empty
    let slug = base;
    let n = 2;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${n++}`;
    }
    usedSlugs.add(slug);
    idToSlug.set(id, slug);
  }

  return idToSlug;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Archive done/cancelled: ${ARCHIVE_DONE}`);
  console.log();

  // 1. Ensure Obsidian is running
  if (!DRY_RUN) {
    await ensureObsidian();
    console.log('✅ Obsidian is running\n');
  } else {
    console.log('⏭️  Skipping Obsidian check (dry run)\n');
  }

  // 2. Read JSON store
  if (!existsSync(JSON_PATH)) {
    console.error(`❌ Store not found at ${JSON_PATH}`);
    process.exit(1);
  }
  const store: Store = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  console.log(`📦 Loaded ${store.tasks.length} tasks, ${store.projects.length} projects\n`);

  // 3. Build slug lookup tables
  const projectSlugMap = buildSlugMap(
    store.projects.map((p) => ({ id: p.id, label: p.name })),
  );
  const taskSlugMap = buildSlugMap(
    store.tasks.map((t) => ({ id: t.id, label: t.title })),
  );

  // 4. Migrate projects
  console.log('── Projects ──');
  let projectsCreated = 0;
  let projectsSkipped = 0;

  for (let i = 0; i < store.projects.length; i++) {
    const project = store.projects[i]!;
    const slug = projectSlugMap.get(project.id)!;
    const content = projectToMarkdown(project);

    console.log(`  [${i + 1}/${store.projects.length}] ${slug}`);

    if (DRY_RUN) {
      projectsCreated++;
      continue;
    }

    try {
      await obsidianCreate(slug, PROJECTS_PATH, content);
      projectsCreated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists')) {
        console.log(`    ⏭️  already exists, skipping`);
        projectsSkipped++;
      } else {
        console.error(`    ❌ ${msg}`);
      }
    }
  }

  console.log(`  → Created: ${projectsCreated}, Skipped: ${projectsSkipped}\n`);

  // 5. Migrate tasks
  console.log('── Tasks ──');
  let tasksCreated = 0;
  let tasksSkipped = 0;
  let tasksFailed = 0;

  for (let i = 0; i < store.tasks.length; i++) {
    const original = store.tasks[i]!;
    const slug = taskSlugMap.get(original.id)!;

    // Remap references: old random IDs → new slugs
    const remappedTask: Task = {
      ...original,
      id: slug,
      parentId: original.parentId ? taskSlugMap.get(original.parentId) : undefined,
      dependsOnIds: original.dependsOnIds?.length
        ? original.dependsOnIds
            .map((depId) => taskSlugMap.get(depId))
            .filter((s): s is string => s !== undefined)
        : undefined,
      projectId: original.projectId ? projectSlugMap.get(original.projectId) ?? original.projectId : undefined,
    };

    const content = taskToMarkdown(remappedTask);

    // Choose path based on status
    const isArchived = original.status === 'done' || original.status === 'cancelled';
    const targetPath = ARCHIVE_DONE && isArchived ? ARCHIVE_PATH : TASKS_PATH;

    const statusTag = isArchived ? `[${targetPath}]` : '';
    if (i < 20 || i % 50 === 0 || i === store.tasks.length - 1) {
      console.log(`  [${i + 1}/${store.tasks.length}] ${slug} ${statusTag}`);
    }

    if (DRY_RUN) {
      tasksCreated++;
      continue;
    }

    try {
      await obsidianCreate(slug, targetPath, content);
      tasksCreated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists')) {
        tasksSkipped++;
      } else {
        console.error(`    ❌ ${slug}: ${msg}`);
        tasksFailed++;
      }
    }
  }

  console.log(`  → Created: ${tasksCreated}, Skipped: ${tasksSkipped}, Failed: ${tasksFailed}\n`);

  // 6. Verification
  console.log('── Verification ──');
  const sampleSize = Math.min(10, store.tasks.length);
  const sampleIndices = new Set<number>();
  while (sampleIndices.size < sampleSize) {
    sampleIndices.add(Math.floor(Math.random() * store.tasks.length));
  }

  let verified = 0;
  for (const idx of sampleIndices) {
    const original = store.tasks[idx]!;
    const slug = taskSlugMap.get(original.id)!;
    const remappedProject = original.projectId
      ? projectSlugMap.get(original.projectId) ?? original.projectId
      : undefined;

    console.log(`  ✓ ${slug} — status=${original.status}, project=${remappedProject ?? 'none'}`);
    verified++;
  }
  console.log(`  → Verified ${verified} sample tasks\n`);

  // 7. Summary
  console.log('── Summary ──');
  console.log(`  Projects: ${projectsCreated} created, ${projectsSkipped} skipped`);
  console.log(`  Tasks:    ${tasksCreated} created, ${tasksSkipped} skipped, ${tasksFailed} failed`);
  console.log(`  Total:    ${projectsCreated + tasksCreated} files`);

  // 8. Archive original JSON
  if (!DRY_RUN) {
    const bakPath = `${JSON_PATH}.bak`;
    copyFileSync(JSON_PATH, bakPath);
    console.log(`\n📁 Backup: ${bakPath}`);
  }

  console.log('\n✅ Migration complete');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
