import { toUtcMidnightMs } from './dates.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const toDependencyArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(/[,\n;]+/g);
  return [];
};

const toUtcMs = (value) => {
  const ms = toUtcMidnightMs(value);
  return Number.isFinite(ms) ? ms : null;
};

const utcMsToYmd = (utcMs) => {
  if (!Number.isFinite(utcMs)) return '';
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const sanitizeTaskDependencies = (tasks) => {
  if (!Array.isArray(tasks)) return [];

  const validIds = new Set(tasks.map((task) => String(task?.id ?? '')).filter(Boolean));

  return tasks.map((task) => {
    const ownId = String(task?.id ?? '');
    const rawDeps = task?.dependencies ?? task?.dependsOn ?? task?.predecessors ?? [];
    const deps = [];

    toDependencyArray(rawDeps).forEach((depValue) => {
      const depId = String(depValue ?? '').trim();
      if (!depId) return;
      if (!validIds.has(depId)) return;
      if (depId === ownId) return;
      if (deps.includes(depId)) return;
      deps.push(depId);
    });

    return { ...(task || {}), id: ownId, dependencies: deps };
  });
};

export const findDependencyCycleIds = (tasks) => {
  const safeTasks = sanitizeTaskDependencies(tasks);
  const graph = new Map(safeTasks.map((task) => [String(task.id), task.dependencies || []]));
  const state = new Map();
  const stack = [];
  const cycleIds = new Set();

  const visit = (id) => {
    state.set(id, 1);
    stack.push(id);

    const deps = graph.get(id) || [];
    deps.forEach((depId) => {
      if (!graph.has(depId)) return;
      const depState = state.get(depId) || 0;
      if (depState === 0) {
        visit(depId);
        return;
      }
      if (depState === 1) {
        const cycleStart = stack.lastIndexOf(depId);
        if (cycleStart >= 0) {
          for (let i = cycleStart; i < stack.length; i += 1) {
            cycleIds.add(stack[i]);
          }
        }
        cycleIds.add(depId);
      }
    });

    stack.pop();
    state.set(id, 2);
  };

  graph.forEach((_deps, id) => {
    if ((state.get(id) || 0) !== 0) return;
    visit(id);
  });

  return Array.from(cycleIds);
};

export const applyDependencyScheduling = (tasks) => {
  const safeTasks = sanitizeTaskDependencies(tasks);
  const cycleSet = new Set(findDependencyCycleIds(safeTasks));
  const idToIndex = new Map(safeTasks.map((task, idx) => [String(task.id), idx]));

  const indegree = new Map();
  const dependents = new Map();

  safeTasks.forEach((task) => {
    const id = String(task.id);
    if (cycleSet.has(id)) return;
    indegree.set(id, 0);
    dependents.set(id, []);
  });

  safeTasks.forEach((task) => {
    const id = String(task.id);
    if (!indegree.has(id)) return;
    (task.dependencies || []).forEach((depId) => {
      if (!indegree.has(depId)) return;
      indegree.set(id, (indegree.get(id) || 0) + 1);
      dependents.get(depId)?.push(id);
    });
  });

  const queue = [];
  indegree.forEach((value, id) => {
    if (value === 0) queue.push(id);
  });

  const orderedIds = [];
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const id = queue[queueIndex];
    orderedIds.push(id);
    (dependents.get(id) || []).forEach((nextId) => {
      const nextDegree = (indegree.get(nextId) || 0) - 1;
      indegree.set(nextId, nextDegree);
      if (nextDegree === 0) queue.push(nextId);
    });
  }

  const startMsById = new Map();
  const endMsById = new Map();
  safeTasks.forEach((task) => {
    const id = String(task.id);
    let startMs = toUtcMs(task.start);
    let endMs = toUtcMs(task.end || task.start);

    if (startMs != null && endMs == null) endMs = startMs;
    if (endMs != null && startMs == null) startMs = endMs;
    if (startMs != null && endMs != null && endMs < startMs) {
      const temp = startMs;
      startMs = endMs;
      endMs = temp;
    }

    startMsById.set(id, startMs);
    endMsById.set(id, endMs);
  });

  const shiftedTaskIds = new Set();

  orderedIds.forEach((id) => {
    const index = idToIndex.get(id);
    if (!Number.isInteger(index)) return;
    const task = safeTasks[index];
    const deps = task.dependencies || [];

    let earliestStartMs = null;
    deps.forEach((depId) => {
      const depEndMs = endMsById.get(depId) ?? startMsById.get(depId);
      if (depEndMs == null) return;
      const candidate = depEndMs + DAY_MS;
      if (earliestStartMs == null || candidate > earliestStartMs) earliestStartMs = candidate;
    });

    let startMs = startMsById.get(id);
    let endMs = endMsById.get(id);

    const durationDays =
      startMs != null && endMs != null ? Math.max(1, Math.round((endMs - startMs) / DAY_MS) + 1) : 1;

    if (earliestStartMs != null && (startMs == null || startMs < earliestStartMs)) {
      startMs = earliestStartMs;
      endMs = earliestStartMs + (durationDays - 1) * DAY_MS;
      shiftedTaskIds.add(id);
    } else if (startMs != null && (endMs == null || endMs < startMs)) {
      endMs = startMs + (durationDays - 1) * DAY_MS;
      shiftedTaskIds.add(id);
    }

    startMsById.set(id, startMs);
    endMsById.set(id, endMs);
  });

  const nextTasks = safeTasks.map((task) => {
    const id = String(task.id);
    const nextStartMs = startMsById.get(id);
    const nextEndMs = endMsById.get(id);

    const nextStart = nextStartMs == null ? String(task.start || '') : utcMsToYmd(nextStartMs);
    const nextEnd = nextEndMs == null ? String(task.end || task.start || '') : utcMsToYmd(nextEndMs);

    return { ...task, start: nextStart, end: nextEnd };
  });

  return {
    tasks: nextTasks,
    shiftedTaskIds: Array.from(shiftedTaskIds),
    cycleTaskIds: Array.from(cycleSet),
  };
};
