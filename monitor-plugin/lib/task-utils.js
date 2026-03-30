export function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export function getDependencies(task, allTasks) {
  return allTasks.filter(candidate => (task.dependsOnIds ?? []).includes(candidate.id));
}

export function getBlockedBy(task, allTasks) {
  return allTasks.filter(candidate => (candidate.dependsOnIds ?? []).includes(task.id));
}

export function getUnresolvedDependencies(task, allTasks) {
  return getDependencies(task, allTasks).filter(dep => dep.status !== 'done');
}

export function topologicalSubtasks(subtasks) {
  const ids = new Set(subtasks.map(task => task.id));
  const visited = new Set();
  const result = [];

  function visit(task) {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    for (const depId of (task.dependsOnIds ?? [])) {
      if (!ids.has(depId)) continue;
      const dep = subtasks.find(candidate => candidate.id === depId);
      if (dep) visit(dep);
    }
    result.push(task);
  }

  for (const task of subtasks) visit(task);
  return result;
}
