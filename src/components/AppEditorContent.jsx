import Dashboard from './Dashboard';
import Help from './Help';
import RevisionHistory from './RevisionHistory';
import ScheduleView from './ScheduleView';
import TaskManagement from './TaskManagement';

export default function AppEditorContent({
  activeEditorTab,
  taskManagerResetToken,
  tasks,
  openModal,
  handleDelete,
  moveTask,
  moveTaskToIndex,
  sortTasksByStart,
  projectName,
  updateProjectName,
  openReportModal,
  exportProjectXlsx,
  updateTaskMemo,
  canWritePublicSchedules,
  openPublicUploadModal,
  createNewProject,
  filteredTasks,
  vacations,
  updateTaskDates,
  vacForm,
  setVacForm,
  addVacation,
  deleteVacation,
  isVacationPanelOpen,
  setIsVacationPanelOpen,
  filterText,
  setFilterText,
  ganttViewMode,
  setGanttViewMode,
  rangePadding,
  updatePadding,
  fitSettings,
  updateFit,
  zoomSettings,
  updateZoom,
  openImageExportModal,
  isImageExportModalOpen,
  exportScope,
}) {
  switch (activeEditorTab) {
    case 'tasks':
      return (
        <div className="animate-fade-in">
          <TaskManagement
            key={`task-manager-${taskManagerResetToken}`}
            tasks={tasks}
            openModal={openModal}
            handleDelete={handleDelete}
            moveTask={moveTask}
            moveTaskToIndex={moveTaskToIndex}
            sortTasksByStart={sortTasksByStart}
            projectName={projectName}
            setProjectName={updateProjectName}
            openReportModal={openReportModal}
            onExportXlsx={exportProjectXlsx}
            updateTaskMemo={updateTaskMemo}
            onUploadPublic={canWritePublicSchedules ? openPublicUploadModal : undefined}
            onCreateNewProject={createNewProject}
          />
        </div>
      );
    case 'schedule':
      return (
        <ScheduleView
          projectName={projectName}
          filteredTasks={filteredTasks}
          vacations={vacations}
          onTaskDateChange={updateTaskDates}
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
          isImageExportModalOpen={isImageExportModalOpen}
          exportScope={exportScope}
        />
      );
    case 'dashboard':
      return (
        <div className="animate-fade-in">
          <Dashboard tasks={tasks} projectName={projectName} />
        </div>
      );
    case 'help':
      return <Help />;
    case 'revisions':
      return <RevisionHistory />;
    default:
      return null;
  }
}
