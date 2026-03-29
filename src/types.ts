export type Status = 'open' | 'in_progress' | 'review' | 'testing' | 'waiting' | 'done' | 'cancelled';
export type Author = string;
export type ProjectRepoKind = 'local' | 'github' | 'git';

export interface LogEntry {
  at: string;
  author: Author;
  text: string;
}

export interface ProjectRepo {
  id: string;
  label: string;
  kind: ProjectRepoKind;
  path?: string;
  url?: string;
  primary?: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  repos: ProjectRepo[];
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  parentId?: string;
  projectId?: string;
  tags: string[];
  dependsOnIds?: string[];
  status: Status;
  createdAt: string;
  updatedAt: string;
  log: LogEntry[];
}

export interface Store {
  projects: Project[];
  tasks: Task[];
}
