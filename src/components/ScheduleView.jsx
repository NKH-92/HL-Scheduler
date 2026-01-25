import { useEffect, useMemo, useRef } from 'react';
import { getDaysDiff, toDate } from '../utils/dates';
import GanttChart from './GanttChart';
import { Save, Search, XIcon } from './Icons';

function ScheduleView({
  projectName,
  filteredTasks,
  vacations,
  onTaskDateChange,
  vacForm,
  setVacForm,
  addVacation,
  deleteVacation,
  isVacationPanelOpen,
  setIsVacationPanelOpen,
  filterText,
  setFilterText,
  ganttViewMode,
  setGanttViewMode,
  rangePadding,
  updatePadding,
  fitSettings,
  updateFit,
  zoomSettings,
  updateZoom,
  openImageExportModal,
  isImageExportModalOpen,
  exportScope,
}) {
  const DAY_FIT_AUTO_DISABLE_DAYS = 365;
  const DAY_FIT_REENABLE_DAYS = 330;

  const rangeUnit = ganttViewMode === 'Day' ? '일' : ganttViewMode === 'Week' ? '주' : '월';
  const zoomValue = Math.round(Number(zoomSettings?.[ganttViewMode] ?? 100)) || 100;
  const fitEnabled = (fitSettings?.[ganttViewMode] || {}).enabled || false;

  const dayRangeDays = useMemo(() => {
    const getValidDate = (value) => (value ? toDate(value) : null);
    const validDates = [
      ...filteredTasks.flatMap((t) => [getValidDate(t.start), getValidDate(t.end || t.start)].filter(Boolean)),
      ...vacations.flatMap((v) => [getValidDate(v.start), getValidDate(v.end || v.start)].filter(Boolean)),
    ];

    let min = null;
    let max = null;
    if (validDates.length === 0) {
      const now = new Date();
      min = new Date(now);
      min.setMonth(min.getMonth() - 1);
      max = new Date(now);
      max.setMonth(max.getMonth() + 1);
    } else {
      min = new Date(Math.min(...validDates));
      max = new Date(Math.max(...validDates));
    }

    const dayPadding = rangePadding?.Day || { before: 0, after: 0 };
    const before = Math.max(0, Number(dayPadding.before || 0));
    const after = Math.max(0, Number(dayPadding.after || 0));
    min.setDate(min.getDate() - before);
    max.setDate(max.getDate() + after);

    return Math.max(0, getDaysDiff(min, max)) + 1;
  }, [filteredTasks, vacations, rangePadding]);

  const isLongDayRange = ganttViewMode === 'Day' && dayRangeDays > DAY_FIT_AUTO_DISABLE_DAYS;
  const shouldReenableFit = ganttViewMode === 'Day' && dayRangeDays <= DAY_FIT_REENABLE_DAYS;
  const effectiveFitEnabled = fitEnabled && !isLongDayRange;
  const autoFitDisabledRef = useRef(false);

  useEffect(() => {
    if (ganttViewMode !== 'Day') return;
    if (isLongDayRange) {
      if (!fitEnabled) return;
      updateFit(false);
      autoFitDisabledRef.current = true;
      return;
    }
    if (autoFitDisabledRef.current && shouldReenableFit) {
      updateFit(true);
      autoFitDisabledRef.current = false;
    }
  }, [ganttViewMode, isLongDayRange, shouldReenableFit, fitEnabled, updateFit]);

  return (
    <div className="animate-fade-in flex flex-col gap-6 flex-1 min-h-0">
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Schedule</h2>
          <p className="text-sm text-slate-500 mt-1">{projectName || '프로젝트'} 전체 일정을 관리합니다.</p>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-slate-200/60 flex flex-col md:flex-row gap-4 items-center justify-between sticky top-20 z-10 transition-all">
        <div className="flex items-center gap-3 w-full md:w-auto relative group">
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="업무, 담당자, 부서 검색.."
            className="bg-slate-50 border-none ring-1 ring-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm w-full md:w-72 focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all shadow-sm"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-6 text-xs font-medium text-slate-600">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
            </span>
            오늘
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200" />
            완료
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-indigo-500 shadow-sm shadow-indigo-200" />
            진행중
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700 text-sm">휴가 및 일정 예외</h3>
          <button
            onClick={() => setIsVacationPanelOpen((prev) => !prev)}
            className="text-xs text-indigo-600 font-medium hover:underline"
            type="button"
          >
            {isVacationPanelOpen ? '닫기' : '열기'}
          </button>
        </div>

        {isVacationPanelOpen && (
          <div className="p-6 transition-all">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1">명칭</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="휴가 이름 입력"
                  value={vacForm.title}
                  onChange={(e) => setVacForm({ ...vacForm, title: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1">시작일</label>
                <input
                  type="date"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-indigo-500"
                  value={vacForm.start}
                  onChange={(e) => setVacForm({ ...vacForm, start: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1">종료일</label>
                <input
                  type="date"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-indigo-500"
                  value={vacForm.end}
                  onChange={(e) => setVacForm({ ...vacForm, end: e.target.value })}
                />
              </div>
              <button
                onClick={addVacation}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md shadow-indigo-200 transition-all active:scale-95"
                type="button"
              >
                추가
              </button>
            </div>

            {vacations.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {vacations.map((v) => (
                  <div
                    key={v.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-700 text-xs font-medium rounded-full border border-rose-100 shadow-sm"
                    title={`${v.title}: ${v.start} ~ ${v.end || v.start}`}
                  >
                    {v.title} ({v.start}
                    {v.end && v.end !== v.start ? `~${v.end}` : ''})
                    <button
                      onClick={() => deleteVacation(v.id)}
                      className="hover:text-rose-900 bg-rose-200/50 rounded-full p-0.5"
                      type="button"
                      aria-label="삭제"
                    >
                      <XIcon size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 flex flex-col flex-1 min-h-[420px] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col lg:flex-row gap-4 justify-between items-center bg-white/50">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {['Day', 'Week', 'Month'].map((mode) => (
              <button
                key={mode}
                onClick={() => setGanttViewMode(mode)}
                className={`px-5 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                  ganttViewMode === mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
                type="button"
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-500">간격조절</span>
              <input
                type="number"
                min="0"
                className="w-12 bg-white border border-slate-200 rounded px-1 text-center"
                value={(rangePadding[ganttViewMode] || {}).before || 0}
                onChange={(e) => updatePadding('before', e.target.value)}
              />
              <span className="text-slate-400">~</span>
              <input
                type="number"
                min="0"
                className="w-12 bg-white border border-slate-200 rounded px-1 text-center"
                value={(rangePadding[ganttViewMode] || {}).after || 0}
                onChange={(e) => updatePadding('after', e.target.value)}
              />
              <span className="text-slate-400">({rangeUnit})</span>
            </div>

            <label
              className={`flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors ${
                isLongDayRange ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-100'
              }`}
              title={
                isLongDayRange
                  ? 'Day 보기에서 1년(365일) 이상일 때 성능 보호를 위해 화면 맞춤이 자동 해제됩니다.'
                  : undefined
              }
            >
              <input
                type="checkbox"
                className="accent-indigo-600"
                checked={effectiveFitEnabled}
                disabled={isLongDayRange}
                onChange={(e) => updateFit(e.target.checked)}
              />
              <span className="font-semibold text-slate-600">화면맞춤</span>
            </label>

            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-500">Zoom</span>
              <button
                type="button"
                onClick={() => updateZoom(zoomValue - 10)}
                className="w-6 h-6 rounded bg-white border border-slate-200 text-slate-600 font-bold leading-none hover:bg-slate-50"
                aria-label="Zoom out"
              >
                -
              </button>
              <input
                type="range"
                min="25"
                max="300"
                step="5"
                value={zoomValue}
                onChange={(e) => updateZoom(e.target.value)}
                className="w-28 accent-indigo-600"
              />
              <button
                type="button"
                onClick={() => updateZoom(zoomValue + 10)}
                className="w-6 h-6 rounded bg-white border border-slate-200 text-slate-600 font-bold leading-none hover:bg-slate-50"
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => updateZoom(100)}
                className="px-2 h-6 rounded bg-white border border-slate-200 text-slate-500 font-bold text-[10px] hover:bg-slate-50 tabular-nums"
                title="Reset zoom"
              >
                {zoomValue}%
              </button>
            </div>

            <button
              onClick={openImageExportModal}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-1.5 rounded-lg font-bold shadow-sm shadow-emerald-200 transition-all flex items-center gap-1"
              type="button"
              title="이미지 저장"
            >
              <Save size={14} /> IMG
            </button>
          </div>
        </div>

        {isLongDayRange && (
          <div className="px-6 py-3 border-b border-sky-100 bg-sky-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-xs text-sky-800 font-medium">
              안내: 현재 전체 기간이 Day 보기에서 1년(365일) 이상이면 성능 보호를 위해{' '}
              <span className="font-semibold">화면 맞춤이 자동 해제</span>됩니다. 필요하면 Week/Month로 전환하세요.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setGanttViewMode('Week')}
                className="px-3 py-1.5 rounded-lg border border-sky-200 bg-white text-sky-700 text-xs font-bold hover:bg-sky-100 transition-colors"
              >
                Week 보기
              </button>
              <button
                type="button"
                onClick={() => setGanttViewMode('Month')}
                className="px-3 py-1.5 rounded-lg border border-sky-200 bg-white text-sky-700 text-xs font-bold hover:bg-sky-100 transition-colors"
              >
                Month 보기
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0">
          <GanttChart
            tasks={filteredTasks}
            vacations={vacations}
            viewMode={ganttViewMode}
            rangePadding={rangePadding[ganttViewMode] || { before: 0, after: 0 }}
            fitEnabled={effectiveFitEnabled}
            zoom={zoomValue / 100}
            onTaskDateChange={onTaskDateChange}
          />
        </div>

        {isImageExportModalOpen && exportScope === 'full' && (
          <div style={{ position: 'fixed', left: '-9999px', top: '0px', pointerEvents: 'none' }}>
            <GanttChart
              tasks={filteredTasks}
              vacations={vacations}
              viewMode={ganttViewMode}
              rangePadding={rangePadding[ganttViewMode] || { before: 0, after: 0 }}
              zoom={zoomValue / 100}
              isExportMode
              exportId="gantt-image-export-target"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ScheduleView;
