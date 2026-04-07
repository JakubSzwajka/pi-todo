import type { LogEntry, Project, ProjectRepo, Status, Task } from './types.js';

// ---------------------------------------------------------------------------
// Slugify / ID helpers
// ---------------------------------------------------------------------------

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function generateSlug(title: string): string {
  return slugify(title);
}

// ---------------------------------------------------------------------------
// YAML frontmatter helpers (simple template-based serializer)
// ---------------------------------------------------------------------------

function yamlQuote(val: string): string {
  return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function yamlArray(items: string[]): string {
  return items.map((i) => `  - ${i}`).join('\n');
}

function fmLine(key: string, value: string | boolean | undefined, quote = false): string {
  if (value === undefined || value === '') return '';
  if (typeof value === 'boolean') return `${key}: ${value}`;
  return quote ? `${key}: ${yamlQuote(value)}` : `${key}: ${value}`;
}

// ---------------------------------------------------------------------------
// Log entry formatting / parsing
// ---------------------------------------------------------------------------

const LOG_RE = /^- \*\*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) \(([^)]+)\):\*\* (.+)$/;

export function formatLogEntry(entry: LogEntry): string {
  const d = new Date(entry.at);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `- **${yyyy}-${mm}-${dd} ${hh}:${mi} (${entry.author}):** ${entry.text}`;
}

export function parseLogEntry(line: string): LogEntry | null {
  const m = line.match(LOG_RE);
  if (!m) return null;
  const [, datetime, author, text] = m;
  return { at: new Date(`${datetime!.replace(' ', 'T')}:00Z`).toISOString(), author: author!, text: text! };
}

// ---------------------------------------------------------------------------
// Task → Markdown
// ---------------------------------------------------------------------------

export function taskToMarkdown(task: Task): string {
  const tags = ['type/task', ...task.tags.filter((t) => t !== 'type/task')];

  const lines: string[] = ['---'];
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

  // Body
  const body: string[] = [''];
  if (task.description) {
    body.push(task.description);
    body.push('');
  }

  body.push('## Log');
  body.push('');
  if (task.log.length > 0) {
    const sorted = [...task.log].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    for (const entry of sorted) {
      body.push(formatLogEntry(entry));
    }
    body.push('');
  }

  return lines.join('\n') + body.join('\n');
}

// ---------------------------------------------------------------------------
// Markdown → Task
// ---------------------------------------------------------------------------

export function markdownToTask(
  slug: string,
  content: string,
  properties: Record<string, unknown>,
): Task {
  // Parse description: text between frontmatter end and ## Log
  const bodyMatch = content.replace(/^---[\s\S]*?---\s*/, '');
  const logIdx = bodyMatch.indexOf('## Log');
  const descriptionRaw = logIdx >= 0 ? bodyMatch.slice(0, logIdx).trim() : bodyMatch.trim();
  const description = descriptionRaw || undefined;

  // Parse log entries
  const logSection = logIdx >= 0 ? bodyMatch.slice(logIdx) : '';
  const logEntries: LogEntry[] = [];
  for (const line of logSection.split('\n')) {
    const entry = parseLogEntry(line.trim());
    if (entry) logEntries.push(entry);
  }

  // Tags: filter out type/task
  const rawTags = Array.isArray(properties.tags) ? (properties.tags as string[]) : [];
  const tags = rawTags.filter((t) => t !== 'type/task');

  const dependsRaw = properties.depends;
  const dependsOnIds = Array.isArray(dependsRaw) && dependsRaw.length > 0
    ? (dependsRaw as string[])
    : undefined;

  return {
    id: slug,
    title: String(properties.title ?? ''),
    description,
    status: (properties.status as Status) ?? 'open',
    projectId: properties.project ? String(properties.project) : undefined,
    parentId: properties.parent ? String(properties.parent) : undefined,
    dependsOnIds,
    tags,
    createdAt: String(properties.created ?? new Date().toISOString()),
    updatedAt: String(properties.updated ?? new Date().toISOString()),
    log: logEntries,
  };
}

// ---------------------------------------------------------------------------
// Project → Markdown
// ---------------------------------------------------------------------------

function formatRepo(repo: ProjectRepo): string {
  const primaryTag = repo.primary ? ', primary' : '';
  const target = repo.kind === 'local' ? (repo.path ?? '') : (repo.url ?? '');
  return `- **${repo.label}** (${repo.kind}${primaryTag}): \`${target}\``;
}

export function projectToMarkdown(project: Project): string {
  const tags = ['type/project'];

  const lines: string[] = ['---'];
  lines.push('type: project');
  lines.push(fmLine('name', project.name, true));
  if (project.description) lines.push(fmLine('description', project.description, true));
  if (project.archived) lines.push(fmLine('archived', true));
  lines.push('tags:');
  lines.push(yamlArray(tags));
  lines.push(fmLine('created', project.createdAt));
  lines.push(fmLine('updated', project.updatedAt));
  lines.push('---');

  const body: string[] = [''];
  body.push('## Repos');
  body.push('');
  if (project.repos.length > 0) {
    for (const repo of project.repos) {
      body.push(formatRepo(repo));
    }
  } else {
    body.push('No repos configured.');
  }
  body.push('');

  return lines.join('\n') + body.join('\n');
}

// ---------------------------------------------------------------------------
// Markdown → Project
// ---------------------------------------------------------------------------

const REPO_RE = /^- \*\*([^*]+)\*\* \(([^,)]+)(?:,\s*primary)?\):\s*`([^`]+)`$/;

export function markdownToProject(
  slug: string,
  content: string,
  properties: Record<string, unknown>,
): Project {
  // Parse repos from body
  const repos: ProjectRepo[] = [];
  const bodyMatch = content.replace(/^---[\s\S]*?---\s*/, '');
  for (const line of bodyMatch.split('\n')) {
    const trimmed = line.trim();
    const m = trimmed.match(REPO_RE);
    if (m) {
      const [fullMatch, label, kind] = m;
      const isPrimary = fullMatch!.includes(', primary');
      const target = m[3]!;
      const repo: ProjectRepo = {
        id: slugify(label!),
        label: label!,
        kind: kind as ProjectRepo['kind'],
        primary: isPrimary || undefined,
      };
      if (kind === 'local') repo.path = target;
      else repo.url = target;
      repos.push(repo);
    }
  }

  const rawTags = Array.isArray(properties.tags) ? (properties.tags as string[]) : [];

  return {
    id: slug,
    name: String(properties.name ?? slug),
    description: properties.description ? String(properties.description) : undefined,
    repos,
    createdAt: String(properties.created ?? new Date().toISOString()),
    updatedAt: String(properties.updated ?? new Date().toISOString()),
    archived: properties.archived === true ? true : undefined,
  };
}

// ---------------------------------------------------------------------------
// Smoke tests
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, ''))) {
  console.log('=== Task round-trip ===');
  const task: Task = {
    id: 'implement-outbox-pattern',
    title: 'Implement outbox pattern',
    description: 'Set up the transactional outbox with [[event-messaging]].',
    status: 'in_progress',
    projectId: 'snapcap',
    parentId: 'backend-reliability',
    dependsOnIds: ['create-events-table', 'setup-worker'],
    tags: ['backend', 'events'],
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-06T14:30:00.000Z',
    log: [
      { at: '2026-04-05T09:00:00.000Z', author: 'kuba', text: 'Decided on orchestrated approach' },
      { at: '2026-04-06T14:30:00.000Z', author: 'pi', text: 'Set up outbox table migration' },
    ],
  };

  const taskMd = taskToMarkdown(task);
  console.log(taskMd);

  // Simulate obsidianProperties — build the same shape Obsidian CLI returns
  const props: Record<string, unknown> = {
    type: 'task',
    title: task.title,
    status: task.status,
    project: task.projectId,
    parent: task.parentId,
    depends: task.dependsOnIds,
    tags: ['type/task', ...task.tags.filter((t) => t !== 'type/task')],
    created: task.createdAt,
    updated: task.updatedAt,
  };

  const parsed = markdownToTask('implement-outbox-pattern', taskMd, props);
  const taskChecks = [
    ['id', parsed.id === task.id],
    ['title', parsed.title === task.title],
    ['status', parsed.status === task.status],
    ['projectId', parsed.projectId === task.projectId],
    ['parentId', parsed.parentId === task.parentId],
    ['dependsOnIds', JSON.stringify(parsed.dependsOnIds) === JSON.stringify(task.dependsOnIds)],
    ['tags', JSON.stringify(parsed.tags) === JSON.stringify(task.tags)],
    ['description', parsed.description === task.description],
    ['log.length', parsed.log.length === task.log.length],
    ['createdAt', parsed.createdAt === task.createdAt],
    ['updatedAt', parsed.updatedAt === task.updatedAt],
  ] as const;
  for (const [field, ok] of taskChecks) {
    console.log(`  ${ok ? '✅' : '❌'} ${field}`);
  }

  console.log('\n=== Project round-trip ===');
  const project: Project = {
    id: 'snapcap',
    name: 'snapcap',
    description: 'SnapCap backend service',
    repos: [
      { id: 'backend', label: 'backend', kind: 'local', path: '/Users/kuba/DEV/snapcap', primary: true },
      { id: 'admin-panel', label: 'admin-panel', kind: 'local', path: '/Users/kuba/DEV/snapcap-admin' },
      { id: 'origin', label: 'origin', kind: 'github', url: 'https://github.com/acme/snapcap' },
    ],
    createdAt: '2026-03-30T08:57:47.000Z',
    updatedAt: '2026-04-06T14:30:00.000Z',
    archived: false,
  };

  const projMd = projectToMarkdown(project);
  console.log(projMd);

  // Simulate properties
  const projProps: Record<string, unknown> = {
    type: 'project',
    name: 'snapcap',
    description: 'SnapCap backend service',
    tags: ['type/project'],
    created: '2026-03-30T08:57:47.000Z',
    updated: '2026-04-06T14:30:00.000Z',
  };

  const parsedProj = markdownToProject('snapcap', projMd, projProps);
  const projChecks = [
    ['id', parsedProj.id === project.id],
    ['name', parsedProj.name === project.name],
    ['description', parsedProj.description === project.description],
    ['repos.length', parsedProj.repos.length === project.repos.length],
    ['repos[0].primary', parsedProj.repos[0]?.primary === true],
    ['repos[0].path', parsedProj.repos[0]?.path === '/Users/kuba/DEV/snapcap'],
    ['repos[2].url', parsedProj.repos[2]?.url === 'https://github.com/acme/snapcap'],
    ['createdAt', parsedProj.createdAt === project.createdAt],
    ['updatedAt', parsedProj.updatedAt === project.updatedAt],
  ] as const;
  for (const [field, ok] of projChecks) {
    console.log(`  ${ok ? '✅' : '❌'} ${field}`);
  }
}
