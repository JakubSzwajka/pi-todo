# lucy // pi-todo

> Flat-file task manager for [pi](https://pi.dev/). Works as a pi extension (tool) and as a standalone CLI.

Tasks are stored in a single JSON file. Supports parent/child relationships, dependencies between sibling tasks, tags, status tracking, and log entries.

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
# Add to your PATH, or:
alias todo="$(pwd)/bin/todo"
```

## CLI usage

```
todo add "Fix login bug" --tags backend,auth
todo add "Write tests" --parent <id> --depends-on <id1,id2>
todo list
todo list --tag backend
todo list --status open
todo show <id>
todo status <id> in_progress
todo log <id> "Found the root cause"
todo update <id> --title "New title" --tags new,tags
todo delete <id>
```

Statuses: `open` → `in_progress` → `review` → `testing` → `done` / `waiting` / `cancelled`

## Tool usage (in pi)

The `pitodo` tool exposes the same actions: `add`, `list`, `get`, `status`, `log`, `update`, `delete`.

## How it works

| Feature | Detail |
|---------|--------|
| Flat file | All tasks live in `~/.pi/.pi-todo.json` (override with `PI_TODO_STORE` env var) |
| Parent/child | Set `parentId` to group subtasks under a parent |
| Tags | Only on parent tasks; children inherit their parent's tags automatically |
| Dependencies | `dependsOnIds` between siblings; blocks status advancement until all dependencies are done |
| Log | Append timestamped notes with an author name |

## Monitor plugin

This extension ships with a `monitor-plugin/` directory — a [pi-monitor](https://github.com/JakubSzwajka/pi-monitor) plugin that adds a kanban board, tag filtering, dependency editing, and task detail panels.

If you have pi-monitor installed, it picks up the plugin automatically. No extra setup needed.

## Config

| Env var | Default | Description |
|---------|---------|-------------|
| `PI_TODO_STORE` | `~/.pi/.pi-todo.json` | Path to the task store file |

## License

MIT
