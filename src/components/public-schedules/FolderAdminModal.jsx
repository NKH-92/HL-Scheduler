import Modal from '../Modal';
import { Plus, Trash2, XIcon } from '../Icons';

export default function FolderAdminModal({
  isOpen,
  onClose,
  folderManageError,
  newFolderName,
  setNewFolderName,
  newFolderParentId,
  setNewFolderParentId,
  isCreatingFolder,
  isDeletingFolder,
  movingFolderId,
  folders,
  selectedFolderForAdmin,
  selectedFolderId,
  setSelectedFolderId,
  createFolder,
  deleteSelectedFolder,
  moveFolderOrder,
  folderMoveStateById,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="폴더 관리"
      panelClassName="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 px-6 py-5">
        <div>
          <h3 className="text-lg font-bold text-slate-900">폴더 관리</h3>
          <p className="mt-1 text-xs text-slate-500">폴더 생성, 삭제, 순서 변경을 수행합니다.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="닫기"
        >
          <XIcon size={20} />
        </button>
      </div>

      <div className="space-y-3 px-6 py-5">
        <label className="field-label">새 폴더 이름</label>
        <input
          type="text"
          value={newFolderName}
          onChange={(event) => setNewFolderName(event.target.value)}
          placeholder="예: 신규사업기획"
          data-modal-autofocus="true"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          disabled={isCreatingFolder}
        />
        <label className="field-label">상위 폴더</label>
        <select
          value={newFolderParentId}
          onChange={(event) => setNewFolderParentId(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          disabled={isCreatingFolder}
        >
          <option value="">(루트)</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{`${'-- '.repeat(Math.max(0, folder.depth - 1))}${folder.name}`}</option>
          ))}
        </select>
        <label className="field-label">삭제 대상 폴더</label>
        <select
          value={selectedFolderForAdmin?.id || ''}
          onChange={(event) => setSelectedFolderId(event.target.value || '__all_folders__')}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          disabled={isDeletingFolder || !!movingFolderId}
        >
          <option value="">(삭제할 폴더 선택)</option>
          {folders.map((folder) => (
            <option key={`delete-folder-${folder.id}`} value={folder.id}>
              {folder.path}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void createFolder()}
            disabled={isCreatingFolder || !!movingFolderId}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={14} /> {isCreatingFolder ? '생성 중...' : '폴더 생성'}
          </button>
          <button
            type="button"
            onClick={() => void deleteSelectedFolder()}
            disabled={
              isDeletingFolder ||
              !!movingFolderId ||
              !selectedFolderForAdmin ||
              selectedFolderId === '__all_folders__' ||
              !selectedFolderId
            }
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={14} /> {isDeletingFolder ? '삭제 중...' : '선택 폴더 삭제'}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">폴더 순서</h4>
              <p className="mt-1 text-[11px] text-slate-500">같은 상위 폴더 안에서만 위/아래로 이동할 수 있습니다.</p>
            </div>
            {movingFolderId && <span className="text-[11px] font-semibold text-amber-600">변경 중...</span>}
          </div>

          <div className="custom-scrollbar mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {folders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-400">
                생성된 폴더가 없습니다.
              </div>
            ) : (
              folders.map((folder) => {
                const moveState = folderMoveStateById.get(folder.id) || { canMoveUp: false, canMoveDown: false };

                return (
                  <div key={`folder-order-${folder.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <div className="min-w-0 flex-1" style={{ paddingLeft: `${Math.max(0, folder.depth - 1) * 14}px` }}>
                      <p className="truncate text-sm font-semibold text-slate-800">{folder.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{folder.path}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void moveFolderOrder(folder, 'up')}
                        disabled={!moveState.canMoveUp || !!movingFolderId || isCreatingFolder || isDeletingFolder}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        위로
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveFolderOrder(folder, 'down')}
                        disabled={!moveState.canMoveDown || !!movingFolderId || isCreatingFolder || isDeletingFolder}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        아래로
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {folderManageError && <div className="mx-6 mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{folderManageError}</div>}

      <div className="flex items-center justify-end gap-2 border-t border-slate-200/70 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          닫기
        </button>
      </div>
    </Modal>
  );
}
