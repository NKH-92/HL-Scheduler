export default function PublicSchedulePreviewToolbar({
  previewFilterText = '',
  onPreviewFilterChange,
  previewViewMode = 'Week',
  onPreviewViewModeChange,
  viewModeLabels,
  zoomValue = 100,
  onZoomOut,
  onZoomIn,
  rangePadding = { before: 0, after: 0 },
  rangeUnit = '',
  onRangeBeforeChange,
  onRangeAfterChange,
  fitEnabled = false,
  onFitChange,
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200/70 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="w-full lg:max-w-sm">
        <label className="field-label">미리보기 필터</label>
        <input
          type="text"
          value={previewFilterText}
          onChange={(event) => onPreviewFilterChange?.(event.target.value)}
          placeholder="태스크명, 부서, 담당자 검색"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={previewViewMode}
          onChange={(event) => onPreviewViewModeChange?.(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          <option value="Day">{viewModeLabels?.Day || 'Day'}</option>
          <option value="Week">{viewModeLabels?.Week || 'Week'}</option>
          <option value="Month">{viewModeLabels?.Month || 'Month'}</option>
        </select>
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="font-semibold text-slate-500">Zoom</span>
          <button
            type="button"
            onClick={onZoomOut}
            className="h-6 w-6 rounded border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50"
          >
            -
          </button>
          <span className="w-12 text-center text-[11px] tabular-nums">{zoomValue}%</span>
          <button
            type="button"
            onClick={onZoomIn}
            className="h-6 w-6 rounded border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50"
          >
            +
          </button>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="font-semibold text-slate-500">Range</span>
          <input
            type="number"
            min="0"
            className="w-12 rounded border border-slate-200 px-1 text-center"
            value={Number(rangePadding.before) || 0}
            onChange={(event) => onRangeBeforeChange?.(event.target.value)}
          />
          <span className="text-slate-400">~</span>
          <input
            type="number"
            min="0"
            className="w-12 rounded border border-slate-200 px-1 text-center"
            value={Number(rangePadding.after) || 0}
            onChange={(event) => onRangeAfterChange?.(event.target.value)}
          />
          <span className="text-slate-400">({rangeUnit})</span>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
          <input
            type="checkbox"
            className="accent-blue-600"
            checked={fitEnabled}
            onChange={(event) => onFitChange?.(event.target.checked)}
          />
          <span className="text-sm font-semibold text-slate-700">화면 맞춤</span>
        </label>
      </div>
    </div>
  );
}
