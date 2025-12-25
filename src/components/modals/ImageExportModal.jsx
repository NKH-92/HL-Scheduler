import Modal from '../Modal';
import { XIcon } from '../Icons';

function ImageExportModal({
  isOpen,
  onClose,
  exportFormat,
  setExportFormat,
  exportScope,
  setExportScope,
  exportScale,
  setExportScale,
  exportShowToday,
  setExportShowToday,
  exportFileName,
  setExportFileName,
  exportJpegQuality,
  setExportJpegQuality,
  exportGanttImage,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="이미지 저장"
      panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 p-6 space-y-5 animate-fade-in border border-white/20"
    >
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-slate-800">이미지 저장</h3>
          <p className="text-xs text-slate-500 mt-1">Gantt 차트를 PNG/JPG로 캡쳐합니다.</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
          type="button"
          aria-label="닫기"
        >
          <XIcon size={20} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">포맷</label>
          <select
            className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
          >
            <option value="png">PNG (권장)</option>
            <option value="jpg">JPG</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">캡쳐 범위</label>
          <select
            className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            value={exportScope}
            onChange={(e) => setExportScope(e.target.value)}
          >
            <option value="full">전체 차트(스크롤포함)</option>
            <option value="visible">현재 화면(보이는 영역)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">해상도(scale)</label>
          <select
            className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            value={String(exportScale)}
            onChange={(e) => setExportScale(Number(e.target.value))}
          >
            <option value="1">x1</option>
            <option value="2">x2</option>
            <option value="3">x3 (고화질)</option>
            <option value="4">x4 (초고화질)</option>
          </select>
        </div>

        <label className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-600">Today 표시</p>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">내보내기 이미지에 Today 선/라벨 포함</p>
          </div>
          <input
            type="checkbox"
            className="accent-emerald-600"
            checked={exportShowToday}
            onChange={(e) => setExportShowToday(e.target.checked)}
          />
        </label>

        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">파일명 (선택)</label>
          <input
            type="text"
            className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            placeholder="미입력 시 자동 생성"
            value={exportFileName}
            onChange={(e) => setExportFileName(e.target.value)}
          />
        </div>

        {exportFormat === 'jpg' && (
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">JPG 품질 (0.5~1)</label>
            <input
              type="number"
              step="0.05"
              min="0.5"
              max="1"
              className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              value={exportJpegQuality}
              onChange={(e) => setExportJpegQuality(Number(e.target.value))}
            />
          </div>
        )}

        <button
          onClick={exportGanttImage}
          className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition-all active:scale-[0.99]"
          type="button"
        >
          저장하기
        </button>
      </div>
    </Modal>
  );
}

export default ImageExportModal;
