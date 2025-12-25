import Modal from '../Modal';
import GanttChart from '../GanttChart';
import { FileText, XIcon } from '../Icons';

function ReportModal({
  isOpen,
  onClose,
  tasks,
  vacations,
  rangePadding,
  reportGanttMode,
  setReportGanttMode,
  generateWordReport,
  isGenerating,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="보고서 내보내기"
      panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden max-h-[90vh] flex flex-col relative z-10 animate-fade-in border border-white/20"
    >
      <div className="bg-white px-6 py-4 border-b border-slate-100 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-slate-800">보고서 내보내기</h3>
          <p className="text-xs text-slate-500 mt-1">Gantt 미리보기와 Word 보고서를 생성합니다.</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
          type="button"
          aria-label="닫기"
        >
          <XIcon size={22} />
        </button>
      </div>

      <div className="p-6 overflow-y-auto flex-1 bg-slate-50 custom-scrollbar space-y-6">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Gantt View Mode</label>
          <div className="flex flex-wrap gap-2">
            {['Day', 'Week', 'Month'].map((mode) => (
              <button
                key={mode}
                onClick={() => setReportGanttMode(mode)}
                className={`px-4 py-2 rounded-xl border text-sm font-bold transition-colors ${
                  reportGanttMode === mode
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
                type="button"
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <h4 className="text-sm font-bold mb-3 text-slate-700">보고서 미리보기 (차트)</h4>
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto p-2">
            <GanttChart
              tasks={tasks}
              vacations={vacations}
              viewMode={reportGanttMode}
              rangePadding={rangePadding[reportGanttMode] || { before: 0, after: 0 }}
              isExportMode
            />
          </div>
        </div>
      </div>

      <div className="bg-white px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-white hover:border-slate-300 transition-colors text-sm"
          type="button"
        >
          닫기
        </button>
        <button
          onClick={generateWordReport}
          disabled={isGenerating}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:bg-indigo-300 flex items-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-95 text-sm"
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
