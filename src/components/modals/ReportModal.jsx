import Modal from '../Modal';
import GanttChart from '../GanttChart';
import { FileText, XIcon } from '../Icons';

const VIEW_MODE_LABELS = {
  Day: '일 (Day)',
  Week: '주 (Week)',
  Month: '월 (Month)',
};

function ReportModal({
  isOpen,
  onClose,
  tasks,
  vacations,
  rangePadding,
  reportChartWidth,
  reportLeftPaneWidth,
  reportGanttMode,
  setReportGanttMode,
  generateWordReport,
  isGenerating,
}) {
  const exportChartWidth = Number(reportChartWidth) || 0;
  const exportLeftPaneWidth = Number(reportLeftPaneWidth) || 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="보고서 미리보기"
      panelClassName="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 px-6 py-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">보고서 미리보기</h3>
          <p className="mt-1 text-xs text-slate-500">
            전체 프로젝트 기준으로 간트 미리보기를 확인한 뒤 Word 보고서를 생성합니다.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          type="button"
          aria-label="닫기"
        >
          <XIcon size={22} />
        </button>
      </div>

      <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto bg-slate-50/70 p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label className="field-label">간트 보기 기준</label>
          <div className="flex flex-wrap gap-2">
            {['Day', 'Week', 'Month'].map((mode) => (
              <button
                key={mode}
                onClick={() => setReportGanttMode(mode)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                  reportGanttMode === mode
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                type="button"
              >
                {VIEW_MODE_LABELS[mode] || mode}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-bold text-slate-800">보고서 미리보기 (차트)</h4>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
            <GanttChart
              tasks={tasks}
              vacations={vacations}
              viewMode={reportGanttMode}
              rangePadding={rangePadding[reportGanttMode] || { before: 0, after: 0 }}
              fitEnabled={exportChartWidth > 0}
              isExportMode
              exportId="gantt-report-preview"
              exportViewportWidth={exportChartWidth}
              exportLeftPaneWidth={exportLeftPaneWidth}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200/70 px-6 py-4">
        <button
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          type="button"
        >
          닫기
        </button>
        <button
          onClick={generateWordReport}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
        >
          {isGenerating ? (
            '생성 중...'
          ) : (
            <>
              <FileText size={18} /> Word 보고서 다운로드
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}

export default ReportModal;
