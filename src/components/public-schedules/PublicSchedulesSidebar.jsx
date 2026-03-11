export default function PublicSchedulesSidebar({
  isCollapsed = false,
  supportsFolders = false,
  isLoadingFolders = false,
  canManageFolders = false,
  sharedModeId = '',
  folderNavigationItems = [],
  selectedFolderId = '',
  selectedItemCount = 0,
  foldersError = '',
  onToggleCollapse,
  onOpenFolderAdmin,
  onSelectFolder,
}) {
  return (
    <aside
      className={`glass-panel w-full shrink-0 overflow-hidden transition-all duration-300 ${
        isCollapsed ? 'lg:w-[88px]' : 'lg:w-[320px]'
      }`}
    >
      <div className={`border-b border-slate-200/70 ${isCollapsed ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
        <div className={`flex ${isCollapsed ? 'justify-center' : 'items-start justify-between gap-3'}`}>
          {!isCollapsed ? (
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">폴더</h2>
              <p className="mt-1 text-xs text-slate-500">
                {supportsFolders
                  ? isLoadingFolders
                    ? '폴더를 불러오는 중...'
                    : `${folderNavigationItems.length}개 폴더`
                  : '폴더 기능이 비활성화되어 있습니다.'}
              </p>
              {sharedModeId ? (
                <p className="mt-1 text-[11px] font-semibold text-blue-700">공유 일정 ID {sharedModeId}</p>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!isCollapsed}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {isCollapsed ? '펼치기' : '접기'}
          </button>
        </div>
      </div>

      {isCollapsed ? (
        <div className="flex h-full flex-col items-center gap-3 px-3 py-4">
          <div className="w-full rounded-2xl bg-slate-100 px-2 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Folders</p>
            <p className="mt-1 text-lg font-black text-slate-900">{folderNavigationItems.length}</p>
          </div>
          <button
            type="button"
            disabled={!canManageFolders}
            title={canManageFolders ? '폴더 관리 열기' : '폴더 관리 권한이 없습니다'}
            onClick={onOpenFolderAdmin}
            className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            관리
          </button>
          {sharedModeId ? (
            <div className="w-full rounded-xl bg-blue-50 px-2 py-2 text-center text-[10px] font-semibold text-blue-700">
              ID 고정
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {foldersError ? (
            <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {foldersError}
            </div>
          ) : null}

          <div className="custom-scrollbar max-h-[50vh] overflow-y-auto px-3 pt-2 pb-3">
            {folderNavigationItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                {isLoadingFolders ? '폴더를 불러오는 중...' : '표시할 폴더가 없습니다.'}
              </div>
            ) : (
              folderNavigationItems.map((folder) => {
                const isSelected = selectedFolderId === folder.id;
                const projectCount = isSelected ? selectedItemCount : Number(folder?.projectCount ?? 0) || 0;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => onSelectFolder?.(folder.id)}
                    className={`mb-1 flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-sm transition-all duration-200 ${
                      isSelected
                        ? 'bg-blue-50 font-bold text-blue-700 ring-1 ring-inset ring-blue-500/20'
                        : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    style={{ paddingLeft: `${16 + (Math.max(1, folder.depth) - 1) * 16}px` }}
                  >
                    <span className="truncate">{folder.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        isSelected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {projectCount}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-200/70 px-4 py-2.5">
            <button
              type="button"
              disabled={!canManageFolders}
              onClick={onOpenFolderAdmin}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              폴더 관리 {canManageFolders ? '' : '(권한 없음)'}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
