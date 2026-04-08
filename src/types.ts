export type Status = 'open' | 'in_progress' | 'done' | 'cancelled';
export type Author = string;

export interface LogEntry {
  at: string;
  author: Author;
  text: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  parentId?: string;
  projectId?: string;
  tags: string[];
  status: Status;
  createdAt: string;
  updatedAt: string;
  log: LogEntry[];
}
