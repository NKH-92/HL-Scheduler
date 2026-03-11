import { Search, Users } from '../Icons';
import { TEAM_LEAD_RISK_FILTERS } from '../../utils/publicSchedulesBoard';

export default function PublicSchedulesBoardHeader({
  selectedFolderSummary,
  sharedModeId = '',
  boardCount = 0,
  filteredCount = 0,
  query = '',
  onQueryChange,
  stats,
  filterOptions,
  assigneeFilter = '',
  departmentFilter = '',
  riskFilter = 'all',
  onAssigneeChange,
  onDepartmentChange,
  onRiskChange,
  onClearFilters,
}) {
  const safeSummary = selectedFolderSummary || { name: '전체', path: '' };
  const safeStats = stats || {
    totalProjects: 0,
    delayed: 0,
    holding: 0,
    dueToday: 0,
    dueThisWeek: 0,
    assigneeStats: [],
  };
  const safeFilterOptions = filterOptions || { assignees: [], departments: [] };

  return (
    <div className="border-b border-slate-200/70 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
            <Users size={14} />
            공개 일정 보드
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">{safeSummary.name}</h2>
          <p className="mt-1.5 max-w-3xl text-sm text-slate-500">
            폴더별 프로젝트 현황을 상태와 담당자 중심으로 빠르게 확인할 수 있습니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <div className="rounded-full bg-slate-100 px-3 py-1.5">폴더 {safeSummary.path || safeSummary.name}</div>
            <div className="rounded-full bg-slate-100 px-3 py-1.5">전체 {boardCount}건</div>
            <div className="rounded-full bg-slate-100 px-3 py-1.5">표시 {filteredCount}건</div>
            {sharedModeId ? (
              <div className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">공유 일정 ID {sharedModeId}</div>
            ) : null}
          </div>
        </div>

        <div className="w-full xl:max-w-md">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">검색</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={18} />
            </span>
            <input
              type="text"
              value={query}
              onChange={(event) => onQueryChange?.(event.target.value)}
              placeholder={`${safeSummary.name} 프로젝트 검색`}
              className="w-full rounded-2xl border-0 bg-slate-100/80 py-2.5 pl-11 pr-4 text-sm outline-none ring-1 ring-inset ring-slate-200/50 transition-all duration-300 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500 focus:shadow-md"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-start">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:w-[420px] 2xl:w-[480px]">
          <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Project</p>
              <p className="text-xl font-black text-slate-900">{safeStats.totalProjects}</p>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">현재 조회 중인 프로젝트</p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-rose-500">Delayed</p>
              <p className="text-xl font-black text-rose-700">{safeStats.delayed}</p>
            </div>
            <p className="mt-1 text-[11px] text-rose-600">오늘 마감 위험 {safeStats.dueToday}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Holding</p>
              <p className="text-xl font-black text-amber-700">{safeStats.holding}</p>
            </div>
            <p className="mt-1 text-[11px] text-amber-700">이번 주 위험 {safeStats.dueThisWeek}</p>
          </div>
        </div>

        <div className="min-w-0 flex-1 rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(180px,0.8fr)_auto]">
            <select
              value={assigneeFilter}
              onChange={(event) => onAssigneeChange?.(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
            >
              <option value="">전체 담당자</option>
              {safeFilterOptions.assignees.map((assignee) => (
                <option key={assignee} value={assignee}>
                  {assignee}
                </option>
              ))}
            </select>
            <select
              value={departmentFilter}
              onChange={(event) => onDepartmentChange?.(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
            >
              <option value="">전체 부서</option>
              {safeFilterOptions.departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            <select
              value={riskFilter}
              onChange={(event) => onRiskChange?.(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
            >
              {TEAM_LEAD_RISK_FILTERS.map((risk) => (
                <option key={risk.id} value={risk.id}>
                  {risk.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              필터 초기화
            </button>
          </div>

          {safeStats.assigneeStats.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {safeStats.assigneeStats.slice(0, 6).map((assignee) => (
                <button
                  key={`assignee-chip-${assignee.name}`}
                  type="button"
                  onClick={() => onAssigneeChange?.(assignee.name)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                    assigneeFilter === assignee.name
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {assignee.name} {assignee.projectCount}건
                  {assignee.delayedCount > 0 ? ` 지연 ${assignee.delayedCount}` : ''}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
