import { useMemo, useState } from 'react';
import { Download, Edit2, FileText, Plus, Trash2, Upload } from './Icons';

const normalizeValue = (value) => String(value ?? '').trim();

function TaskManagement({
  tasks,
  openModal,
  handleDelete,
  moveTask,
  moveTaskToIndex,
  sortTasksByStart,
  projectName,
  setProjectName,
  openReportModal,
  onExportXlsx,
  updateTaskMemo,
  onUploadPublic,
  onCreateNewProject,
}) {
  const [textFilter, setTextFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [dependencyFilter, setDependencyFilter] = useState('');
  const [startSortDir, setStartSortDir] = useState('');

  const departments = useMemo(() => {
    const set = new Set();
    tasks.forEach((task) => {
      const value = normalizeValue(task.department);
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [tasks]);

  const assignees = useMemo(() => {
    const set = new Set();
    tasks.forEach((task) => {
      const value = normalizeValue(task.assignee);
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [tasks]);

  const hasEmptyDepartment = useMemo(() => tasks.some((task) => !normalizeValue(task.department)), [tasks]);
  const hasEmptyAssignee = useMemo(() => tasks.some((task) => !normalizeValue(task.assignee)), [tasks]);

  const taskNameById = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => {
      const id = String(task.id || '').trim();
      if (!id) return;
      const name = String(task.taskName || '').trim() || id;
      map.set(id, name);
    });
    return map;
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const query = normalizeValue(textFilter).toLowerCase();
    return tasks.filter((task) => {
      const department = normalizeValue(task.department);
      const assignee = normalizeValue(task.assignee);
      const hasDependency = Array.isArray(task.dependencies) && task.dependencies.length > 0;

      if (departmentFilter) {
        if (departmentFilter === '__EMPTY__') {
          if (department) return false;
        } else if (department !== departmentFilter) {
          return false;
        }
      }

      if (assigneeFilter) {
        if (assigneeFilter === '__EMPTY__') {
          if (assignee) return false;
        } else if (assignee !== assigneeFilter) {
          return false;
        }
      }

      if (dependencyFilter === 'has' && !hasDependency) return false;
      if (dependencyFilter === 'none' && hasDependency) return false;

      if (!query) return true;
      const dependencyText = Array.isArray(task.dependencies)
        ? task.dependencies.map((depId) => taskNameById.get(String(depId)) || String(depId)).join(' ')
        : '';

      const haystack = [
        task.category,
        task.taskName,
        task.department,
        task.assignee,
        task.assigneePosition,
        task.assigneeEmail,
        task.memo,
        task.start,
        task.end,
        dependencyText,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return haystack.includes(query);
    });
  }, [tasks, textFilter, departmentFilter, assigneeFilter, dependencyFilter, taskNameById]);

  const handleMove = (taskId, direction) => {
    if (!textFilter && !departmentFilter && !assigneeFilter && !dependencyFilter) {
      moveTask(taskId, direction);
      return;
    }

    const index = visibleTasks.findIndex((task) => task.id === taskId);
    if (index < 0) return;
    const neighbor = visibleTasks[index + direction];
    if (!neighbor) return;
    const fullIndex = tasks.findIndex((task) => task.id === neighbor.id);
    if (fullIndex < 0) return;
    moveTaskToIndex(taskId, fullIndex + 1);
  };

  const formatDependencies = (task) => {
    const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
    if (!deps.length) return '-';
    return deps.map((depId) => taskNameById.get(String(depId)) || String(depId)).join(', ');
  };

  return (
    <div className="animate-fade-in space-y-5">
      <section className="glass-panel p-4 lg:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full lg:max-w-xl">
            <label className="field-label">프로젝트명</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="프로젝트 이름을 입력하세요"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onCreateNewProject?.()}
              disabled={!onCreateNewProject}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={14} /> 새 프로젝트
            </button>
            {onUploadPublic && (
              <button
                type="button"
                onClick={() => onUploadPublic()}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                <Upload size={14} /> 업로드
              </button>
            )}
            <button
              type="button"
              onClick={() => openReportModal()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
            >
              <FileText size={14} /> 보고서
            </button>
            <button
              type="button"
              onClick={() => onExportXlsx?.(visibleTasks)}
              disabled={!onExportXlsx}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={14} /> Excel
            </button>
            <button
              type="button"
              onClick={() => openModal()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              <Plus size={14} /> 작업 추가
            </button>
          </div>
        </div>
      </section>

      <section className="glass-panel p-4 lg:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <label className="field-label">검색</label>
            <input
              type="text"
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="작업명, 부서, 담당자, 메모, 선행작업"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="field-label">부서</label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">전체</option>
              {hasEmptyDepartment && <option value="__EMPTY__">미입력</option>}
              {departments.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">담당자</label>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">전체</option>
              {hasEmptyAssignee && <option value="__EMPTY__">미입력</option>}
              {assignees.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">선행작업</label>
            <select
              value={dependencyFilter}
              onChange={(e) => setDependencyFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">전체</option>
              <option value="has">있음</option>
              <option value="none">없음</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setStartSortDir('asc');
                sortTasksByStart('asc');
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                startSortDir === 'asc' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              시작일 오름차순
            </button>
            <button
              type="button"
              onClick={() => {
                setStartSortDir('desc');
                sortTasksByStart('desc');
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                startSortDir === 'desc' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              시작일 내림차순
            </button>
          </div>

          <span className="ml-auto text-xs text-slate-500">
            전체 {tasks.length}개 중 {visibleTasks.length}개 표시
          </span>
        </div>
      </section>

      <section className="glass-panel overflow-hidden">
        <div className="max-h-[62vh] overflow-auto custom-scrollbar">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100/95 text-slate-600 backdrop-blur">
              <tr>
                <th className="w-24 px-3 py-3 text-center">순서</th>
                <th className="px-3 py-3">구분</th>
                <th className="px-3 py-3">작업명</th>
                <th className="px-3 py-3">부서</th>
                <th className="px-3 py-3">담당자</th>
                <th className="px-3 py-3">직위</th>
                <th className="px-3 py-3">기간</th>
                <th className="px-3 py-3">선행작업</th>
                <th className="px-3 py-3 text-center">진척률</th>
                <th className="min-w-[240px] px-3 py-3">메모</th>
                <th className="px-3 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleTasks.length === 0 ? (
                <tr>
                  <td colSpan="11" className="px-4 py-12 text-center text-slate-400">
                    {tasks.length === 0 ? '등록된 작업이 없습니다.' : '필터 조건에 맞는 작업이 없습니다.'}
                  </td>
                </tr>
              ) : (
                visibleTasks.map((task, index) => {
                  const dependencies = formatDependencies(task);
                  const atTop = index === 0;
                  const atBottom = index === visibleTasks.length - 1;
                  return (
                    <tr key={task.id} className="bg-white/70 hover:bg-slate-50/90">
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMove(task.id, -1)}
                            disabled={atTop}
                            className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                              atTop
                                ? 'cursor-not-allowed border-slate-200 text-slate-300'
                                : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            위
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMove(task.id, 1)}
                            disabled={atBottom}
                            className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                              atBottom
                                ? 'cursor-not-allowed border-slate-200 text-slate-300'
                                : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            아래
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-800">{task.category || '-'}</td>
                      <td className="px-3 py-3">{task.taskName || '-'}</td>
                      <td className="px-3 py-3">{task.department || '-'}</td>
                      <td className="px-3 py-3">{task.assignee || '-'}</td>
                      <td className="px-3 py-3">{task.assigneePosition || '-'}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">
                        {task.start || '-'} ~ {task.end || task.start || '-'}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-3 text-xs text-slate-600" title={dependencies}>
                        {dependencies}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="mx-auto flex w-[86px] items-center gap-2">
                          <div className="h-2 w-14 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`${task.progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'} h-full transition-all`}
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold text-slate-600">{task.progress}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <textarea
                          value={String(task.memo ?? '')}
                          onChange={(e) => updateTaskMemo(task.id, e.target.value)}
                          rows={2}
                          placeholder="작업 메모를 입력하세요"
                          className="w-full min-w-[240px] resize-y rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openModal(task)}
                            className="rounded-lg p-1 text-blue-600 transition hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(task.id)}
                            className="rounded-lg p-1 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default TaskManagement;
