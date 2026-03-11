import Modal from './Modal';

export default function AppConfirmDialog({ dialog, onClose }) {
  return (
    <Modal
      isOpen={dialog.isOpen}
      onClose={() => onClose(dialog.mode === 'alert')}
      ariaLabel={dialog.title || '확인'}
      panelClassName="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-slate-900">{dialog.title || '확인'}</h3>
        </div>
      </div>

      <div className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{dialog.message}</div>

      <div className="mt-6 flex items-center justify-end gap-2">
        {dialog.mode !== 'alert' && (
          <button
            type="button"
            onClick={() => onClose(false)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {dialog.cancelText || '취소'}
          </button>
        )}
        <button
          type="button"
          onClick={() => onClose(true)}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          {dialog.confirmText || '확인'}
        </button>
      </div>
    </Modal>
  );
}
