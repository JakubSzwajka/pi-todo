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
  getTaskProject,
  getUnresolvedDependencies,
  listProjects,
  listTasks,
  normalizeProjectInput,
  statusRequiresResolvedDependencies,
  updateProject,
  updateTask,
  updateTaskProperty,
  validateDependsOnIds,
  validateProject,
  validateTaskProjectAssignment,
} from './src/store.js';
import type { Author, ProjectRepo, Status, Task } from './src/types.js';

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
        const enriched = await Promise.all(tasks.map(async t => ({ ...t, project: await getTaskProject(t) })));
        return {
          content: [{ type: 'text', text: enriched.length === 0 ? 'No tasks.' : JSON.stringify(enriched, null, 2) }],
          details: { tasks: enriched },
        };
      }

      if (params.action === 'get') {
        if (!params.id) throw new Error('id is required for get');
        const task = await findTask(params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const children = await listTasks({ parent: task.id, all: true });
        const allTasks = await listTasks({ all: true });
        const blockedBy = allTasks.filter(t => (t.dependsOnIds ?? []).includes(task.id));
        const payload = {
          ...task,
          project: await getTaskProject(task),
          subtasks: await Promise.all(children.map(async child => ({ ...child, project: await getTaskProject(child) }))),
          blockedBy: await Promise.all(blockedBy.map(async child => ({ ...child, project: await getTaskProject(child) }))),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          details: payload,
        };
      }

      if (params.action === 'add') {
        if (!params.title) throw new Error('title is required for add');
        // Build a temporary task-like object for validation
        const tempTask: Task = {
          id: '__pending__',
          title: params.title,
          description: params.description,
          parentId: params.parentId,
          projectId: params.parentId ? undefined : params.projectId,
          tags: [...new Set<string>(params.tags ?? [])],
          dependsOnIds: [...new Set<string>(params.dependsOnIds ?? [])],
          status: 'open',
          createdAt: now(),
          updatedAt: now(),
          log: [],
        };
        const assignmentError = await validateTaskProjectAssignment(tempTask);
        if (assignmentError) throw new Error(assignmentError);
        const dependencyError = await validateDependsOnIds(tempTask, tempTask.dependsOnIds);
        if (dependencyError) throw new Error(dependencyError);
        const task = await addTask({
          title: params.title,
          description: params.description,
          parentId: params.parentId,
          projectId: params.projectId,
          tags: params.tags,
          dependsOnIds: params.dependsOnIds,
          note: params.text ? { text: params.text, author: (params.author ?? 'lucy') } : undefined,
        });
        return {
          content: [{ type: 'text', text: `Added task #${task.id}: ${task.title}` }],
          details: { task: { ...task, project: await getTaskProject(task) } },
        };
      }

      if (params.action === 'status') {
        if (!params.id) throw new Error('id is required for status');
        if (!params.status) throw new Error('status is required for status action');
        const task = await findTask(params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const nextStatus = params.status as Status;
        const unresolved = statusRequiresResolvedDependencies(nextStatus) ? await getUnresolvedDependencies(task) : [];
        if (unresolved.length > 0) {
          throw new Error(`Cannot move #${task.id} to ${nextStatus}; unresolved dependencies: ${unresolved.map(t => `#${t.id}`).join(', ')}`);
        }
        const prev = task.status;
        await updateTaskProperty(task.id, 'status', nextStatus);
        const updated = { ...task, status: nextStatus, updatedAt: now() };
        return {
          content: [{ type: 'text', text: `#${task.id} status: ${prev} → ${nextStatus}` }],
          details: { task: { ...updated, project: await getTaskProject(updated) } },
        };
      }

      if (params.action === 'log') {
        if (!params.id) throw new Error('id is required for log');
        if (!params.text) throw new Error('text is required for log');
        const task = await findTask(params.id);
        if (!task) throw new Error(`Task not found: ${params.id}`);
        const entry = { at: now(), author: (params.author ?? 'lucy') as Author, text: params.text };
        await appendLog(task.id, entry);
        const updated = { ...task, log: [...task.log, entry], updatedAt: entry.at };
        return {
          content: [{ type: 'text', text: `Note added to #${task.id}` }],
          details: { task: { ...updated, project: await getTaskProject(updated) } },
        };
      }

      if (params.action === 'update') {
        if (!params.id) throw new Error('id is required for update');
        const task = await findTask(params.id);
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
        const assignmentError = await validateTaskProjectAssignment(nextTask);
        if (assignmentError) throw new Error(assignmentError);
        const dependencyError = await validateDependsOnIds(nextTask, nextTask.dependsOnIds);
        if (dependencyError) throw new Error(dependencyError);
        const updated = await updateTask(task.id, {
          title: params.title,
          description: params.description,
          parentId: params.parentId,
          projectId: nextTask.projectId,
          tags: params.tags,
          dependsOnIds: params.dependsOnIds,
        });
        return {
          content: [{ type: 'text', text: `Updated #${updated.id}` }],
          details: { task: { ...updated, project: await getTaskProject(updated) } },
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
        const candidate = normalizeProjectInput({
          id: params.projectId,
          name: params.name,
          description: params.description,
          repos: params.repos as ProjectRepo[] | undefined,
        });
        candidate.archived = params.archived ? true : undefined;
        const error = await validateProject(candidate);
        if (error) throw new Error(error);
        const project = await addProject({
          id: params.projectId,
          name: params.name,
          description: params.description,
          repos: params.repos as ProjectRepo[] | undefined,
        });
        project.archived = params.archived ? true : undefined;
        return {
          content: [{ type: 'text', text: `Added project ${project.name} (${project.id})` }],
          details: { project },
        };
      }

      if (params.action === 'project_update') {
        if (!params.projectId) throw new Error('projectId is required for project_update');
        const existing = await findProject(params.projectId);
        if (!existing) throw new Error(`Project not found: ${params.projectId}`);
        const candidate = normalizeProjectInput({
          id: params.id ?? existing.id,
          name: params.name,
          description: params.description,
          repos: params.repos as ProjectRepo[] | undefined,
        }, existing);
        candidate.archived = params.archived === undefined ? existing.archived : (params.archived ? true : undefined);
        const error = await validateProject(candidate, existing.id);
        if (error) throw new Error(error);
        const updated = await updateProject(existing.id, {
          nextId: params.id,
          name: params.name,
          description: params.description,
          repos: params.repos as ProjectRepo[] | undefined,
          archived: params.archived,
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
