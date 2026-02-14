import { useMemo } from 'react';
import Modal from '../Modal';
import { XIcon } from '../Icons';
import { toUtcMidnightMs } from '../../utils/dates';

function TaskEditModal({
  isOpen,
  onClose,
  editingTask,
  formData,
  setFormData,
  onSave,
  tasks = [],
  employeeDirectory = [],
}) {
  const startMs = toUtcMidnightMs(formData.start);
  const endMs = toUtcMidnightMs(formData.end || formData.start);
  const hasDateError = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs;
  const hasRequiredError = !String(formData.category || '').trim() || !String(formData.taskName || '').trim();
  const hasFormError = hasDateError || hasRequiredError;

  const editingTaskId = editingTask ? String(editingTask.id) : '';
  const selectedDependencyIds = useMemo(
    () => (Array.isArray(formData.dependencies) ? formData.dependencies.map((depId) => String(depId)) : []),
    [formData.dependencies],
  );
  const selectedDependencySet = useMemo(() => new Set(selectedDependencyIds), [selectedDependencyIds]);

  const dependencyOptions = useMemo(() => {
    return (Array.isArray(tasks) ? tasks : [])
      .filter((task) => String(task.id) !== editingTaskId)
      .map((task) => ({ id: String(task.id), name: String(task.taskName || '').trim() || String(task.id) }));
  }, [tasks, editingTaskId]);

  const employeeOptions = useMemo(() => {
    return (Array.isArray(employeeDirectory) ? employeeDirectory : [])
      .map((employee) => {
        const id = String(employee?.id || '').trim();
        const email = String(employee?.email || '').trim().toLowerCase();
        const name = String(employee?.name || '').trim();
        const department = String(employee?.department || '').trim();
        const position = String(employee?.position || '').trim();
        if (!id || !name) return null;
        return {
          id,
          email,
          name,
          department,
          position,
          label: `${name} / ${department || '-'} / ${position || '-'}${email ? ` / ${email}` : ''}`,
        };
      })
      .filter(Boolean);
  }, [employeeDirectory]);

  const selectedEmployeeId = useMemo(() => {
    const currentEmail = String(formData.assigneeEmail || '').trim().toLowerCase();
    if (currentEmail) {
      const byEmail = employeeOptions.find((employee) => employee.email === currentEmail);
      if (byEmail) return byEmail.id;
    }

    const currentName = String(formData.assignee || '').trim();
    const currentDepartment = String(formData.department || '').trim();
    const currentPosition = String(formData.assigneePosition || '').trim();
    const byName = employeeOptions.find(
      (employee) =>
        employee.name === currentName &&
        (!currentDepartment || employee.department === currentDepartment) &&
        (!currentPosition || employee.position === currentPosition),
    );
    return byName?.id || '';
  }, [employeeOptions, formData.assigneeEmail, formData.assignee, formData.department, formData.assigneePosition]);

  const applySelectedEmployee = (selectedId) => {
    const safeId = String(selectedId || '').trim();
    const employee = employeeOptions.find((item) => item.id === safeId);
    if (!employee) {
      setFormData((prev) => ({
        ...prev,
        assigneeEmail: '',
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      assignee: employee.name,
      department: employee.department || prev.department || '',
      assigneePosition: employee.position || '',
      assigneeEmail: employee.email || '',
    }));
  };

  const toggleDependency = (depId) => {
    const safeId = String(depId || '').trim();
    if (!safeId) return;

    setFormData((prev) => {
      const current = Array.isArray(prev.dependencies) ? prev.dependencies.map((id) => String(id)) : [];
      const exists = current.includes(safeId);
      const nextDependencies = exists ? current.filter((id) => id !== safeId) : [...current, safeId];
      return { ...prev, dependencies: nextDependencies };
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={editingTask ? '작업 수정' : '작업 추가'}
      panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden relative z-10 animate-fade-in border border-white/20"
    >
      <div className="bg-white px-6 py-5 border-b border-slate-100 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-slate-800">{editingTask ? '작업 수정' : '작업 추가'}</h3>
          <p className="text-xs text-slate-500 mt-1">필수 입력: 구분, 작업명</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
          type="button"
          aria-label="닫기"
        >
          <XIcon size={24} />
        </button>
      </div>

      <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">구분</label>
          <input
            type="text"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">작업명</label>
          <input
            type="text"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            value={formData.taskName}
            onChange={(e) => setFormData({ ...formData, taskName: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">사원 선택</label>
          <select
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            value={selectedEmployeeId}
            onChange={(e) => applySelectedEmployee(e.target.value)}
          >
            <option value="">직접 입력</option>
            {employeeOptions.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">부서</label>
          <input
            type="text"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            value={formData.department}
            onChange={(e) => setFormData({ ...formData, department: e.target.value, assigneeEmail: '' })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-indigo-600 uppercase">담당자</label>
          <input
            type="text"
            className="w-full bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            value={formData.assignee}
            onChange={(e) => setFormData({ ...formData, assignee: e.target.value, assigneeEmail: '' })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">직위</label>
          <input
            type="text"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            value={formData.assigneePosition || ''}
            onChange={(e) => setFormData({ ...formData, assigneePosition: e.target.value, assigneeEmail: '' })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">담당자 이메일</label>
          <input
            type="email"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            value={formData.assigneeEmail || ''}
            onChange={(e) => setFormData({ ...formData, assigneeEmail: e.target.value.toLowerCase() })}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">시작일</label>
          <input
            type="date"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
            value={formData.start}
            onChange={(e) => setFormData({ ...formData, start: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">종료일</label>
          <input
            type="date"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
            value={formData.end}
            min={formData.start || undefined}
            onChange={(e) => setFormData({ ...formData, end: e.target.value })}
          />
        </div>

        <div className="col-span-2 space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-slate-500 uppercase">선행작업(의존성)</label>
            <span className="text-[11px] text-slate-500">{selectedDependencyIds.length}개 선택</span>
          </div>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 custom-scrollbar">
            {dependencyOptions.length === 0 ? (
              <p className="text-xs text-slate-500">선택 가능한 선행작업이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {dependencyOptions.map((option) => (
                  <label key={option.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-indigo-600"
                      checked={selectedDependencySet.has(option.id)}
                      onChange={() => toggleDependency(option.id)}
                    />
                    <span className="truncate">{option.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {(hasRequiredError || hasDateError) && (
          <div className="col-span-2 text-xs text-rose-600 font-medium space-y-1">
            {hasRequiredError && <div>구분과 작업명은 필수입니다.</div>}
            {hasDateError && <div>종료일은 시작일보다 빠를 수 없습니다.</div>}
          </div>
        )}

        <div className="col-span-2 space-y-2">
          <div className="flex justify-between">
            <label className="text-xs font-bold text-slate-500 uppercase">진척률</label>
            <span className="text-xs font-bold text-indigo-600">{formData.progress}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            value={formData.progress}
            onChange={(e) => setFormData({ ...formData, progress: Number(e.target.value) })}
          />
        </div>

        <div className="col-span-2 space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">메모</label>
          <textarea
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-y min-h-[96px]"
            value={formData.memo || ''}
            onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
          />
        </div>
      </div>

      <div className="bg-slate-50 px-8 py-5 border-t border-slate-100 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-white hover:border-slate-300 transition-colors text-sm"
          type="button"
        >
          취소
        </button>
        <button
          onClick={onSave}
          disabled={hasFormError}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95 text-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
          type="button"
        >
          저장
        </button>
      </div>
    </Modal>
  );
}

export default TaskEditModal;
