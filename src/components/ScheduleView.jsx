import GanttChart from './GanttChart';
import { Save, Search, XIcon } from './Icons';

function ScheduleView({
  projectName,
  tasks,
  filteredTasks,
  vacations,
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
  openImageExportModal,
  isImageExportModalOpen,
  exportScope,
}) {
  const rangeUnit = ganttViewMode === 'Day' ? '일' : ganttViewMode === 'Week' ? '주' : '월';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Schedule</h2>
          <p className="text-sm text-slate-500 mt-1">{projectName || '프로젝트'}의 전체 일정을 관리합니다.</p>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-slate-200/60 flex flex-col md:flex-row gap-4 items-center justify-between sticky top-20 z-10 transition-all">
        <div className="flex items-center gap-3 w-full md:w-auto relative group">
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="업무, 담당자, 부서 검색..."
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
            지연
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
          <h3 className="font-semibold text-slate-700 text-sm">휴가 및 일정 제외</h3>
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
                  placeholder="예: 여름휴가"
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

      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 flex flex-col h-[650px] overflow-hidden">
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

            <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                className="accent-indigo-600"
                checked={(fitSettings[ganttViewMode] || {}).enabled || false}
                onChange={(e) => updateFit('enabled', e.target.checked)}
              />
              <span className="font-semibold text-slate-600">한화면맞춤</span>
            </label>

            <div
              className={`flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 ${
                (fitSettings[ganttViewMode] || {}).enabled ? '' : 'opacity-50'
              }`}
            >
              <span className="font-semibold text-slate-500">페이지</span>
              <input
                type="number"
                min="1"
                max="20"
                className="w-12 bg-white border border-slate-200 rounded px-1 text-center"
                disabled={!((fitSettings[ganttViewMode] || {}).enabled || false)}
                value={(fitSettings[ganttViewMode] || {}).pages || 1}
                onChange={(e) => updateFit('pages', e.target.value)}
              />
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

        <GanttChart
          tasks={filteredTasks}
          vacations={vacations}
          viewMode={ganttViewMode}
          rangePadding={rangePadding[ganttViewMode] || { before: 0, after: 0 }}
          fitEnabled={(fitSettings[ganttViewMode] || {}).enabled || false}
          fitPages={(fitSettings[ganttViewMode] || {}).pages || 1}
        />

        {isImageExportModalOpen && exportScope === 'full' && (
          <div style={{ position: 'fixed', left: '-9999px', top: '0px', pointerEvents: 'none' }}>
            <GanttChart
              tasks={tasks}
              vacations={vacations}
              viewMode={ganttViewMode}
              rangePadding={rangePadding[ganttViewMode] || { before: 0, after: 0 }}
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
