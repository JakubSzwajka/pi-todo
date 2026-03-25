import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { readStore, writeStore, generateId, findTask } from './src/store.js';
import type { Status, Priority, Author, Task } from './src/types.js';

const StatusEnum = () => Type.Union([
  Type.Literal('open'),
  Type.Literal('in_progress'),
  Type.Literal('review'),
  Type.Literal('done'),
  Type.Literal('cancelled'),
]);

const AuthorEnum = () => Type.Union([
  Type.Literal('kuba'),
  Type.Literal('pi'),
]);

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'pitodo',
    label: 'Pi Todo',
    description: 'Manage personal tasks. Use to add tasks, track progress with log entries, update status, and list what needs attention.',
    promptSnippet: 'Manage tasks: add, list, show, status, log, update, delete',
    promptGuidelines: [
      'Use pitodo action=status to move a task to in_progress when you start working on it.',
      'Use pitodo action=log to append progress notes as you work — be specific about what you did.',
      'Use pitodo action=status status=review when your work is ready for Kuba to review.',
      'Always set author=pi when logging or creating tasks on your own behalf.',
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('list'),
        Type.Literal('get'),
        Type.Literal('add'),
        Type.Literal('status'),
        Type.Literal('log'),
        Type.Literal('update'),
        Type.Literal('delete'),
      ], { description: 'Action to perform' }),

      // list filters
      filterStatus: Type.Optional(StatusEnum()),
      filterTag:    Type.Optional(Type.String({ description: 'Filter by tag e.g. snapcap, highfive' })),
      all:          Type.Optional(Type.Boolean({ description: 'Include done and cancelled tasks' })),

      // get / status / log / update / delete
      id: Type.Optional(Type.String({ description: 'Task ID (or unique prefix)' })),

      // add / update
      title:       Type.Optional(Type.String({ description: 'Task title' })),
      description: Type.Optional(Type.String({ description: 'Task body / PRD content' })),
      parentId:    Type.Optional(Type.String({ description: 'Parent task ID for subtasks' })),
      tags:        Type.Optional(Type.Array(Type.String(), { description: 'Project/context labels e.g. ["snapcap", "highfive"]' })),
      priority:    Type.Optional(Type.Number({ minimum: 1, maximum: 3, description: '1=low 2=medium 3=high' })),

      // log
      text:   Type.Optional(Type.String({ description: 'Note text to append to the task log' })),
      author: Type.Optional(AuthorEnum()),

      // status
      status: Type.Optional(StatusEnum()),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const store = readStore();
      const now = () => new Date().toISOString();

      // ── list ──────────────────────────────────────────────────────────────
      if (params.action === 'list') {
        let tasks = store.tasks;
        if (!params.all && !params.filterStatus) {
          tasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
        } else if (params.filterStatus) {
          tasks = tasks.filter(t => t.status === params.filterStatus);
        }
        if (params.filterTag) {
          tasks = tasks.filter(t => t.tags.includes(params.filterTag!));
        }
        return {
          content: [{ type: 'text', text: tasks.length === 0 ? 'No tasks.' : JSON.stringify(tasks, null, 2) }],
          details: { tasks },
        };
      }

      // ── get ───────────────────────────────────────────────────────────────
      if (params.action === 'get') {
        if (!params.id) throw new Error('id is required for get');
        const task = findTask(store, params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const children = store.tasks.filter(t => t.parentId === task.id);
        return {
          content: [{ type: 'text', text: JSON.stringify({ ...task, subtasks: children }, null, 2) }],
          details: { task, subtasks: children },
        };
      }

      // ── add ───────────────────────────────────────────────────────────────
      if (params.action === 'add') {
        if (!params.title) throw new Error('title is required for add');
        const at = now();
        const task: Task = {
          id: generateId(),
          title: params.title,
          description: params.description,
          parentId: params.parentId,
          tags: params.tags ?? [],
          priority: (params.priority ?? 1) as Priority,
          status: 'open',
          createdAt: at,
          updatedAt: at,
          log: params.text ? [{ at, author: (params.author ?? 'pi') as Author, text: params.text }] : [],
        };
        store.tasks.push(task);
        writeStore(store);
        return {
          content: [{ type: 'text', text: `Added task #${task.id}: ${task.title}` }],
          details: { task },
        };
      }

      // ── status ────────────────────────────────────────────────────────────
      if (params.action === 'status') {
        if (!params.id) throw new Error('id is required for status');
        if (!params.status) throw new Error('status is required for status action');
        const task = findTask(store, params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const prev = task.status;
        task.status = params.status as Status;
        task.updatedAt = now();
        writeStore(store);
        return {
          content: [{ type: 'text', text: `#${task.id} status: ${prev} → ${task.status}` }],
          details: { task },
        };
      }

      // ── log ───────────────────────────────────────────────────────────────
      if (params.action === 'log') {
        if (!params.id) throw new Error('id is required for log');
        if (!params.text) throw new Error('text is required for log');
        const task = findTask(store, params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const entry = { at: now(), author: (params.author ?? 'pi') as Author, text: params.text };
        task.log.push(entry);
        task.updatedAt = entry.at;
        writeStore(store);
        return {
          content: [{ type: 'text', text: `Note added to #${task.id}` }],
          details: { task },
        };
      }

      // ── update ────────────────────────────────────────────────────────────
      if (params.action === 'update') {
        if (!params.id) throw new Error('id is required for update');
        const task = findTask(store, params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        if (params.title       !== undefined) task.title       = params.title;
        if (params.description !== undefined) task.description = params.description;
        if (params.priority    !== undefined) task.priority    = params.priority as Priority;
        if (params.parentId    !== undefined) task.parentId    = params.parentId;
        if (params.tags        !== undefined) task.tags        = params.tags;
        task.updatedAt = now();
        writeStore(store);
        return {
          content: [{ type: 'text', text: `Updated #${task.id}` }],
          details: { task },
        };
      }

      // ── delete ────────────────────────────────────────────────────────────
      if (params.action === 'delete') {
        if (!params.id) throw new Error('id is required for delete');
        const idx = store.tasks.findIndex(t => t.id === params.id || t.id.startsWith(params.id!));
        if (idx === -1) throw new Error(`Task not found: ${params.id}`);
        const [removed] = store.tasks.splice(idx, 1);
        writeStore(store);
        return {
          content: [{ type: 'text', text: `Deleted #${removed.id}: ${removed.title}` }],
          details: { task: removed },
        };
      }

      throw new Error(`Unknown action: ${params.action}`);
    },
  });
}
