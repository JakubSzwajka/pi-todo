# lucy // pi-todo

> Obsidian-backed task + project manager for [pi](https://pi.dev/). Works as a pi extension, standalone CLI, and pi-monitor plugin.

Tasks and projects are stored as **individual markdown files** inside an Obsidian vault. Task descriptions support `[[wikilinks]]` to knowledge nodes, making them first-class citizens in your knowledge graph.

Built by [Lucy](https://github.com/JakubSzwajka/lucy).

## Requirements

- Node.js 20+
- [Obsidian](https://obsidian.md/) 1.12+ with CLI registered in PATH
- Obsidian **must be running** for any pitodo operation

## Install

```bash
git clone https://github.com/JakubSzwajka/pi-todo.git
cd pi-todo
npm install

# Verify Obsidian CLI is available
obsidian version
```

### As a pi extension

```bash
ln -s "$(pwd)" ~/.pi/agent/extensions/pi-todo
```

Restart pi. The `pitodo` tool is now available in conversations.

### As a CLI

```bash
alias todo="$(pwd)/bin/todo"
```

## Data model

Tasks are stored as individual markdown files in `~/knowledge/tasks/`.
Projects are stored in `~/knowledge/tasks/projects/`.

File names are slug-based (e.g. `implement-outbox-pattern.md`).

### Task frontmatter

```yaml
---
type: task
title: "Implement outbox pattern"
status: in_progress
project: snapcap
parent: parent-slug
depends:
  - dep-slug-a
tags:
  - type/task
  - backend
created: 2026-04-01T10:00:00Z
updated: 2026-04-06T14:30:00Z
---
```

### Project frontmatter

```yaml
---
type: project
name: snapcap
description: "SnapCap backend service"
tags:
  - type/project
created: ...
updated: ...
---
```

### Projects
- One project can own many tasks
- Stores repo metadata (`local`, `github`, or generic `git`)
- One repo can be marked `primary`

### Tasks
- Parent tasks can set `project`
- Tasks can carry optional `tags: string[]`
- Subtasks inherit the parent project automatically
- Sibling dependencies via `depends`

## Wikilinks

Task descriptions (the markdown body below frontmatter) can contain `[[wikilinks]]` to knowledge nodes. These are live links in Obsidian — referenced nodes show the task in their **backlinks panel**, connecting tasks to your knowledge graph.

## Obsidian integration

**Dataview queries** work out of the box:

```dataview
TABLE status, project FROM "tasks" WHERE type = "task" AND status != "done"
```

- **Backlinks panel** shows which tasks reference which knowledge nodes
- **Graph view** includes tasks in the knowledge graph

## Migration

If you have an existing JSON store (`~/.pi/.pi-todo.json`), migrate it to Obsidian:

```bash
# Dry run first
npx tsx scripts/migrate-to-obsidian.ts --dry-run

# Run migration
npx tsx scripts/migrate-to-obsidian.ts

# Skip archiving done tasks
npx tsx scripts/migrate-to-obsidian.ts --no-archive-done
```

Migrates from `~/.pi/.pi-todo.json` to `~/knowledge/tasks/`. Task IDs change from random UUIDs to slug-based file names. The old JSON file is backed up as `.bak`.

## CLI usage

### Projects

```bash
todo project add "SnapCap" --id snapcap \
  --description "Captioning platform" \
  --repos "local|workspace|/Users/kuba/DEV/sofomo/innocaption/snapcap/api|primary,github|origin|https://github.com/acme/snapcap-api"

todo project list
todo project show snapcap
todo project update snapcap --name "SnapCap API"
todo project delete old-project
```

Repo entries use:

```text
kind|label|target|primary
```

Examples:
- `local|workspace|/Users/kuba/DEV/priv/pi-todo|primary`
- `github|origin|https://github.com/JakubSzwajka/pi-todo`
- `git|mirror|git@github.com:org/repo.git`

### Tasks

```bash
todo add "Replace tags with projects" --project pi-todo --tags migration,ux
todo add "Update monitor plugin" --parent <parent-task-id> --tags ui
todo add "Write docs" --project pi-todo --depends-on <task-id> --tags docs

todo list
todo list --project pi-todo
todo list --tag docs
todo list --status in_progress
todo show <id>
todo status <id> review
todo log <id> "Migrated the monitor UI to project filters"
todo update <id> --project snapcap --tags backend,urgent --description "..."
todo delete <id>
```

Statuses: `open` → `in_progress` → `review` → `testing` → `done` / `waiting` / `cancelled`

## Tool usage (in pi)

The `pitodo` tool supports task actions:
- `add`, `list`, `get`, `status`, `log`, `update`, `delete`

And project actions:
- `project_add`, `project_list`, `project_get`, `project_update`, `project_delete`

Useful params:
- `projectId` — assign/filter by project
- `tags` / `filterTag` — optional secondary labels on tasks
- `repos` — project repo metadata
- `dependsOnIds` — sibling dependencies

## Monitor plugin

This extension ships with a `monitor-plugin/` directory for [pi-monitor](https://github.com/JakubSzwajka/pi-monitor).

The plugin supports:
- Project-aware task filtering
- Optional task tags with inline editing in the detail panel
- Project management and repo editing
- Project badges on cards
- Task detail panels showing inherited project + repo metadata
- Dependency editing for sibling tasks

If you have pi-monitor installed, it picks up the plugin automatically.

## Error handling

If Obsidian is not running:

```
Obsidian is not running. Please open Obsidian and try again.
```

There is no fallback mode. Obsidian must be running for all operations.

## Config

| Env var | Default | Description |
|---------|---------|-------------|
| `PI_TODO_VAULT` | `~/knowledge` | Path to the Obsidian vault |

## License

MIT
