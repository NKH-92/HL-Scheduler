import Modal from '../Modal';
import { XIcon } from '../Icons';

function TaskEditModal({ isOpen, onClose, editingTask, formData, setFormData, onSave }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={editingTask ? '업무 수정' : '새 업무 등록'}
      panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 animate-fade-in border border-white/20"
    >
      <div className="bg-white px-6 py-5 border-b border-slate-100 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-slate-800">{editingTask ? '업무 수정' : '새 업무 등록'}</h3>
          <p className="text-xs text-slate-500 mt-1">업무의 세부 사항을 입력해주세요.</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
          type="button"
          aria-label="닫기"
        >
          <XIcon size={24} />
        </button>
      </div>

      <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
          <input
            type="text"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">Task Name</label>
          <input
            type="text"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            value={formData.taskName}
            onChange={(e) => setFormData({ ...formData, taskName: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">Department</label>
          <input
            type="text"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            value={formData.department}
            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-indigo-600 uppercase">Assignee</label>
          <input
            type="text"
            className="w-full bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            placeholder="담당자 이름"
            value={formData.assignee}
            onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">Start Date</label>
          <input
            type="date"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
            value={formData.start}
            onChange={(e) => setFormData({ ...formData, start: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">End Date</label>
          <input
            type="date"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
            value={formData.end}
            onChange={(e) => setFormData({ ...formData, end: e.target.value })}
          />
        </div>

        <div className="col-span-2 space-y-2">
          <div className="flex justify-between">
            <label className="text-xs font-bold text-slate-500 uppercase">Progress</label>
            <span className="text-xs font-bold text-indigo-600">{formData.progress}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            value={formData.progress}
            onChange={(e) => setFormData({ ...formData, progress: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="bg-slate-50 px-8 py-5 border-t border-slate-100 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-white hover:border-slate-300 transition-colors text-sm"
          type="button"
        >
          취소
        </button>
        <button
          onClick={onSave}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95 text-sm"
          type="button"
        >
          저장하기
        </button>
      </div>
    </Modal>
  );
}

export default TaskEditModal;
