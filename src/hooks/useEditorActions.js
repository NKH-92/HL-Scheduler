import { useCallback } from 'react';
import { generateId, newTaskTemplate } from '../utils/data';
import { formatDate, toUtcMidnightMs } from '../utils/dates';
import { mergeRangePadding, sanitizeFitSettings, sanitizeZoomSettings } from '../utils/schedulerSettings';

export default function useEditorActions({
  alertAsync,
  confirmAsync,
  editingTask,
  formData,
  ganttViewMode,
  vacForm,
  setActiveEditorTab,
  setActiveMainTab,
  setEditingTask,
  setFilterText,
  setFitSettings,
  setFormData,
  setGanttViewMode,
  setIsModalOpen,
  setIsVacationPanelOpen,
  setProjectName,
  setPublicOrigin,
  setRangePadding,
  setTaskManagerResetToken,
  setTasks,
  setVacForm,
  setVacations,
  setZoomSettings,
  updateTasksWithRules,
}) {
  const openModal = useCallback(
    (task = null) => {
      if (task) {
        setEditingTask(task);
        setFormData({
          category: task.category || '',
          taskName: task.taskName || '',
          department: task.department || '',
          assignee: task.assignee || '',
          assigneeEmail: task.assigneeEmail || '',
          assigneePosition: task.assigneePosition || '',
          start: task.start || '',
          end: task.end || task.start || '',
          progress: Number(task.progress || 0),
          memo: task.memo || '',
          dependencies: Array.isArray(task.dependencies) ? task.dependencies.map((depId) => String(depId)) : [],
        });
      } else {
        setEditingTask(null);
        setFormData(newTaskTemplate());
      }
      setIsModalOpen(true);
    },
    [setEditingTask, setFormData, setIsModalOpen],
  );

  const handleSave = useCallback(() => {
    if (!String(formData.category || '').trim() || !String(formData.taskName || '').trim()) {
      void alertAsync('구분과 작업명은 필수입니다.');
      return;
    }

    const startMs = toUtcMidnightMs(formData.start);
    const endMs = toUtcMidnightMs(formData.end || formData.start);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      void alertAsync('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }

    const rawProgress = Number(formData.progress);
    const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;
    const dependencies = Array.isArray(formData.dependencies)
      ? Array.from(
          new Set(
            formData.dependencies
              .map((depId) => String(depId ?? '').trim())
              .filter((depId) => depId && (!editingTask || depId !== String(editingTask.id))),
          ),
        )
      : [];

    const payload = {
      ...formData,
      progress,
      end: formData.end || formData.start || '',
      assigneeEmail: String(formData.assigneeEmail || '').trim().toLowerCase(),
      assigneePosition: String(formData.assigneePosition || '').trim(),
      memo: String(formData.memo ?? ''),
      dependencies,
    };

    if (editingTask) {
      updateTasksWithRules(
        (prev) => prev.map((task) => (task.id === editingTask.id ? { ...payload, id: task.id } : task)),
        'task-update',
      );
    } else {
      updateTasksWithRules((prev) => [...prev, { ...payload, id: generateId() }], 'task-create');
    }

    setIsModalOpen(false);
  }, [alertAsync, editingTask, formData, setIsModalOpen, updateTasksWithRules]);

  const handleDelete = useCallback(
    async (id) => {
      const confirmed = await confirmAsync('이 작업을 삭제하시겠습니까?', {
        title: '작업 삭제',
        confirmText: '삭제',
        cancelText: '취소',
      });
      if (!confirmed) return;
      const deletedId = String(id);
      updateTasksWithRules(
        (prev) =>
          prev
            .filter((task) => String(task.id) !== deletedId)
            .map((task) => ({
              ...task,
              dependencies: Array.isArray(task.dependencies)
                ? task.dependencies.map((depId) => String(depId)).filter((depId) => depId !== deletedId)
                : [],
            })),
        'task-delete',
      );
    },
    [confirmAsync, updateTasksWithRules],
  );

  const moveTask = useCallback(
    (id, direction) => {
      updateTasksWithRules((prev) => {
        const index = prev.findIndex((task) => task.id === id);
        if (index < 0) return prev;
        const nextIndex = Math.min(prev.length - 1, Math.max(0, index + direction));
        if (nextIndex === index) return prev;
        const reordered = [...prev];
        const [task] = reordered.splice(index, 1);
        reordered.splice(nextIndex, 0, task);
        return reordered;
      }, 'task-reorder');
    },
    [updateTasksWithRules],
  );

  const moveTaskToIndex = useCallback(
    (id, toIndex) => {
      updateTasksWithRules((prev) => {
        const index = prev.findIndex((task) => task.id === id);
        if (index < 0) return prev;
        const nextIndex = Math.min(prev.length - 1, Math.max(0, Number(toIndex) - 1));
        if (nextIndex === index) return prev;
        const reordered = [...prev];
        const [task] = reordered.splice(index, 1);
        reordered.splice(nextIndex, 0, task);
        return reordered;
      }, 'task-reorder');
    },
    [updateTasksWithRules],
  );

  const sortTasksByStart = useCallback(
    (direction = 'asc') => {
      updateTasksWithRules((prev) => {
        const parseDate = (value) => {
          if (!value) return null;
          const timestamp = toUtcMidnightMs(value);
          return Number.isFinite(timestamp) ? timestamp : null;
        };

        return [...prev].sort((left, right) => {
          const leftTime = parseDate(left.start);
          const rightTime = parseDate(right.start);
          if (leftTime === null && rightTime === null) return 0;
          if (leftTime === null) return 1;
          if (rightTime === null) return -1;
          return direction === 'desc' ? rightTime - leftTime : leftTime - rightTime;
        });
      }, 'task-sort');
    },
    [updateTasksWithRules],
  );

  const updateTaskDates = useCallback(
    (taskId, start, end) => {
      const nextStart = String(start || '').trim();
      if (!nextStart) return;
      const nextEnd = String(end || '').trim() || nextStart;

      updateTasksWithRules(
        (prev) =>
          prev.map((task) => {
            if (task.id !== taskId) return task;
            if (task.start === nextStart && (task.end || task.start) === nextEnd) return task;
            return { ...task, start: nextStart, end: nextEnd };
          }),
        'task-date-update',
      );
    },
    [updateTasksWithRules],
  );

  const updateTaskMemo = useCallback(
    (taskId, memo) => {
      const nextMemo = String(memo ?? '');
      setTasks((prev) => {
        let changed = false;
        const nextTasks = prev.map((task) => {
          if (task.id !== taskId) return task;
          if (String(task.memo ?? '') === nextMemo) return task;
          changed = true;
          return { ...task, memo: nextMemo };
        });
        return changed ? nextTasks : prev;
      });
    },
    [setTasks],
  );

  const addVacation = useCallback(() => {
    if (!vacForm.start) {
      void alertAsync('휴가 시작일이 필요합니다.');
      return;
    }

    const start = vacForm.start;
    const end = vacForm.end || start;
    const startMs = toUtcMidnightMs(start);
    const endMs = toUtcMidnightMs(end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      void alertAsync('휴가 종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }

    const payload = {
      id: generateId(),
      title: (vacForm.title || '휴가').trim() || '휴가',
      start,
      end,
    };
    setVacations((prev) => [...prev, payload]);
    const today = formatDate(new Date());
    setVacForm({ title: '', start: today, end: today });
  }, [alertAsync, setVacForm, setVacations, vacForm]);

  const deleteVacation = useCallback(
    async (id) => {
      const confirmed = await confirmAsync('이 휴가 일정을 삭제하시겠습니까?', {
        title: '휴가 삭제',
        confirmText: '삭제',
        cancelText: '취소',
      });
      if (!confirmed) return;
      setVacations((prev) => prev.filter((vacation) => vacation.id !== id));
    },
    [confirmAsync, setVacations],
  );

  const updatePadding = useCallback(
    (key, value) => {
      const nextValue = Math.max(0, Number(value || 0));
      setRangePadding((prev) => ({
        ...prev,
        [ganttViewMode]: { ...(prev[ganttViewMode] || {}), [key]: nextValue },
      }));
    },
    [ganttViewMode, setRangePadding],
  );

  const updateFit = useCallback(
    (enabled) => {
      setFitSettings((prev) => {
        const current = prev[ganttViewMode] || { enabled: false };
        return { ...prev, [ganttViewMode]: { ...current, enabled: !!enabled } };
      });
    },
    [ganttViewMode, setFitSettings],
  );

  const updateZoom = useCallback(
    (value) => {
      const nextValue = Math.round(Number(value));
      if (!Number.isFinite(nextValue)) return;
      const clamped = Math.max(25, Math.min(300, nextValue));
      setZoomSettings((prev) => ({ ...prev, [ganttViewMode]: clamped }));
    },
    [ganttViewMode, setZoomSettings],
  );

  const updateProjectName = useCallback(
    (nextName) => {
      setProjectName(nextName);
    },
    [setProjectName],
  );

  const resetProjectState = useCallback(() => {
    const today = formatDate(new Date());
    setTasks([]);
    setProjectName('');
    setVacations([]);
    setRangePadding(mergeRangePadding(null));
    setFitSettings(sanitizeFitSettings(null));
    setZoomSettings(sanitizeZoomSettings(null));
    setPublicOrigin(null);
    setFilterText('');
    setGanttViewMode('Day');
    setIsVacationPanelOpen(true);
    setVacForm({ title: '', start: today, end: today });
    setIsModalOpen(false);
    setEditingTask(null);
    setActiveMainTab('edit');
    setActiveEditorTab('tasks');
    setTaskManagerResetToken((value) => value + 1);
  }, [
    setActiveEditorTab,
    setActiveMainTab,
    setEditingTask,
    setFilterText,
    setFitSettings,
    setGanttViewMode,
    setIsModalOpen,
    setIsVacationPanelOpen,
    setProjectName,
    setPublicOrigin,
    setRangePadding,
    setTaskManagerResetToken,
    setTasks,
    setVacForm,
    setVacations,
    setZoomSettings,
  ]);

  const createNewProject = useCallback(async () => {
    const confirmed = await confirmAsync(
      '새 프로젝트를 만들면 현재 작업, 휴가, 보기 설정이 초기화됩니다.\n계속할까요?',
      {
        title: '새 프로젝트',
        confirmText: '초기화',
        cancelText: '취소',
      },
    );
    if (!confirmed) return;

    resetProjectState();
  }, [confirmAsync, resetProjectState]);

  return {
    addVacation,
    createNewProject,
    deleteVacation,
    handleDelete,
    handleSave,
    moveTask,
    moveTaskToIndex,
    openModal,
    resetProjectState,
    sortTasksByStart,
    updateFit,
    updatePadding,
    updateProjectName,
    updateTaskDates,
    updateTaskMemo,
    updateZoom,
  };
}
