import { useRef } from 'react';
import TabButton from './TabButton';
import { BarChart2, CalendarIcon, CheckSquare, Download, FileText, Info, Layout, Save, Users } from './Icons';

const getDisplayVersion = () => {
  const raw = typeof __APP_VERSION__ !== 'undefined' ? String(__APP_VERSION__) : '';
  const parts = raw.split('.').filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  if (parts.length === 1) return parts[0];
  return '';
};

function AppHeader({
  activeMainTab,
  onMainTabChange,
  activeEditorTab,
  onEditorTabChange,
  onSaveProject,
  onImportFile,
  showAppZoomControls = false,
  appZoomPercent = 100,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  canAccessEditor = false,
  isAuthenticated = false,
  authEmail = '',
  authProfile = null,
  onOpenAuthModal,
  onSignOut,
  isAuthBusy = false,
}) {
  const fileInputRef = useRef(null);
  const isEditMode = canAccessEditor && activeMainTab === 'edit';
  const versionLabel = getDisplayVersion();

  const handleMainTabChange = (nextTab) => {
    if (nextTab === 'edit' && !canAccessEditor) {
      onOpenAuthModal?.();
      return;
    }
    onMainTabChange(nextTab);
  };

  return (
    <header className="sticky top-0 z-40">
      <div className="absolute inset-0 border-b border-slate-200/70 bg-white/78 backdrop-blur-xl" />

      <div className="relative px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-2.5 text-white shadow-lg shadow-blue-500/30">
                <Layout size={20} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-[20px] font-extrabold tracking-tight text-slate-900">HL-Scheduler</h1>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold tracking-wide text-slate-500">Project Timeline Studio</span>
                  {versionLabel ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">
                      v{versionLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="hidden min-w-0 items-center rounded-2xl border border-slate-200/70 bg-slate-50/80 p-1 md:flex">
              {canAccessEditor && (
                <TabButton
                  active={activeMainTab === 'edit'}
                  onClick={() => handleMainTabChange('edit')}
                  icon={<Layout size={16} />}
                  label="편집"
                />
              )}
              <TabButton
                active={activeMainTab === 'browse'}
                onClick={() => handleMainTabChange('browse')}
                icon={<Users size={16} />}
                label="공개 일정"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex w-[84px] items-center justify-end gap-2">
                <button
                  onClick={onSaveProject}
                  className={`rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-700 ${
                    isEditMode ? '' : 'pointer-events-none invisible'
                  }`}
                  title="프로젝트 백업(JSON)"
                  type="button"
                  aria-hidden={!isEditMode}
                  tabIndex={isEditMode ? 0 : -1}
                >
                  <Save size={18} />
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-700 ${
                    isEditMode ? '' : 'pointer-events-none invisible'
                  }`}
                  title="프로젝트 불러오기(JSON)"
                  type="button"
                  aria-hidden={!isEditMode}
                  tabIndex={isEditMode ? 0 : -1}
                >
                  <Download size={18} />
                </button>
              </div>

              {showAppZoomControls && (
                <div className="hidden items-center gap-1 rounded-xl border border-slate-200 bg-white/70 p-1 sm:flex">
                  <button
                    type="button"
                    onClick={onZoomOut}
                    className="h-8 w-8 rounded-lg font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    title="화면 축소"
                    aria-label="화면 축소"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={onZoomReset}
                    className="h-8 rounded-lg px-2 text-[11px] font-bold tabular-nums text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    title="화면 배율 초기화"
                    aria-label="화면 배율 초기화"
                  >
                    {Math.round(Number(appZoomPercent) || 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={onZoomIn}
                    className="h-8 w-8 rounded-lg font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    title="화면 확대"
                    aria-label="화면 확대"
                  >
                    +
                  </button>
                </div>
              )}

              {isAuthenticated ? (
                <>
                  <div className="hidden max-w-[320px] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs sm:block">
                    <div className="truncate font-semibold text-slate-700">{authEmail || '로그인 사용자'}</div>
                    {authProfile && (
                      <div className="truncate text-[11px] text-slate-500">
                        {`${authProfile.name || '-'} / ${authProfile.department || '-'} / ${authProfile.position || '-'}`}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSignOut?.()}
                    disabled={isAuthBusy}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    로그아웃
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenAuthModal?.()}
                  disabled={isAuthBusy}
                  className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  로그인
                </button>
              )}

              <input type="file" ref={fileInputRef} onChange={onImportFile} className="hidden" accept=".json" />
            </div>
          </div>

          <div className="md:hidden">
            <label className="sr-only" htmlFor="mobile-main-tab-select">
              메인 탭
            </label>
            <select
              id="mobile-main-tab-select"
              value={canAccessEditor ? activeMainTab : 'browse'}
              onChange={(e) => handleMainTabChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              {canAccessEditor && <option value="edit">편집</option>}
              <option value="browse">공개 일정</option>
            </select>
          </div>

          <div className="hidden md:block">
            <nav
              className={`items-center rounded-2xl border border-slate-200/70 bg-slate-50/80 p-1 md:flex ${
                isEditMode ? '' : 'pointer-events-none invisible'
              }`}
              aria-hidden={!isEditMode}
            >
              <TabButton
                active={activeEditorTab === 'tasks'}
                onClick={() => onEditorTabChange('tasks')}
                icon={<CheckSquare size={16} />}
                label="작업 관리"
              />
              <TabButton
                active={activeEditorTab === 'schedule'}
                onClick={() => onEditorTabChange('schedule')}
                icon={<CalendarIcon size={16} />}
                label="간트 / 일정"
              />
              <TabButton
                active={activeEditorTab === 'dashboard'}
                onClick={() => onEditorTabChange('dashboard')}
                icon={<BarChart2 size={16} />}
                label="대시보드"
              />
              <TabButton
                active={activeEditorTab === 'help'}
                onClick={() => onEditorTabChange('help')}
                icon={<Info size={16} />}
                label="도움말"
              />
              <TabButton
                active={activeEditorTab === 'revisions'}
                onClick={() => onEditorTabChange('revisions')}
                icon={<FileText size={16} />}
                label="개정이력"
              />
            </nav>
          </div>

          <div className="md:hidden">
            <label className="sr-only" htmlFor="mobile-editor-tab-select">
              편집 탭
            </label>
            <select
              id="mobile-editor-tab-select"
              value={isEditMode ? activeEditorTab : 'tasks'}
              onChange={(e) => onEditorTabChange(e.target.value)}
              disabled={!isEditMode}
              className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                isEditMode ? '' : 'pointer-events-none invisible'
              }`}
              aria-hidden={!isEditMode}
              tabIndex={isEditMode ? 0 : -1}
            >
              <option value="tasks">작업 관리</option>
              <option value="schedule">간트 / 일정</option>
              <option value="dashboard">대시보드</option>
              <option value="help">도움말</option>
              <option value="revisions">개정이력</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
