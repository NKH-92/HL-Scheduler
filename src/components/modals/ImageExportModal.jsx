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
      ariaLabel="이미지 내보내기"
      panelClassName="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">이미지 내보내기</h3>
          <p className="mt-1 text-xs text-slate-500">간트 차트를 PNG/JPG 파일로 저장합니다.</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          type="button"
          aria-label="닫기"
        >
          <XIcon size={20} />
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label className="field-label">파일 형식</label>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
          >
            <option value="png">PNG (권장)</option>
            <option value="jpg">JPG</option>
          </select>
        </div>

        <div>
          <label className="field-label">내보내기 범위</label>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
            value={exportScope}
            onChange={(e) => setExportScope(e.target.value)}
          >
            <option value="full">전체 차트 (현재 필터 기준)</option>
            <option value="visible">현재 보이는 화면</option>
          </select>
        </div>

        <div>
          <label className="field-label">해상도 (Scale)</label>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
            value={String(exportScale)}
            onChange={(e) => setExportScale(Number(e.target.value))}
          >
            <option value="1">x1</option>
            <option value="2">x2</option>
            <option value="3">x3 (고화질)</option>
            <option value="4">x4 (초고화질)</option>
          </select>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div>
            <p className="text-xs font-semibold text-slate-700">Today 표시 포함</p>
            <p className="text-[11px] text-slate-500">저장 이미지에 Today 기준선을 함께 표시합니다.</p>
          </div>
          <input
            type="checkbox"
            className="accent-emerald-600"
            checked={exportShowToday}
            onChange={(e) => setExportShowToday(e.target.checked)}
          />
        </label>

        <div>
          <label className="field-label">파일명 (선택)</label>
          <input
            type="text"
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
            placeholder="비워두면 자동 생성"
            value={exportFileName}
            onChange={(e) => setExportFileName(e.target.value)}
          />
        </div>

        {exportFormat === 'jpg' && (
          <div>
            <label className="field-label">JPG 품질 (0.5 ~ 1.0)</label>
            <input
              type="number"
              step="0.05"
              min="0.5"
              max="1"
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
              value={exportJpegQuality}
              onChange={(e) => setExportJpegQuality(Number(e.target.value))}
            />
          </div>
        )}

        <button
          onClick={exportGanttImage}
          className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
          type="button"
        >
          저장하기
        </button>
      </div>
    </Modal>
  );
}

export default ImageExportModal;
