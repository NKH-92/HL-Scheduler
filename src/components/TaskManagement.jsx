import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Edit2, FileText, Plus, Trash2 } from './Icons';

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
}) {
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [startSortDir, setStartSortDir] = useState('');
  const [activeMemoKey, setActiveMemoKey] = useState(null);
  const [memoDrafts, setMemoDrafts] = useState(() => ({}));
  const memoCommitTimersRef = useRef(new Map());
  const pendingMemoKeysRef = useRef(new Set());

  useEffect(() => {
    setMemoDrafts((prev) => {
      const next = { ...prev };
      const pending = pendingMemoKeysRef.current;
      const taskKeys = new Set(tasks.map((t) => String(t.id)));
      let changed = false;

      Object.keys(next).forEach((key) => {
        if (!taskKeys.has(key)) {
          delete next[key];
          pending.delete(key);
          changed = true;
        }
      });

      tasks.forEach((task) => {
        const key = String(task.id);
        if (key === activeMemoKey) return;
        if (next[key] == null) return;

        const memo = String(task.memo ?? '');
        if (next[key] === memo) {
          delete next[key];
          pending.delete(key);
          changed = true;
        } else if (!pending.has(key)) {
          delete next[key];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [tasks, activeMemoKey]);

  const scheduleMemoCommit = (taskId, nextMemo) => {
    const key = String(taskId);
    pendingMemoKeysRef.current.add(key);

    const timers = memoCommitTimersRef.current;
    const existing = timers.get(key);
    if (existing) window.clearTimeout(existing);

    const timerId = window.setTimeout(() => {
      timers.delete(key);
      updateTaskMemo(taskId, nextMemo);
    }, 500);

    timers.set(key, timerId);
  };

  const flushMemoCommit = (taskId, nextMemo) => {
    const key = String(taskId);
    pendingMemoKeysRef.current.add(key);

    const timers = memoCommitTimersRef.current;
    const existing = timers.get(key);
    if (existing) {
      window.clearTimeout(existing);
      timers.delete(key);
    }

    updateTaskMemo(taskId, nextMemo);
  };

  const departments = useMemo(() => {
    const set = new Set();
    tasks.forEach((t) => {
      const v = normalizeValue(t.department);
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [tasks]);

  const assignees = useMemo(() => {
    const set = new Set();
    tasks.forEach((t) => {
      const v = normalizeValue(t.assignee);
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [tasks]);

  const hasEmptyDepartment = useMemo(() => tasks.some((t) => !normalizeValue(t.department)), [tasks]);
  const hasEmptyAssignee = useMemo(() => tasks.some((t) => !normalizeValue(t.assignee)), [tasks]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => {
      const dept = normalizeValue(t.department);
      const assignee = normalizeValue(t.assignee);

      if (departmentFilter) {
        if (departmentFilter === '__EMPTY__') {
          if (dept) return false;
        } else if (dept !== departmentFilter) {
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

      return true;
    });
  }, [tasks, departmentFilter, assigneeFilter]);

  const handleMove = (taskId, direction) => {
    if (!departmentFilter && !assigneeFilter) {
      moveTask(taskId, direction);
      return;
    }

    const idx = visibleTasks.findIndex((t) => t.id === taskId);
    if (idx < 0) return;
    const neighbor = visibleTasks[idx + direction];
    if (!neighbor) return;
    const neighborFullIndex = tasks.findIndex((t) => t.id === neighbor.id);
    if (neighborFullIndex < 0) return;
    moveTaskToIndex(taskId, neighborFullIndex + 1);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-slate-200/60 flex flex-col md:flex-row items-start md:items-center gap-4">
        <div className="flex-1 w-full">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Project Name</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="프로젝트 명칭을 입력하세요"
            className="w-full text-lg font-bold text-slate-800 border-b-2 border-slate-200 focus:border-indigo-500 focus:outline-none py-1 transition-colors bg-transparent placeholder-slate-300"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          <button
            onClick={openReportModal}
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap"
            type="button"
          >
            <FileText size={18} /> 보고서 출력
          </button>
          <button
            onClick={onExportXlsx}
            disabled={!onExportXlsx}
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm whitespace-nowrap"
            type="button"
          >
            <Download size={18} /> Excel(XLSX)
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">업무 목록</h2>
            <p className="text-xs text-slate-500 mt-1">
              표시 {visibleTasks.length}건 / 전체 {tasks.length}건
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setStartSortDir('asc');
                  sortTasksByStart('asc');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  startSortDir === 'asc' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
                title="업무 시작일 기준 오름차순 정렬"
              >
                시작일↑
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartSortDir('desc');
                  sortTasksByStart('desc');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  startSortDir === 'desc' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
                title="업무 시작일 기준 내림차순 정렬"
              >
                시작일↓
              </button>
            </div>

            <select
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              aria-label="부서 필터"
            >
              <option value="">전체 부서</option>
              {hasEmptyDepartment && <option value="__EMPTY__">미지정</option>}
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              aria-label="담당자 필터"
            >
              <option value="">전체 담당자</option>
              {hasEmptyAssignee && <option value="__EMPTY__">미지정</option>}
              {assignees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            {(departmentFilter || assigneeFilter) && (
              <button
                type="button"
                onClick={() => {
                  setDepartmentFilter('');
                  setAssigneeFilter('');
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50"
              >
                필터 초기화
              </button>
            )}

            <button
              onClick={() => openModal()}
              className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
              type="button"
            >
              <Plus size={16} /> 업무 추가
            </button>
          </div>
        </div>

        <div className="overflow-auto custom-scrollbar max-h-[70vh]">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 font-medium">
              <tr>
                <th className="px-4 py-3 text-center whitespace-nowrap w-16">순서</th>
                <th className="px-4 py-3 whitespace-nowrap">대분류</th>
                <th className="px-4 py-3 whitespace-nowrap">상세내용</th>
                <th className="px-4 py-3 whitespace-nowrap">부서</th>
                <th className="px-4 py-3 whitespace-nowrap">담당자</th>
                <th className="px-4 py-3 whitespace-nowrap">기간</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">진척도</th>
                <th className="px-4 py-3 whitespace-nowrap min-w-[240px]">메모</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleTasks.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-slate-400">
                    {tasks.length === 0 ? '등록된 업무가 없습니다.' : '조건에 맞는 업무가 없습니다.'}
                  </td>
                </tr>
              ) : (
                visibleTasks.map((task, index) => (
                  <tr key={task.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleMove(task.id, -1)}
                          disabled={index === 0}
                          className={`px-2 py-1 rounded border text-xs ${index === 0 ? 'opacity-30' : 'hover:bg-slate-100'}`}
                          type="button"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleMove(task.id, 1)}
                          disabled={index === visibleTasks.length - 1}
                          className={`px-2 py-1 rounded border text-xs ${index === visibleTasks.length - 1 ? 'opacity-30' : 'hover:bg-slate-100'}`}
                          type="button"
                        >
                          ▼
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{task.category}</td>
                    <td className="px-4 py-3">{task.taskName}</td>
                    <td className="px-4 py-3">
                      <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs">{task.department}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-blue-600 font-bold">{task.assignee || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {task.start || '-'} ~ {task.end || task.start || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`${task.progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'} h-full`} style={{ width: `${task.progress}%` }} />
                        </div>
                        <span className="text-xs">{task.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <textarea
                        value={memoDrafts[String(task.id)] ?? String(task.memo ?? '')}
                        onFocus={() => setActiveMemoKey(String(task.id))}
                        onChange={(e) => {
                          const key = String(task.id);
                          const nextMemo = e.target.value;
                          setMemoDrafts((prev) => (prev[key] === nextMemo ? prev : { ...prev, [key]: nextMemo }));
                          scheduleMemoCommit(task.id, nextMemo);
                        }}
                        onBlur={(e) => {
                          const key = String(task.id);
                          const nextMemo = e.target.value;
                          setActiveMemoKey((prev) => (prev === key ? null : prev));
                          flushMemoCommit(task.id, nextMemo);
                        }}
                        placeholder="진행 중 특이사항을 기록하세요."
                        rows={2}
                        className="w-full min-w-[240px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-y"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openModal(task)} className="text-blue-500 hover:text-blue-700">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(task.id)} className="text-red-400 hover:text-red-600">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default TaskManagement;
