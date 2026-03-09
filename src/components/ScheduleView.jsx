import { useEffect, useMemo, useRef } from 'react';
import { getDaysDiff, toDate } from '../utils/dates';
import GanttChart from './GanttChart';
import { Save, Search, XIcon } from './Icons';
import useIsMobileViewport from '../hooks/useIsMobileViewport';

const VIEW_MODE_LABELS = {
  Day: '일 (Day)',
  Week: '주 (Week)',
  Month: '월 (Month)',
};

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
  const isMobileViewport = useIsMobileViewport();
  const mobileDefaultAppliedRef = useRef(false);

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

  useEffect(() => {
    if (!isMobileViewport || mobileDefaultAppliedRef.current) return;
    if (ganttViewMode === 'Day') {
      setGanttViewMode('Week');
    }
    mobileDefaultAppliedRef.current = true;
  }, [isMobileViewport, ganttViewMode, setGanttViewMode]);

  return (
    <div className="animate-fade-in flex min-h-0 flex-1 flex-col gap-5">
      <section className="glass-panel relative z-20 p-4 lg:p-5 pointer-events-auto">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">타임라인 (Timeline)</h2>
            <p className="mt-1 text-sm text-slate-500">{projectName || '프로젝트'} 일정 흐름을 관리하고 조정합니다.</p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:w-auto pointer-events-auto">
            <label className="relative block w-full sm:w-72 pointer-events-auto">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="작업명, 담당자, 부서 검색"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
            </label>

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" /> 오늘 (Today)
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" /> 진행
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /> 완료
            </div>
          </div>
        </div>
      </section>

      <section className="glass-panel relative z-10 overflow-hidden pointer-events-auto">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3">
          <h3 className="text-sm font-bold text-slate-800">휴가/예외 일정</h3>
          <button
            onClick={() => setIsVacationPanelOpen((prev) => !prev)}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
            type="button"
          >
            {isVacationPanelOpen ? '접기' : '펼치기'}
          </button>
        </div>

        {isVacationPanelOpen && (
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_auto_auto_auto] lg:items-end">
              <div>
                <label className="field-label">제목</label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="예: 여름 휴가, 점검 기간"
                  value={vacForm.title}
                  onChange={(e) => setVacForm({ ...vacForm, title: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">시작일</label>
                <input
                  type="date"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={vacForm.start}
                  onChange={(e) => setVacForm({ ...vacForm, start: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">종료일</label>
                <input
                  type="date"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={vacForm.end}
                  onChange={(e) => setVacForm({ ...vacForm, end: e.target.value })}
                />
              </div>
              <button
                onClick={addVacation}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                type="button"
              >
                추가
              </button>
            </div>

            {vacations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {vacations.map((v) => (
                  <div
                    key={v.id}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700"
                    title={`${v.title}: ${v.start} ~ ${v.end || v.start}`}
                  >
                    {v.title} ({v.start}
                    {v.end && v.end !== v.start ? ` ~ ${v.end}` : ''})
                    <button
                      onClick={() => deleteVacation(v.id)}
                      className="rounded-full bg-rose-100 p-0.5 transition hover:bg-rose-200"
                      type="button"
                      aria-label="휴가 삭제"
                    >
                      <XIcon size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="glass-panel relative z-0 flex min-h-[460px] min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200/70 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-100 p-1">
            {['Day', 'Week', 'Month'].map((mode) => (
              <button
                key={mode}
                onClick={() => setGanttViewMode(mode)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                  ganttViewMode === mode ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                type="button"
              >
                {VIEW_MODE_LABELS[mode] || mode}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <span className="font-semibold text-slate-500">여백</span>
              <input
                type="number"
                min="0"
                className="w-12 rounded border border-slate-200 bg-white px-1 text-center"
                value={(rangePadding[ganttViewMode] || {}).before || 0}
                onChange={(e) => updatePadding('before', e.target.value)}
              />
              <span className="text-slate-400">~</span>
              <input
                type="number"
                min="0"
                className="w-12 rounded border border-slate-200 bg-white px-1 text-center"
                value={(rangePadding[ganttViewMode] || {}).after || 0}
                onChange={(e) => updatePadding('after', e.target.value)}
              />
              <span className="text-slate-400">({rangeUnit})</span>
            </div>

            <label
              className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 transition ${
                isLongDayRange ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-50'
              }`}
              title={isLongDayRange ? '일 (Day) 보기 범위가 길어 자동으로 비활성화됩니다.' : undefined}
            >
              <input
                type="checkbox"
                className="accent-blue-600"
                checked={effectiveFitEnabled}
                disabled={isLongDayRange}
                onChange={(e) => updateFit(e.target.checked)}
              />
              <span className="font-semibold text-slate-600">화면 맞춤</span>
            </label>

            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <span className="font-semibold text-slate-500">배율</span>
              <button
                type="button"
                onClick={() => updateZoom(zoomValue - 10)}
                className="h-6 w-6 rounded border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50"
                aria-label="축소"
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
                className="w-28 accent-blue-600"
              />
              <button
                type="button"
                onClick={() => updateZoom(zoomValue + 10)}
                className="h-6 w-6 rounded border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50"
                aria-label="확대"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => updateZoom(100)}
                className="h-6 rounded border border-slate-200 bg-white px-2 text-[10px] font-bold tabular-nums text-slate-500 hover:bg-slate-50"
                title="배율 초기화"
              >
                {zoomValue}%
              </button>
            </div>

            <button
              onClick={openImageExportModal}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
              type="button"
              title="이미지 내보내기"
            >
              <Save size={13} /> 이미지
            </button>
          </div>
        </div>

        {isLongDayRange && (
          <div className="border-b border-sky-100 bg-sky-50/80 px-5 py-3">
            <p className="text-xs font-medium text-sky-800">
              일 (Day) 보기 범위가 365일을 넘어 화면 맞춤이 자동 비활성화되었습니다. 필요하면 주 (Week) 또는 월 (Month)로 전환하세요.
            </p>
          </div>
        )}

        <div className="min-h-0 min-w-0 flex-1">
          <GanttChart
            tasks={filteredTasks}
            vacations={vacations}
            viewMode={ganttViewMode}
            rangePadding={rangePadding[ganttViewMode] || { before: 0, after: 0 }}
            fitEnabled={effectiveFitEnabled}
            zoom={zoomValue / 100}
            onTaskDateChange={onTaskDateChange}
            compactMode={isMobileViewport}
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
      </section>
    </div>
  );
}

export default ScheduleView;
