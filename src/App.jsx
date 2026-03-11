import { useCallback, useEffect, useMemo, useState } from 'react';
import AppHeader from './components/AppHeader';
import AppConfirmDialog from './components/AppConfirmDialog';
import AppEditorContent from './components/AppEditorContent';
import PublicSchedules from './components/PublicSchedules';
import AdminUserManagement from './components/AdminUserManagement';
import AuthModal from './components/modals/AuthModal';
import ImageExportModal from './components/modals/ImageExportModal';
import PublicUploadModal from './components/modals/PublicUploadModal';
import ReportModal from './components/modals/ReportModal';
import TaskEditModal from './components/modals/TaskEditModal';
import { useAuth } from './context/AuthContext';
import { generateId, newTaskTemplate, normalizeTasks } from './utils/data';
import { applyDependencyScheduling, findDependencyCycleIds } from './utils/dependencies';
import { formatDate } from './utils/dates';
import useEditorActions from './hooks/useEditorActions';
import useProjectImport from './hooks/useProjectImport';
import useProjectExports from './hooks/useProjectExports';
import usePublicScheduleWorkflow from './hooks/usePublicScheduleWorkflow';
import { useSchedulerStorage } from './hooks/useSchedulerStorage';
import { mergeRangePadding, sanitizeFitSettings, sanitizeZoomSettings } from './utils/schedulerSettings';
import {
  getAdminAppUrl,
  getSharedScheduleId,
  getPublicAppUrl,
  getSchedulerAppRole,
  isPublicSchedulesWriteEnabled,
} from './utils/publicSchedulesApi';
import { findEmployeeByEmail, getEmployeeDirectory } from './utils/employeeDirectory';
import { resolvePostAuthNavigation } from './utils/authRedirect';
import useAsyncDialog from './hooks/useAsyncDialog';
import { getDisplayVersion } from './utils/shared';

// getDisplayVersion is now imported from shared.js

function App() {
  const [activeMainTab, setActiveMainTab] = useState('edit');
  const [activeEditorTab, setActiveEditorTab] = useState('tasks');
  const { dialog: confirmDialog, closeDialog: closeConfirmDialog, confirmAsync, alertAsync } = useAsyncDialog();

  const {
    isLoading: isAuthLoading,
    authUser,
    permissions,
    isAuthenticated,
    isAdmin,
    signIn,
    signUp,
    signOut,
    refreshSession,
  } = useAuth();

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const {
    projectName,
    setProjectName,
    tasks,
    setTasks,
    vacations,
    setVacations,
    rangePadding,
    setRangePadding,
    fitSettings,
    setFitSettings,
    zoomSettings,
    setZoomSettings,
    storageError,
  } = useSchedulerStorage();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [ganttViewMode, setGanttViewMode] = useState('Day');
  const [filterText, setFilterText] = useState('');
  const [isVacationPanelOpen, setIsVacationPanelOpen] = useState(true);
  const [vacForm, setVacForm] = useState(() => {
    const today = formatDate(new Date());
    return { title: '', start: today, end: today };
  });
  const [formData, setFormData] = useState(newTaskTemplate());
  const [publicOrigin, setPublicOrigin] = useState(null);
  const [taskManagerResetToken, setTaskManagerResetToken] = useState(0);


  const filteredTasks = useMemo(() => {
    if (!filterText.trim()) return tasks;
    const lower = filterText.toLowerCase();
    return tasks.filter(
      (t) =>
        (t.taskName && t.taskName.toLowerCase().includes(lower)) ||
        (t.department && t.department.toLowerCase().includes(lower)) ||
        (t.assignee && t.assignee.toLowerCase().includes(lower)) ||
        (t.assigneePosition && String(t.assigneePosition).toLowerCase().includes(lower)) ||
        (t.assigneeEmail && String(t.assigneeEmail).toLowerCase().includes(lower)),
    );
  }, [tasks, filterText]);

  const applyTaskRules = useCallback((taskList) => {
    const normalized = normalizeTasks(Array.isArray(taskList) ? taskList : []);
    return applyDependencyScheduling(normalized).tasks;
  }, []);

  const updateTasksWithRules = useCallback(
    (updater, _label = '') => {
      setTasks((prev) => {
        const raw = typeof updater === 'function' ? updater(prev) : updater;
        return applyTaskRules(raw);
      });
    },
    [setTasks, applyTaskRules],
  );
  const { applyImportedData, handleFileImport } = useProjectImport({
    alertAsync,
    applyTaskRules,
    confirmAsync,
    setFitSettings,
    setProjectName,
    setPublicOrigin,
    setRangePadding,
    setTasks,
    setVacations,
    setZoomSettings,
  });
  const {
    addVacation,
    createNewProject,
    deleteVacation,
    handleDelete,
    handleSave,
    moveTask,
    moveTaskToIndex,
    openModal,
    sortTasksByStart,
    updateFit,
    updatePadding,
    updateProjectName,
    updateTaskDates,
    updateTaskMemo,
    updateZoom,
  } = useEditorActions({
    alertAsync,
    confirmAsync,
    editingTask,
    formData,
    ganttViewMode,
    vacForm,
    setActiveEditorTab,
    setActiveMainTab,
    setEditingTask,
    setFilterText,
    setFitSettings,
    setFormData,
    setGanttViewMode,
    setIsModalOpen,
    setIsVacationPanelOpen,
    setProjectName,
    setPublicOrigin,
    setRangePadding,
    setTaskManagerResetToken,
    setTasks,
    setVacForm,
    setVacations,
    setZoomSettings,
    updateTasksWithRules,
  });

  const dependencyCycleIds = useMemo(() => findDependencyCycleIds(tasks), [tasks]);

  useEffect(() => {
    const v = getDisplayVersion();
    document.title = v ? `HL-Scheduler (Ver.${v})` : 'HL-Scheduler';
  }, []);

  const appRole = useMemo(() => getSchedulerAppRole(), []);
  const publicAppUrl = useMemo(() => getPublicAppUrl(), []);
  const adminAppUrl = useMemo(() => getAdminAppUrl(), []);
  const sharedScheduleId = useMemo(() => getSharedScheduleId(), []);
  const canEditSchedules = isAuthenticated && permissions.canEditSchedules;
  const canManageFolders = isAuthenticated && permissions.canManageFolders && isAdmin;
  const canManageUsers = isAuthenticated && permissions.canManageUsers && isAdmin;
  const canAccessEditor = canEditSchedules;
  const canWritePublicSchedules = canEditSchedules && isPublicSchedulesWriteEnabled();
  const employeeDirectory = useMemo(() => getEmployeeDirectory(), []);
  const authEmployeeProfile = useMemo(
    () => findEmployeeByEmail(authUser?.email, employeeDirectory),
    [authUser?.email, employeeDirectory],
  );

  const {
    exportProjectXlsx,
    imageExportModalProps,
    openImageExportModal,
    openReportModal,
    reportModalProps,
    saveProjectFile,
  } = useProjectExports({
    alertAsync,
    ganttViewMode,
    projectName,
    tasks,
    vacations,
    rangePadding,
    fitSettings,
    zoomSettings,
  });

  const {
    closePublicUploadModal,
    importFromPublicSchedule,
    openPublicUploadModal,
    publicRefreshToken,
    publicUploadModalProps,
  } = usePublicScheduleWorkflow({
    alertAsync,
    applyImportedData,
    canAccessEditor,
    canEditSchedules,
    canWritePublicSchedules,
    currentUserEmail: authUser?.email || '',
    currentUserProfile: authEmployeeProfile,
    fitSettings,
    isAuthenticated,
    navigateAfterPublish: () => setActiveMainTab('browse'),
    navigateToImportedSchedule: () => {
      setActiveMainTab('edit');
      setActiveEditorTab('schedule');
    },
    openAuthModal: () => setIsAuthModalOpen(true),
    projectName,
    publicOrigin,
    rangePadding,
    refreshSession,
    setPublicOrigin,
    sharedScheduleId,
    tasks,
    vacations,
    zoomSettings,
  });

  useEffect(() => {
    if (!canAccessEditor && activeMainTab === 'edit') {
      setActiveMainTab('browse');
    }
  }, [canAccessEditor, activeMainTab]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsAuthModalOpen(false);
  }, [isAuthenticated]);



  const openAuthModal = useCallback(() => {
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    if (isAuthSubmitting) return;
    setIsAuthModalOpen(false);
  }, [isAuthSubmitting]);

  const routeByUserRole = useCallback(
    (user) => {
      const nextRoute = resolvePostAuthNavigation({ user, appRole, adminAppUrl, publicAppUrl });
      if (nextRoute.action === 'redirect' && nextRoute.url) {
        window.location.href = nextRoute.url;
        return;
      }
      setActiveMainTab(nextRoute.activeMainTab || 'browse');
      setActiveEditorTab(nextRoute.activeEditorTab || 'tasks');
    },
    [appRole, adminAppUrl, publicAppUrl],
  );

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !authUser) return;
    routeByUserRole(authUser);
  }, [isAuthLoading, isAuthenticated, authUser, routeByUserRole]);

  const submitAuthLogin = useCallback(
    async ({ email, password }) => {
      setIsAuthSubmitting(true);
      try {
        const result = await signIn({ email, password });
        setIsAuthModalOpen(false);
        routeByUserRole(result?.user || null);
      } finally {
        setIsAuthSubmitting(false);
      }
    },
    [signIn, routeByUserRole],
  );

  const submitAuthRegister = useCallback(
    async ({ email, password }) => {
      setIsAuthSubmitting(true);
      try {
        const result = await signUp({ email, password });
        const status = String(result?.user?.status || '').trim().toLowerCase();
        if (status === 'approved') {
          const loginResult = await signIn({ email, password });
          setIsAuthModalOpen(false);
          routeByUserRole(loginResult?.user || null);
          await alertAsync('가입이 승인되어 바로 로그인되었습니다.');
          return;
        }
        setIsAuthModalOpen(false);
        await alertAsync('가입 신청이 접수되었으니 관리자 승인 후 로그인할 수 있습니다.');
      } finally {
        setIsAuthSubmitting(false);
      }
    },
    [signUp, signIn, alertAsync, routeByUserRole],
  );

  const submitAuthLogout = useCallback(async () => {
    setIsAuthSubmitting(true);
    try {
      await signOut();
      setIsAuthModalOpen(false);
      closePublicUploadModal();
      setActiveMainTab('browse');
      setActiveEditorTab('tasks');
    } finally {
      setIsAuthSubmitting(false);
    }
  }, [closePublicUploadModal, signOut]);

  const renderEditorContent = () => {
    return (
      <AppEditorContent
        activeEditorTab={activeEditorTab}
        taskManagerResetToken={taskManagerResetToken}
        tasks={tasks}
        openModal={openModal}
        handleDelete={handleDelete}
        moveTask={moveTask}
        moveTaskToIndex={moveTaskToIndex}
        sortTasksByStart={sortTasksByStart}
        projectName={projectName}
        updateProjectName={updateProjectName}
        openReportModal={openReportModal}
        exportProjectXlsx={exportProjectXlsx}
        updateTaskMemo={updateTaskMemo}
        canWritePublicSchedules={canWritePublicSchedules}
        openPublicUploadModal={openPublicUploadModal}
        createNewProject={createNewProject}
        filteredTasks={filteredTasks}
        vacations={vacations}
        updateTaskDates={updateTaskDates}
        vacForm={vacForm}
        setVacForm={setVacForm}
        addVacation={addVacation}
        deleteVacation={deleteVacation}
        isVacationPanelOpen={isVacationPanelOpen}
        setIsVacationPanelOpen={setIsVacationPanelOpen}
        filterText={filterText}
        setFilterText={setFilterText}
        ganttViewMode={ganttViewMode}
        setGanttViewMode={setGanttViewMode}
        rangePadding={rangePadding}
        updatePadding={updatePadding}
        fitSettings={fitSettings}
        updateFit={updateFit}
        zoomSettings={zoomSettings}
        updateZoom={updateZoom}
        openImageExportModal={openImageExportModal}
        isImageExportModalOpen={imageExportModalProps.isOpen}
        exportScope={imageExportModalProps.exportScope}
      />
    );
  };
  const isBrowseMode = activeMainTab === 'browse' || !canAccessEditor;

  const renderContent = () => {
    if (isBrowseMode) {
      return (
        <PublicSchedules
          refreshToken={publicRefreshToken}
          onImportSchedule={importFromPublicSchedule}
          onConfirm={confirmAsync}
          canManage={canManageFolders}
          canImport={canAccessEditor}
          sharedScheduleId={sharedScheduleId}
        />
      );
    }
    return renderEditorContent();
  };

  return (
    <div className="min-h-screen flex flex-col text-slate-800 selection:bg-blue-100 selection:text-blue-700">
      <AppHeader
        activeMainTab={activeMainTab}
        onMainTabChange={setActiveMainTab}
        activeEditorTab={activeEditorTab}
        onEditorTabChange={setActiveEditorTab}
        onSaveProject={saveProjectFile}
        onImportFile={handleFileImport}
        canAccessEditor={canAccessEditor}
        isAuthenticated={isAuthenticated}
        authEmail={authUser?.email || ''}
        authProfile={authEmployeeProfile}
        onOpenAuthModal={openAuthModal}
        onSignOut={submitAuthLogout}
        isAuthBusy={isAuthSubmitting || isAuthLoading}
      />

      <main className={`relative z-0 flex min-h-0 w-full flex-1 flex-col px-4 ${isBrowseMode ? 'pt-4 pb-5' : 'py-6'} sm:px-6 lg:px-8`}>
        {storageError && (
          <div
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            role="alert"
          >
            브라우저 저장소를 사용할 수 없어 새로고침 전에 변경사항이 사라질 수 있습니다.
          </div>
        )}
        {dependencyCycleIds.length > 0 && (
          <div
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="alert"
          >
            의존성 순환이 감지되었으니, 순환에 포함된 작업은 자동 일정 밀림 계산에서 제외됩니다.
          </div>
        )}
        {isAuthLoading && (
          <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800" role="status">
            로그인 상태를 확인하는 중입니다...
          </div>
        )}
        {canManageUsers && activeMainTab === 'edit' && <AdminUserManagement />}
        {renderContent()}
      </main>

      <TaskEditModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingTask={editingTask}
        formData={formData}
        setFormData={setFormData}
        onSave={handleSave}
        tasks={tasks}
        employeeDirectory={employeeDirectory}
      />

      <PublicUploadModal {...publicUploadModalProps} />

      <ReportModal {...reportModalProps} />

      <ImageExportModal {...imageExportModalProps} />

      <AuthModal
        isOpen={isAuthModalOpen}
        isSubmitting={isAuthSubmitting || isAuthLoading}
        onClose={closeAuthModal}
        onLogin={submitAuthLogin}
        onRegister={submitAuthRegister}
      />

      <AppConfirmDialog dialog={confirmDialog} onClose={closeConfirmDialog} />
    </div>
  );
}

export default App;



