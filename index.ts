import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import {
  addProject,
  addTask,
  appendLog,
  deleteProject,
  deleteTask,
  findProject,
  findTask,
  listProjects,
  listTasks,
  updateProject,
  updateTask,
} from './src/store.js';
import type { Author, Status } from './src/types.js';

const StatusEnum = () => Type.Union([
  Type.Literal('open'),
  Type.Literal('in_progress'),
  Type.Literal('done'),
  Type.Literal('cancelled'),
]);

const AuthorString = () => Type.String({ description: 'Who is logging this note (e.g. your name, "pi", "ci")' });

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'pitodo',
    label: 'Pi Todo',
    description: 'Manage tasks and projects. Tree: Project → Task → Subtask. Wiki-links for knowledge references.',
    promptSnippet: 'Manage tasks and projects: add/list/get/status/log/update/delete plus project CRUD',
    promptGuidelines: [
      'Use pitodo action=status to move a task to in_progress when you start working on it.',
      'Use pitodo action=log to append progress notes as you work — be specific about what you did.',
      'Use pitodo action=status status=done when work is complete.',
      'Always set author=pi when logging or creating tasks on your own behalf.',
      'Use [[wiki-links]] in descriptions to reference knowledge base pages.',
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
        Type.Literal('project_list'),
        Type.Literal('project_get'),
        Type.Literal('project_add'),
        Type.Literal('project_update'),
        Type.Literal('project_delete'),
      ], { description: 'Action to perform' }),

      filterStatus: Type.Optional(StatusEnum()),
      filterProject: Type.Optional(Type.String({ description: 'Filter tasks by project id' })),
      filterTag: Type.Optional(Type.String({ description: 'Filter tasks by tag' })),
      all: Type.Optional(Type.Boolean({ description: 'Include done and cancelled tasks' })),

      id: Type.Optional(Type.String({ description: 'Task ID (or unique prefix)' })),
      title: Type.Optional(Type.String({ description: 'Task title' })),
      description: Type.Optional(Type.String({ description: 'Task body — supports [[wiki-links]] to knowledge' })),
      parentId: Type.Optional(Type.String({ description: 'Parent task ID (makes this a subtask)' })),
      projectId: Type.Optional(Type.String({ description: 'Project id' })),
      tags: Type.Optional(Type.Array(Type.String(), { description: 'Task tags' })),

      name: Type.Optional(Type.String({ description: 'Project display name' })),

      text: Type.Optional(Type.String({ description: 'Note text to append to the task log' })),
      author: Type.Optional(AuthorString()),
      status: Type.Optional(StatusEnum()),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const now = () => new Date().toISOString();

      if (params.action === 'list') {
        let projectSlug: string | undefined;
        if (params.filterProject) {
          const project = await findProject(params.filterProject);
          if (!project) throw new Error(`Project not found: ${params.filterProject}`);
          projectSlug = project.id;
        }
        const tasks = await listTasks({
          status: params.filterStatus as Status | undefined,
          project: projectSlug,
          tag: params.filterTag,
          all: params.all,
        });
        return {
          content: [{ type: 'text', text: tasks.length === 0 ? 'No tasks.' : JSON.stringify(tasks, null, 2) }],
          details: { tasks },
        };
      }

      if (params.action === 'get') {
        if (!params.id) throw new Error('id is required for get');
        const task = await findTask(params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const children = await listTasks({ parent: task.id, all: true });
        const payload = { ...task, subtasks: children };
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          details: payload,
        };
      }

      if (params.action === 'add') {
        if (!params.title) throw new Error('title is required for add');
        const task = await addTask({
          title: params.title,
          description: params.description,
          parentId: params.parentId,
          projectId: params.projectId,
          tags: params.tags,
          note: params.text ? { text: params.text, author: (params.author ?? 'pi') } : undefined,
        });
        return {
          content: [{ type: 'text', text: `Added task #${task.id}: ${task.title}` }],
          details: { task },
        };
      }

      if (params.action === 'status') {
        if (!params.id) throw new Error('id is required for status');
        if (!params.status) throw new Error('status is required for status action');
        const task = await findTask(params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const prev = task.status;
        const updated = await updateTask(task.id, { status: params.status as Status });
        return {
          content: [{ type: 'text', text: `#${task.id} status: ${prev} → ${params.status}` }],
          details: { task: updated },
        };
      }

      if (params.action === 'log') {
        if (!params.id) throw new Error('id is required for log');
        if (!params.text) throw new Error('text is required for log');
        const task = await findTask(params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const entry = { at: now(), author: (params.author ?? 'pi') as Author, text: params.text };
        await appendLog(task.id, entry);
        return {
          content: [{ type: 'text', text: `Note added to #${task.id}` }],
          details: { task: { ...task, log: [entry, ...task.log] } },
        };
      }

      if (params.action === 'update') {
        if (!params.id) throw new Error('id is required for update');
        const task = await findTask(params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const updated = await updateTask(task.id, {
          title: params.title,
          description: params.description,
          parentId: params.parentId,
          projectId: params.projectId,
          tags: params.tags,
        });
        return {
          content: [{ type: 'text', text: `Updated #${updated.id}` }],
          details: { task: updated },
        };
      }

      if (params.action === 'delete') {
        if (!params.id) throw new Error('id is required for delete');
        const task = await findTask(params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        await deleteTask(task.id);
        return {
          content: [{ type: 'text', text: `Deleted #${task.id}: ${task.title}` }],
          details: { task },
        };
      }

      if (params.action === 'project_list') {
        const projects = await listProjects();
        return {
          content: [{ type: 'text', text: projects.length === 0 ? 'No projects.' : JSON.stringify(projects, null, 2) }],
          details: { projects },
        };
      }

      if (params.action === 'project_get') {
        if (!params.projectId) throw new Error('projectId is required for project_get');
        const project = await findProject(params.projectId);
        if (!project) throw new Error(`Project not found: ${params.projectId}`);
        const tasks = await listTasks({ project: project.id, all: true });
        return {
          content: [{ type: 'text', text: JSON.stringify({ ...project, tasks }, null, 2) }],
          details: { project, tasks },
        };
      }

      if (params.action === 'project_add') {
        if (!params.name) throw new Error('name is required for project_add');
        const project = await addProject({
          id: params.projectId,
          name: params.name,
          description: params.description,
        });
        return {
          content: [{ type: 'text', text: `Added project ${project.name} (${project.id})` }],
          details: { project },
        };
      }

      if (params.action === 'project_update') {
        if (!params.projectId) throw new Error('projectId is required for project_update');
        const existing = await findProject(params.projectId);
        if (!existing) throw new Error(`Project not found: ${params.projectId}`);
        const updated = await updateProject(existing.id, {
          name: params.name,
          description: params.description,
        });
        return {
          content: [{ type: 'text', text: `Updated project ${updated.name} (${updated.id})` }],
          details: { project: updated },
        };
      }

      if (params.action === 'project_delete') {
        if (!params.projectId) throw new Error('projectId is required for project_delete');
        const project = await findProject(params.projectId);
        if (!project) throw new Error(`Project not found: ${params.projectId}`);
        await deleteProject(project.id);
        return {
          content: [{ type: 'text', text: `Deleted project ${project.id}` }],
          details: { project },
        };
      }

      throw new Error(`Unknown action: ${params.action}`);
    },
  });
}
