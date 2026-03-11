import { PUBLIC_UNCATEGORIZED_FOLDER_ID } from '../../utils/publicSchedulesApi';
import {
  PUBLIC_SCHEDULE_STATUS_ORDER,
  getPublicScheduleStatusLabel,
  normalizePublicScheduleStatus,
} from '../../utils/publicScheduleStatus';
import {
  formatOverviewDate,
  getRiskToneClass,
  normalizeBoardActivity,
  normalizeBoardOverview,
  summarizeActivityDate,
} from '../../utils/publicSchedulesBoard';

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

export default function PublicScheduleCard({
  item,
  tone,
  isSelected = false,
  isMobileViewport = false,
  canManage = false,
  supportsFolders = false,
  deletingScheduleId = '',
  movingFolderBySchedule = {},
  updatingStatusBySchedule = {},
  savingMetaBySchedule = {},
  holdingReasonDrafts = {},
  nextActionDrafts = {},
  folderSelectOptions = [],
  employeeDirectory,
  buildEmployeeDisplay,
  onOpenPreview,
  onDeleteSchedule,
  onChangeScheduleStatus,
  onChangeScheduleFolder,
  onHoldingReasonDraftChange,
  onNextActionDraftChange,
  onSaveHoldingReason,
  onSaveNextAction,
}) {
  const id = String(item?.id || '').trim();
  const name = String(item?.name || item?.title || '').trim() || '이름 없는 일정';
  const tasksCount = Number(item?.tasksCount ?? item?.taskCount ?? 0) || 0;
  const overview = normalizeBoardOverview(item);
  const recentActivity = normalizeBoardActivity(item?.recentActivity ?? item?.activityLog ?? []);
  const dueDateLabel = formatOverviewDate(overview.endDate) || '-';
  const updatedAtLabel =
    summarizeActivityDate(overview.lastActivityAt || item?.updatedAt || item?.updated_at) ||
    item?.updatedAt ||
    item?.updated_at ||
    '-';
  const primaryAssignee = overview.primaryAssignee || overview.assignees.join(', ') || '미지정';
  const departmentLabel = overview.primaryDepartment || overview.departments.join(', ') || '-';
  const rowFolderIdValue = String(item?.folderId || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID;
  const rowStatusValue = normalizePublicScheduleStatus(item?.status);
  const isMoving = !!movingFolderBySchedule[id];
  const isUpdatingStatus = !!updatingStatusBySchedule[id];
  const isSavingMeta = !!savingMetaBySchedule[id];
  const holdingReasonValue = Object.prototype.hasOwnProperty.call(holdingReasonDrafts, id)
    ? holdingReasonDrafts[id]
    : String(item?.holdingReason || '').trim();
  const nextActionValue = Object.prototype.hasOwnProperty.call(nextActionDrafts, id)
    ? nextActionDrafts[id]
    : String(item?.nextAction || '').trim();
  const revealClassName = isMobileViewport
    ? 'mt-4 space-y-3 opacity-100'
    : 'pointer-events-none mt-0 max-h-0 translate-y-2 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:mt-4 group-hover:max-h-[48rem] group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:mt-4 group-focus-within:max-h-[48rem] group-focus-within:translate-y-0 group-focus-within:opacity-100';
  const riskToneClass = getRiskToneClass(overview) || 'border-white/70';
  const riskLabels = overview.riskLabels.length > 0 ? overview.riskLabels : ['정상'];

  return (
    <article
      className={`group rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${tone?.cardGlow || ''} ${riskToneClass} ${
        isSelected ? 'ring-2 ring-blue-500/80' : ''
      }`}
    >
      <button type="button" onClick={() => onOpenPreview?.(item)} className="block w-full text-left">
        <h4 className="break-words text-sm font-black leading-5 text-slate-900 transition group-hover:text-blue-700 group-focus-within:text-blue-700">
          {name}
        </h4>
      </button>

      <div className={revealClassName}>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Owner</p>
            <p className="mt-1 break-words font-semibold text-slate-700">{primaryAssignee}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Progress</p>
            <p className="mt-1 font-semibold text-slate-700">{overview.progress}%</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Due</p>
            <p className="mt-1 font-semibold text-slate-700">{dueDateLabel}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Updated</p>
            <p className="mt-1 font-semibold text-slate-700">{updatedAtLabel}</p>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-slate-900 transition-all"
            style={{ width: `${Math.max(4, overview.progress)}%` }}
          />
        </div>

        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">태스크 {tasksCount}건</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{departmentLabel}</span>
          {riskLabels.map((riskLabel) => (
            <span
              key={`${id}-risk-${riskLabel}`}
              className={`rounded-full px-2.5 py-1 ${getRiskLabelClassName(riskLabel)}`}
            >
              {riskLabel}
            </span>
          ))}
        </div>

        <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-[11px]">
          <div>
            <p className="font-bold uppercase tracking-wide text-slate-400">Holding</p>
            {canManage ? (
              <textarea
                value={holdingReasonValue}
                onChange={(event) => onHoldingReasonDraftChange?.(id, event.target.value)}
                onBlur={() => {
                  void onSaveHoldingReason?.(item);
                }}
                disabled={isSavingMeta}
                placeholder="보류 사유를 입력하면 카드와 상세 화면에 바로 반영됩니다."
                className="mt-1 min-h-[68px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            ) : (
              <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{holdingReasonValue || '-'}</p>
            )}
          </div>
          <div>
            <p className="font-bold uppercase tracking-wide text-slate-400">Next action</p>
            {canManage ? (
              <textarea
                value={nextActionValue}
                onChange={(event) => onNextActionDraftChange?.(id, event.target.value)}
                onBlur={() => {
                  void onSaveNextAction?.(item);
                }}
                disabled={isSavingMeta}
                placeholder="다음 액션을 입력하면 팀이 바로 확인할 수 있습니다."
                className="mt-1 min-h-[68px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            ) : (
              <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{nextActionValue || '-'}</p>
            )}
          </div>
          {isSavingMeta ? <p className="text-[10px] font-semibold text-amber-600">메타 정보를 저장 중입니다...</p> : null}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Recent activity</p>
            <span className="text-[10px] font-semibold text-slate-400">{recentActivity.length}건</span>
          </div>
          {recentActivity.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-400">표시할 최근 활동이 없습니다.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {recentActivity.slice(0, 3).map((entry) => {
                const actor = buildEmployeeDisplay?.(entry.actorEmail, employeeDirectory) || {};
                return (
                  <div key={entry.id || `${id}-${entry.at}`} className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="break-words text-[11px] font-semibold text-slate-700">{entry.message}</p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {actor.profile || actor.email || '알 수 없는 사용자'} · {summarizeActivityDate(entry.at) || '-'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => onOpenPreview?.(item)}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-blue-600 hover:text-white"
          >
            상세 보기
          </button>
          {canManage ? (
            <button
              type="button"
              onClick={() => void onDeleteSchedule?.(item)}
              disabled={deletingScheduleId === id}
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingScheduleId === id ? '삭제 중...' : '삭제'}
            </button>
          ) : null}
        </div>

        {canManage ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label htmlFor={`status-${id}`} className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Status
              </label>
              <select
                id={`status-${id}`}
                value={rowStatusValue}
                onChange={(event) => {
                  void onChangeScheduleStatus?.(item, event.target.value);
                }}
                disabled={isUpdatingStatus}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {PUBLIC_SCHEDULE_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {getPublicScheduleStatusLabel(status)}
                  </option>
                ))}
              </select>
              {isUpdatingStatus ? <span className="text-[10px] font-semibold text-amber-600">...</span> : null}
            </div>
            {supportsFolders ? (
              <div className="flex items-center gap-2">
                <label htmlFor={`folder-${id}`} className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Folder
                </label>
                <select
                  id={`folder-${id}`}
                  value={rowFolderIdValue}
                  onChange={(event) => {
                    void onChangeScheduleFolder?.(item, event.target.value);
                  }}
                  disabled={isMoving}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {folderSelectOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {isMoving ? <span className="text-[10px] font-semibold text-amber-600">...</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
