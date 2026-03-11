import { formatOverviewDate } from '../../utils/publicSchedulesBoard';

const getRiskLabelClassName = (riskLabel) => {
  if (riskLabel === '지연' || riskLabel === '지연 위험') return 'bg-rose-50 text-rose-700';
  if (
    riskLabel === '보류' ||
    riskLabel === '이번 주 마감' ||
    riskLabel === '마감 임박' ||
    riskLabel === '지연 예상'
  ) {
    return 'bg-amber-50 text-amber-700';
  }
  return 'bg-emerald-50 text-emerald-700';
};

export default function PublicSchedulePreviewSummary({
  previewHistoryItems = [],
  selectedOverview,
  selectedActivityLog = [],
  selectedId = '',
  selectedBoardState,
  canManage = false,
  holdingReasonDrafts = {},
  nextActionDrafts = {},
  savingMetaBySchedule = {},
  employeeDirectory,
  buildEmployeeDisplay,
  summarizeActivityDate,
  onHoldingReasonDraftChange,
  onNextActionDraftChange,
  onSaveHoldingReason,
  onSaveNextAction,
}) {
  const safeOverview = selectedOverview || {
    primaryAssignee: '',
    assignees: [],
    primaryDepartment: '',
    departments: [],
    progress: 0,
    endDate: '',
    riskLabels: [],
  };
  const riskLabels = safeOverview.riskLabels.length > 0 ? safeOverview.riskLabels : ['정상'];
  const holdingReasonValue = Object.prototype.hasOwnProperty.call(holdingReasonDrafts, selectedId)
    ? holdingReasonDrafts[selectedId]
    : String(selectedBoardState?.holdingReason || '').trim();
  const nextActionValue = Object.prototype.hasOwnProperty.call(nextActionDrafts, selectedId)
    ? nextActionDrafts[selectedId]
    : String(selectedBoardState?.nextAction || '').trim();
  const isSaving = !!savingMetaBySchedule[selectedId];

  return (
    <div className="border-b border-slate-200/70 px-5 py-4">
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-6">
        {previewHistoryItems.map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
            <p className="mt-1 truncate text-[11px] font-semibold text-slate-700">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Owner</p>
          <p className="mt-1 break-words text-[11px] font-semibold text-slate-700">
            {safeOverview.primaryAssignee || safeOverview.assignees.join(', ') || '미지정'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Department</p>
          <p className="mt-1 break-words text-[11px] font-semibold text-slate-700">
            {safeOverview.primaryDepartment || safeOverview.departments.join(', ') || '-'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Progress</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-700">{safeOverview.progress}%</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Due</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-700">{formatOverviewDate(safeOverview.endDate) || '-'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Health</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-700">{riskLabels.join(', ')}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {riskLabels.map((riskLabel) => (
          <span
            key={`preview-risk-${riskLabel}`}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${getRiskLabelClassName(riskLabel)}`}
          >
            {riskLabel}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Holding reason</p>
          {canManage ? (
            <textarea
              value={holdingReasonValue}
              onChange={(event) => onHoldingReasonDraftChange?.(selectedId, event.target.value)}
              onBlur={() => {
                void onSaveHoldingReason?.(selectedBoardState);
              }}
              disabled={isSaving}
              placeholder="보류 사유를 입력하면 카드와 상세 화면에 바로 반영됩니다."
              className="mt-2 min-h-[112px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
          ) : (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{holdingReasonValue || '-'}</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Next action</p>
          {canManage ? (
            <textarea
              value={nextActionValue}
              onChange={(event) => onNextActionDraftChange?.(selectedId, event.target.value)}
              onBlur={() => {
                void onSaveNextAction?.(selectedBoardState);
              }}
              disabled={isSaving}
              placeholder="다음 액션을 입력하면 팀이 바로 확인할 수 있습니다."
              className="mt-2 min-h-[112px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
          ) : (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{nextActionValue || '-'}</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Recent activity</p>
            <span className="text-[10px] font-semibold text-slate-400">{selectedActivityLog.length}건</span>
          </div>
          {selectedActivityLog.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">표시할 최근 활동이 없습니다.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {selectedActivityLog.slice(0, 5).map((entry) => {
                const actor = buildEmployeeDisplay?.(entry.actorEmail, employeeDirectory) || {};
                return (
                  <div key={entry.id || `selected-activity-${entry.at}`} className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="break-words text-sm font-semibold text-slate-700">{entry.message}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {actor.profile || actor.email || '알 수 없는 사용자'} · {summarizeActivityDate?.(entry.at) || '-'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
