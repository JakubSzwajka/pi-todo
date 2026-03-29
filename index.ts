import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import {
  readStore,
  writeStore,
  generateId,
  findTask,
  findProject,
  validateDependsOnIds,
  validateProject,
  validateTaskProjectAssignment,
  getUnresolvedDependencies,
  statusRequiresResolvedDependencies,
  getTaskProject,
  getTaskProjectId,
  normalizeProjectInput,
} from './src/store.js';
import type { Status, Author, Task, ProjectRepo } from './src/types.js';

const StatusEnum = () => Type.Union([
  Type.Literal('open'),
  Type.Literal('in_progress'),
  Type.Literal('review'),
  Type.Literal('testing'),
  Type.Literal('waiting'),
  Type.Literal('done'),
  Type.Literal('cancelled'),
]);

const RepoKindEnum = () => Type.Union([
  Type.Literal('local'),
  Type.Literal('github'),
  Type.Literal('git'),
]);

const RepoSchema = () => Type.Object({
  id: Type.Optional(Type.String()),
  label: Type.String(),
  kind: RepoKindEnum(),
  path: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
  primary: Type.Optional(Type.Boolean()),
});

const AuthorString = () => Type.String({ description: 'Who is logging this note (e.g. your name, "pi", "ci")' });

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'pitodo',
    label: 'Pi Todo',
    description: 'Manage tasks and projects. Projects can contain repo metadata (local paths and git/GitHub URLs).',
    promptSnippet: 'Manage tasks and projects: add/list/get/status/log/update/delete plus project CRUD',
    promptGuidelines: [
      'Use pitodo action=status to move a task to in_progress when you start working on it.',
      'Use pitodo action=log to append progress notes as you work — be specific about what you did.',
      'Use pitodo action=status status=review when your work is ready for Kuba to review.',
      'Always set author=pi when logging or creating tasks on your own behalf.',
      'Use projects for durable repo/workspace context. Subtasks inherit projects from parents.',
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
      description: Type.Optional(Type.String({ description: 'Task body / PRD content' })),
      parentId: Type.Optional(Type.String({ description: 'Parent task ID for subtasks' })),
      projectId: Type.Optional(Type.String({ description: 'Project id for task assignment or project CRUD' })),
      tags: Type.Optional(Type.Array(Type.String(), { description: 'Secondary task tags' })),
      dependsOnIds: Type.Optional(Type.Array(Type.String(), { description: 'Task IDs this task depends on; all must be done before advancing' })),

      name: Type.Optional(Type.String({ description: 'Project display name' })),
      repos: Type.Optional(Type.Array(RepoSchema(), { description: 'Project repos: local paths and/or git URLs' })),
      archived: Type.Optional(Type.Boolean({ description: 'Archive state for a project' })),

      text: Type.Optional(Type.String({ description: 'Note text to append to the task log' })),
      author: Type.Optional(AuthorString()),
      status: Type.Optional(StatusEnum()),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const store = readStore();
      const now = () => new Date().toISOString();

      if (params.action === 'list') {
        let tasks = store.tasks;
        if (!params.all && !params.filterStatus) tasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
        else if (params.filterStatus) tasks = tasks.filter(t => t.status === params.filterStatus);
        if (params.filterProject) {
          const project = findProject(store, params.filterProject);
          if (!project) throw new Error(`Project not found: ${params.filterProject}`);
          tasks = tasks.filter(task => getTaskProjectId(store, task) === project.id);
        }
        if (params.filterTag) {
          tasks = tasks.filter(task => task.tags.includes(params.filterTag!));
        }
        const enriched = tasks.map(task => ({ ...task, project: getTaskProject(store, task) }));
        return {
          content: [{ type: 'text', text: enriched.length === 0 ? 'No tasks.' : JSON.stringify(enriched, null, 2) }],
          details: { tasks: enriched },
        };
      }

      if (params.action === 'get') {
        if (!params.id) throw new Error('id is required for get');
        const task = findTask(store, params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const children = store.tasks.filter(t => t.parentId === task.id);
        const blockedBy = store.tasks.filter(t => (t.dependsOnIds ?? []).includes(task.id));
        const payload = {
          ...task,
          project: getTaskProject(store, task),
          subtasks: children.map(child => ({ ...child, project: getTaskProject(store, child) })),
          blockedBy: blockedBy.map(child => ({ ...child, project: getTaskProject(store, child) })),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          details: payload,
        };
      }

      if (params.action === 'add') {
        if (!params.title) throw new Error('title is required for add');
        const at = now();
        const task: Task = {
          id: generateId(),
          title: params.title,
          description: params.description,
          parentId: params.parentId,
          projectId: params.parentId ? undefined : params.projectId,
          tags: [...new Set(params.tags ?? [])],
          dependsOnIds: [...new Set(params.dependsOnIds ?? [])],
          status: 'open',
          createdAt: at,
          updatedAt: at,
          log: params.text ? [{ at, author: (params.author ?? 'lucy') as Author, text: params.text }] : [],
        };
        const assignmentError = validateTaskProjectAssignment(store, task);
        if (assignmentError) throw new Error(assignmentError);
        const dependencyError = validateDependsOnIds(store, task, task.dependsOnIds);
        if (dependencyError) throw new Error(dependencyError);
        store.tasks.push(task);
        writeStore(store);
        return {
          content: [{ type: 'text', text: `Added task #${task.id}: ${task.title}` }],
          details: { task: { ...task, project: getTaskProject(store, task) } },
        };
      }

      if (params.action === 'status') {
        if (!params.id) throw new Error('id is required for status');
        if (!params.status) throw new Error('status is required for status action');
        const task = findTask(store, params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const nextStatus = params.status as Status;
        const unresolved = statusRequiresResolvedDependencies(nextStatus) ? getUnresolvedDependencies(store, task) : [];
        if (unresolved.length > 0) {
          throw new Error(`Cannot move #${task.id} to ${nextStatus}; unresolved dependencies: ${unresolved.map(t => `#${t.id}`).join(', ')}`);
        }
        const prev = task.status;
        task.status = nextStatus;
        task.updatedAt = now();
        writeStore(store);
        return {
          content: [{ type: 'text', text: `#${task.id} status: ${prev} → ${task.status}` }],
          details: { task: { ...task, project: getTaskProject(store, task) } },
        };
      }

      if (params.action === 'log') {
        if (!params.id) throw new Error('id is required for log');
        if (!params.text) throw new Error('text is required for log');
        const task = findTask(store, params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const entry = { at: now(), author: (params.author ?? 'lucy') as Author, text: params.text };
        task.log.push(entry);
        task.updatedAt = entry.at;
        writeStore(store);
        return {
          content: [{ type: 'text', text: `Note added to #${task.id}` }],
          details: { task: { ...task, project: getTaskProject(store, task) } },
        };
      }

      if (params.action === 'update') {
        if (!params.id) throw new Error('id is required for update');
        const task = findTask(store, params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const nextTask: Task = {
          ...task,
          title: params.title ?? task.title,
          description: params.description ?? task.description,
          parentId: params.parentId ?? task.parentId,
          projectId: (params.parentId ?? task.parentId) ? undefined : (params.projectId ?? task.projectId),
          tags: params.tags ?? task.tags,
          dependsOnIds: params.dependsOnIds ?? task.dependsOnIds ?? [],
        };
        const assignmentError = validateTaskProjectAssignment(store, nextTask);
        if (assignmentError) throw new Error(assignmentError);
        const dependencyError = validateDependsOnIds(store, nextTask, nextTask.dependsOnIds);
        if (dependencyError) throw new Error(dependencyError);
        task.title = nextTask.title;
        task.description = nextTask.description;
        task.parentId = nextTask.parentId;
        task.projectId = nextTask.projectId;
        task.tags = nextTask.tags;
        task.dependsOnIds = nextTask.dependsOnIds;
        task.updatedAt = now();
        writeStore(store);
        return {
          content: [{ type: 'text', text: `Updated #${task.id}` }],
          details: { task: { ...task, project: getTaskProject(store, task) } },
        };
      }

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

      if (params.action === 'project_list') {
        return {
          content: [{ type: 'text', text: store.projects.length === 0 ? 'No projects.' : JSON.stringify(store.projects, null, 2) }],
          details: { projects: store.projects },
        };
      }

      if (params.action === 'project_get') {
        if (!params.projectId) throw new Error('projectId is required for project_get');
        const project = findProject(store, params.projectId);
        if (!project) throw new Error(`Project not found: ${params.projectId}`);
        const tasks = store.tasks.filter(task => getTaskProjectId(store, task) === project.id);
        return {
          content: [{ type: 'text', text: JSON.stringify({ ...project, tasks }, null, 2) }],
          details: { project, tasks },
        };
      }

      if (params.action === 'project_add') {
        if (!params.name) throw new Error('name is required for project_add');
        const project = normalizeProjectInput({
          id: params.projectId,
          name: params.name,
          description: params.description,
          repos: params.repos as ProjectRepo[] | undefined,
        });
        project.archived = params.archived ? true : undefined;
        const error = validateProject(store, project);
        if (error) throw new Error(error);
        store.projects.push(project);
        writeStore(store);
        return {
          content: [{ type: 'text', text: `Added project ${project.name} (${project.id})` }],
          details: { project },
        };
      }

      if (params.action === 'project_update') {
        if (!params.projectId) throw new Error('projectId is required for project_update');
        const existing = findProject(store, params.projectId);
        if (!existing) throw new Error(`Project not found: ${params.projectId}`);
        const project = normalizeProjectInput({
          id: params.id ?? existing.id,
          name: params.name,
          description: params.description,
          repos: params.repos as ProjectRepo[] | undefined,
        }, existing);
        project.archived = params.archived === undefined ? existing.archived : (params.archived ? true : undefined);
        const error = validateProject(store, project, existing.id);
        if (error) throw new Error(error);
        const previousId = existing.id;
        existing.id = project.id;
        existing.name = project.name;
        existing.description = project.description;
        existing.repos = project.repos;
        existing.archived = project.archived;
        existing.updatedAt = now();
        if (previousId !== existing.id) {
          for (const task of store.tasks) {
            if (task.projectId === previousId) task.projectId = existing.id;
          }
        }
        writeStore(store);
        return {
          content: [{ type: 'text', text: `Updated project ${existing.name} (${existing.id})` }],
          details: { project: existing },
        };
      }

      if (params.action === 'project_delete') {
        if (!params.projectId) throw new Error('projectId is required for project_delete');
        const project = findProject(store, params.projectId);
        if (!project) throw new Error(`Project not found: ${params.projectId}`);
        const inUse = store.tasks.some(task => getTaskProjectId(store, task) === project.id);
        if (inUse) throw new Error(`Cannot delete project ${project.id}; tasks still reference it`);
        store.projects = store.projects.filter(candidate => candidate.id !== project.id);
        writeStore(store);
        return {
          content: [{ type: 'text', text: `Deleted project ${project.id}` }],
          details: { project },
        };
      }

      throw new Error(`Unknown action: ${params.action}`);
    },
  });
}
