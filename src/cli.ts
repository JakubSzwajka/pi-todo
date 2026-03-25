#!/usr/bin/env tsx
import { cmdAdd, cmdList, cmdShow, cmdStatus, cmdUpdate, cmdLog, cmdDelete } from './commands.js';

// ─── Minimal arg parser ───────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      pos.push(a);
    }
  }
  return { pos, flags };
}

// ─── Help ─────────────────────────────────────────────────────────────────────

const HELP = `
Usage: todo <command> [options]

Commands:
  add <title> [--priority 1-3] [--note <text>]    Add a task
  list [--status <status>] [--all]                 List tasks
  show <id>                                        Show task + full log
  status <id> <status>                             Change task status
  update <id> [--title <text>] [--priority 1-3]   Update task fields
  log <id> <note text>                             Append a note to a task
  delete <id>                                      Delete a task

Statuses: open | in_progress | review | done | cancelled
Priorities: 1 (low) | 2 (medium) | 3 (high)
`;

// ─── Main ─────────────────────────────────────────────────────────────────────

const { pos, flags } = parseArgs(process.argv.slice(2));
const [cmd, ...rest] = pos;

switch (cmd) {
  case 'add': {
    const title = rest.join(' ') || (flags['title'] as string);
    if (!title) { console.error('Usage: todo add <title>'); process.exit(1); }
    cmdAdd(title, {
      note: flags['note'] as string | undefined,
      priority: flags['priority'] ? parseInt(flags['priority'] as string) : undefined,
    });
    break;
  }
  case 'list': {
    cmdList({
      status: flags['status'] as string | undefined,
      all: flags['all'] === true,
    });
    break;
  }
  case 'show': {
    if (!rest[0]) { console.error('Usage: todo show <id>'); process.exit(1); }
    cmdShow(rest[0]);
    break;
  }
  case 'status': {
    if (!rest[0] || !rest[1]) { console.error('Usage: todo status <id> <status>'); process.exit(1); }
    cmdStatus(rest[0], rest[1]);
    break;
  }
  case 'update': {
    if (!rest[0]) { console.error('Usage: todo update <id> [--title ...] [--priority ...]'); process.exit(1); }
    cmdUpdate(rest[0], {
      title: flags['title'] as string | undefined,
      priority: flags['priority'] ? parseInt(flags['priority'] as string) : undefined,
    });
    break;
  }
  case 'log': {
    if (!rest[0] || rest.length < 2) { console.error('Usage: todo log <id> <note text>'); process.exit(1); }
    const [id, ...noteParts] = rest;
    cmdLog(id, noteParts.join(' '), 'kuba');
    break;
  }
  case 'delete': {
    if (!rest[0]) { console.error('Usage: todo delete <id>'); process.exit(1); }
    cmdDelete(rest[0]);
    break;
  }
  default: {
    console.log(HELP);
    if (cmd) process.exit(1);
  }
}
