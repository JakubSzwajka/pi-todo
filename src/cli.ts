#!/usr/bin/env tsx
import {
  cmdAdd,
  cmdDelete,
  cmdList,
  cmdLog,
  cmdProjectAdd,
  cmdProjectDelete,
  cmdProjectList,
  cmdProjectShow,
  cmdProjectUpdate,
  cmdShow,
  cmdStatus,
  cmdUpdate,
} from './commands.js';

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

function parseCsv(raw: string): string[] {
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}

const HELP = `
Usage: todo <command> [options]

Task commands:
  add <title> [--description <text>] [--project <id>] [--parent <id>] [--tags <a,b>] [--note <text>]
  list [--status <status>] [--project <id>] [--tag <tag>] [--all] [--tree]
  show <id>
  status <id> <status>
  update <id> [--title <text>] [--description <text>] [--project <id>] [--parent <id>] [--tags <a,b>]
  log <id> <note text>
  delete <id>

Project commands:
  project list
  project add <name> [--id <id>] [--description <text>]
  project show <id>
  project update <id> [--name <text>] [--description <text>]
  project delete <id>

Statuses: open | in_progress | done | cancelled

Description and notes can contain [[wiki-links]] to knowledge base pages.
`;

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = pos;

  if (cmd === 'project') {
    const [subcmd, ...projectRest] = rest;
    switch (subcmd) {
      case 'list':
        await cmdProjectList();
        break;
      case 'add': {
        const name = projectRest.join(' ') || (flags['name'] as string);
        if (!name) { console.error('Usage: todo project add <name>'); process.exit(1); }
        await cmdProjectAdd({
          id: flags['id'] as string | undefined,
          name,
          description: flags['description'] as string | undefined,
        });
        break;
      }
      case 'show': {
        if (!projectRest[0]) { console.error('Usage: todo project show <id>'); process.exit(1); }
        await cmdProjectShow(projectRest[0]);
        break;
      }
      case 'update': {
        if (!projectRest[0]) { console.error('Usage: todo project update <id> [options]'); process.exit(1); }
        await cmdProjectUpdate(projectRest[0], {
          name: flags['name'] as string | undefined,
          description: flags['description'] as string | undefined,
        });
        break;
      }
      case 'delete': {
        if (!projectRest[0]) { console.error('Usage: todo project delete <id>'); process.exit(1); }
        await cmdProjectDelete(projectRest[0]);
        break;
      }
      default:
        console.log(HELP);
        process.exit(subcmd ? 1 : 0);
    }
    return;
  }

  switch (cmd) {
    case 'add': {
      const title = rest.join(' ') || (flags['title'] as string);
      if (!title) { console.error('Usage: todo add <title>'); process.exit(1); }
      await cmdAdd(title, {
        description: flags['description'] as string | undefined,
        note: flags['note'] as string | undefined,
        parentId: flags['parent'] as string | undefined,
        projectId: flags['project'] as string | undefined,
        tags: flags['tags'] ? parseCsv(flags['tags'] as string) : undefined,
      });
      break;
    }
    case 'list': {
      await cmdList({
        status: flags['status'] as string | undefined,
        projectId: flags['project'] as string | undefined,
        tag: flags['tag'] as string | undefined,
        all: flags['all'] === true,
        tree: flags['tree'] === true,
      });
      break;
    }
    case 'show': {
      if (!rest[0]) { console.error('Usage: todo show <id>'); process.exit(1); }
      await cmdShow(rest[0]);
      break;
    }
    case 'status': {
      if (!rest[0] || !rest[1]) { console.error('Usage: todo status <id> <status>'); process.exit(1); }
      await cmdStatus(rest[0], rest[1]);
      break;
    }
    case 'update': {
      if (!rest[0]) { console.error('Usage: todo update <id> [options]'); process.exit(1); }
      await cmdUpdate(rest[0], {
        title: flags['title'] as string | undefined,
        description: flags['description'] as string | undefined,
        parentId: flags['parent'] as string | undefined,
        projectId: flags['project'] as string | undefined,
        tags: flags['tags'] ? parseCsv(flags['tags'] as string) : undefined,
      });
      break;
    }
    case 'log': {
      if (!rest[0] || rest.length < 2) { console.error('Usage: todo log <id> <note text>'); process.exit(1); }
      const [id, ...noteParts] = rest;
      await cmdLog(id, noteParts.join(' '), 'user');
      break;
    }
    case 'delete': {
      if (!rest[0]) { console.error('Usage: todo delete <id>'); process.exit(1); }
      await cmdDelete(rest[0]);
      break;
    }
    default:
      console.log(HELP);
      if (cmd) process.exit(1);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
