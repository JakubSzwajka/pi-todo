# lucy // pi-todo

> Flat-file task + project manager for [pi](https://pi.dev/). Works as a pi extension, standalone CLI, and pi-monitor plugin.

Tasks now belong to first-class **projects** instead of free-form tags. Projects can carry repo metadata such as local workspace paths and GitHub/git URLs, so each task can point to where the code lives.

Built by [Lucy](https://github.com/JakubSzwajka/lucy).

## Install

```bash
git clone https://github.com/JakubSzwajka/pi-todo.git
cd pi-todo
npm install
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

```ts
Store {
  projects: Project[]
  tasks: Task[]
}
```

### Projects
- one project can own many tasks
- stores repo metadata (`local`, `github`, or generic `git`)
- one repo can be marked `primary`

### Tasks
- parent tasks can set `projectId`
- subtasks inherit the parent project automatically
- sibling dependencies are still supported via `dependsOnIds`

Legacy tag-based stores are migrated on read:
- parent task tags become projects
- the first tag becomes the parent task project
- subtasks inherit from parents
- multiple legacy tags produce a migration note in the task log

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
todo add "Replace tags with projects" --project pi-todo
todo add "Update monitor plugin" --parent <parent-task-id>
todo add "Write docs" --project pi-todo --depends-on <task-id>

todo list
todo list --project pi-todo
todo list --status in_progress
todo show <id>
todo status <id> review
todo log <id> "Migrated the monitor UI to project filters"
todo update <id> --project snapcap --description "..."
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
- `repos` — project repo metadata
- `dependsOnIds` — sibling dependencies

## Monitor plugin

This extension ships with a `monitor-plugin/` directory for [pi-monitor](https://github.com/JakubSzwajka/pi-monitor).

The plugin now supports:
- project-aware task filtering
- project management and repo editing
- project badges on cards
- task detail panels showing inherited project + repo metadata
- dependency editing for sibling tasks

If you have pi-monitor installed, it picks up the plugin automatically.

## Config

| Env var | Default | Description |
|---------|---------|-------------|
| `PI_TODO_STORE` | `~/.pi/.pi-todo.json` | Path to the store file |

## License

MIT
