import type { LogEntry, Project, Status, Task } from './types.js';

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
// YAML frontmatter helpers
// ---------------------------------------------------------------------------

function yamlQuote(val: string): string {
  return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function yamlArray(items: string[]): string {
  return items.map((i) => `  - ${i}`).join('\n');
}

function fmLine(key: string, value: string | undefined, quote = false): string {
  if (value === undefined || value === '') return '';
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
// Relationship wiki-links (rendered in markdown body, not frontmatter)
// ---------------------------------------------------------------------------

const PROJECT_LINE_RE = /^Project:\s+\[\[([^\]]+)\]\]$/;
const PARENT_LINE_RE = /^Parent:\s+\[\[([^\]]+)\]\]$/;

export function buildTaskRelationshipLines(task: Pick<Task, 'projectId' | 'parentId'>): string[] {
  const lines: string[] = [];
  if (task.projectId) lines.push(`Project: [[${task.projectId}]]`);
  if (task.parentId) lines.push(`Parent: [[${task.parentId}]]`);
  return lines;
}

function isDerivedRelationshipLine(line: string): boolean {
  const trimmed = line.trim();
  return PROJECT_LINE_RE.test(trimmed) || PARENT_LINE_RE.test(trimmed);
}

function stripLeadingDerivedRelationshipBlock(body: string): string | undefined {
  const normalized = body.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let index = 0;
  while (index < lines.length && lines[index]!.trim() === '') index++;

  let sawRelationshipLine = false;
  while (index < lines.length && isDerivedRelationshipLine(lines[index]!)) {
    sawRelationshipLine = true;
    index++;
  }

  if (sawRelationshipLine) {
    while (index < lines.length && lines[index]!.trim() === '') index++;
  }

  const description = lines.slice(index).join('\n').trim();
  return description || undefined;
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
  lines.push('tags:');
  lines.push(yamlArray(tags));
  lines.push(fmLine('created', task.createdAt));
  lines.push(fmLine('updated', task.updatedAt));
  lines.push('---');

  const body: string[] = [''];
  const relationshipLines = buildTaskRelationshipLines(task);
  if (relationshipLines.length > 0) {
    body.push(...relationshipLines);
    body.push('');
  }
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
  const bodyMatch = content.replace(/^---[\s\S]*?---\s*/, '');
  const logIdx = bodyMatch.indexOf('## Log');
  const descriptionRaw = logIdx >= 0 ? bodyMatch.slice(0, logIdx) : bodyMatch;
  const description = stripLeadingDerivedRelationshipBlock(descriptionRaw);

  const logSection = logIdx >= 0 ? bodyMatch.slice(logIdx) : '';
  const logEntries: LogEntry[] = [];
  for (const line of logSection.split('\n')) {
    const entry = parseLogEntry(line.trim());
    if (entry) logEntries.push(entry);
  }

  const rawTags = Array.isArray(properties.tags) ? (properties.tags as string[]) : [];
  const tags = rawTags.filter((t) => t !== 'type/task');

  return {
    id: slug,
    title: String(properties.title ?? ''),
    description,
    status: (properties.status as Status) ?? 'open',
    projectId: properties.project ? String(properties.project) : undefined,
    parentId: properties.parent ? String(properties.parent) : undefined,
    tags,
    createdAt: String(properties.created ?? new Date().toISOString()),
    updatedAt: String(properties.updated ?? new Date().toISOString()),
    log: logEntries,
  };
}

// ---------------------------------------------------------------------------
// Project → Markdown
// ---------------------------------------------------------------------------

export function projectToMarkdown(project: Project): string {
  const tags = ['type/project'];

  const lines: string[] = ['---'];
  lines.push('type: project');
  lines.push(fmLine('name', project.name, true));
  if (project.description) lines.push(fmLine('description', project.description, true));
  lines.push('tags:');
  lines.push(yamlArray(tags));
  lines.push(fmLine('created', project.createdAt));
  lines.push(fmLine('updated', project.updatedAt));
  lines.push('---');

  const body: string[] = [''];
  if (project.description) {
    body.push(project.description);
    body.push('');
  }

  return lines.join('\n') + body.join('\n');
}

// ---------------------------------------------------------------------------
// Markdown → Project
// ---------------------------------------------------------------------------

export function markdownToProject(
  slug: string,
  _content: string,
  properties: Record<string, unknown>,
): Project {
  return {
    id: slug,
    name: String(properties.name ?? slug),
    description: properties.description ? String(properties.description) : undefined,
    createdAt: String(properties.created ?? new Date().toISOString()),
    updatedAt: String(properties.updated ?? new Date().toISOString()),
  };
}
