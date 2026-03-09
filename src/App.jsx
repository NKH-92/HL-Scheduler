import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppHeader from './components/AppHeader';
import Dashboard from './components/Dashboard';
import Help from './components/Help';
import RevisionHistory from './components/RevisionHistory';
import PublicSchedules from './components/PublicSchedules';
import ScheduleView from './components/ScheduleView';
import TaskManagement from './components/TaskManagement';
import GanttChart from './components/GanttChart';
import Modal from './components/Modal';
import AdminUserManagement from './components/AdminUserManagement';
import AuthModal from './components/modals/AuthModal';
import ImageExportModal from './components/modals/ImageExportModal';
import PublicUploadModal from './components/modals/PublicUploadModal';
import ReportModal from './components/modals/ReportModal';
import TaskEditModal from './components/modals/TaskEditModal';
import { useAuth } from './context/AuthContext';
import { generateId, newTaskTemplate, normalizeTasks, normalizeVacations } from './utils/data';
import { applyDependencyScheduling, findDependencyCycleIds } from './utils/dependencies';
import { formatDate, toUtcMidnightMs } from './utils/dates';
import { useSchedulerStorage } from './hooks/useSchedulerStorage';
import {
  GANTT_EXPORT_LEFT_PANE_PX,
  REPORT_CHART_WIDTH_PX,
  REPORT_IMAGE_PIXEL_RATIO,
  REPORT_PAGE_WIDTH_PX,
} from './utils/ganttLayout';
import { mergeRangePadding, sanitizeFitSettings, sanitizeZoomSettings } from './utils/schedulerSettings';
import {
  PUBLIC_UNCATEGORIZED_FOLDER_ID,
  getAdminAppUrl,
  getSharedScheduleId,
  getPublicAppUrl,
  getSchedulerAppRole,
  getPublicSchedule,
  isPublicSchedulesEnabled,
  isPublicSchedulesWriteEnabled,
  listPublicFoldersTree,
  updatePublicSchedule,
  uploadPublicSchedule,
} from './utils/publicSchedulesApi';
import { findEmployeeByEmail, getEmployeeDirectory } from './utils/employeeDirectory';
import { resolvePostAuthNavigation } from './utils/authRedirect';
import { resolveImportedProjectName, stripUtf8Bom } from './utils/imports';
import { normalizePublicScheduleStatus } from './utils/publicScheduleStatus';
import {
  escapeHtml,
  sanitizeFileName,
  isPlainObject,
  getDisplayVersion,
  buildFolderSelectOptions as buildFolderSelectOptionsBase,
  limitArray,
} from './utils/shared';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_TASKS = 5000;
const MAX_IMPORT_VACATIONS = 2000;
const MAX_PUBLIC_UPLOAD_TEXT_LENGTH = 1024 * 1024;
const UTF8_ENCODER = new TextEncoder();
const getUtf8ByteLength = (value) => UTF8_ENCODER.encode(String(value ?? '')).length;

const buildFolderSelectOptions = (rows) => buildFolderSelectOptionsBase(rows, PUBLIC_UNCATEGORIZED_FOLDER_ID);
let imageExportLibsPromise = null;

const loadImageExportLibs = async () => {
  if (!imageExportLibsPromise) {
    imageExportLibsPromise = Promise.all([import('html-to-image'), import('html2canvas')])
      .then(([htmlToImageModule, html2canvasModule]) => {
        const html2canvasFn = html2canvasModule?.default ?? html2canvasModule;
        const libs = {
          getFontEmbedCSS: htmlToImageModule?.getFontEmbedCSS,
          toJpeg: htmlToImageModule?.toJpeg,
          toPng: htmlToImageModule?.toPng,
          html2canvas: html2canvasFn,
        };
        if (
          typeof libs.getFontEmbedCSS !== 'function' ||
          typeof libs.toJpeg !== 'function' ||
          typeof libs.toPng !== 'function' ||
          typeof libs.html2canvas !== 'function'
        ) {
          throw new Error('Image export dependencies are unavailable.');
        }
        return libs;
      })
      .catch((error) => {
        imageExportLibsPromise = null;
        throw error;
      });
  }
  return imageExportLibsPromise;
};

// isPlainObject is now imported from shared.js

// buildFolderSelectOptions and limitArray are now imported from shared.js

const buildImportLimitNotice = (taskCount, vacationCount) => {
  if (!taskCount && !vacationCount) return '';
  const parts = [];
  if (taskCount) parts.push(`작업 ${taskCount}개`);
  if (vacationCount) parts.push(`휴가 ${vacationCount}개`);
  return `\n\n(가져오기 최대치: ${parts.join(', ')})`;
};

const countInvalidRanges = (items, getStart, getEnd) => {
  if (!Array.isArray(items)) return 0;
  let count = 0;
  items.forEach((item) => {
    const start = getStart(item);
    if (!start) return;
    const end = getEnd(item) || start;
    const startMs = toUtcMidnightMs(start);
    const endMs = toUtcMidnightMs(end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) count += 1;
  });
  return count;
};

const buildInvalidRangeNotice = (taskCount, vacationCount) => {
  if (!taskCount && !vacationCount) return '';
  const parts = [];
  if (taskCount) parts.push(`작업 ${taskCount}개`);
  if (vacationCount) parts.push(`휴가 ${vacationCount}개`);
  return `\n\n종료일이 시작일보다 빠른 데이터(${parts.join(', ')})를 자동으로 보정했습니다.`;
};

// getDisplayVersion is now imported from shared.js

function App() {
  const [activeMainTab, setActiveMainTab] = useState('edit');
  const [activeEditorTab, setActiveEditorTab] = useState('tasks');
  const confirmResolverRef = useRef(null);
  const [confirmDialog, setConfirmDialog] = useState(() => ({
    isOpen: false,
    mode: 'confirm',
    title: '확인',
    message: '',
    confirmText: '확인',
    cancelText: '취소',
  }));

  const closeConfirmDialog = useCallback((value) => {
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
    resolve?.(!!value);
  }, []);

  const confirmAsync = useCallback((message, options = {}) => {
    if (confirmResolverRef.current) {
      try {
        confirmResolverRef.current(false);
      } catch {
        // ignore
      }
      confirmResolverRef.current = null;
    }

    const title = String(options.title || '확인');
    const confirmText = String(options.confirmText || '확인');
    const cancelText = String(options.cancelText || '취소');
    const safeMessage = String(message ?? '');

    setConfirmDialog({ isOpen: true, mode: 'confirm', title, message: safeMessage, confirmText, cancelText });
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
    });
  }, []);

  const alertAsync = useCallback((message, options = {}) => {
    if (confirmResolverRef.current) {
      try {
        confirmResolverRef.current(false);
      } catch {
        // ignore
      }
      confirmResolverRef.current = null;
    }

    const title = String(options.title || '알림');
    const confirmText = String(options.confirmText || '확인');
    const safeMessage = String(message ?? '');

    setConfirmDialog({ isOpen: true, mode: 'alert', title, message: safeMessage, confirmText, cancelText: '' });
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
    });
  }, []);

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
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTasks, setReportTasks] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [ganttViewMode, setGanttViewMode] = useState('Day');
  const [filterText, setFilterText] = useState('');
  const [isVacationPanelOpen, setIsVacationPanelOpen] = useState(true);
  const [vacForm, setVacForm] = useState(() => {
    const today = formatDate(new Date());
    return { title: '', start: today, end: today };
  });
  const [formData, setFormData] = useState(newTaskTemplate());
  const [reportGanttMode, setReportGanttMode] = useState('Week');
  const [isGenerating, setIsGenerating] = useState(false);

  const [isImageExportModalOpen, setIsImageExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('png');
  const [exportScope, setExportScope] = useState('full');
  const [exportScale, setExportScale] = useState(3);
  const [exportFileName, setExportFileName] = useState('');
  const [exportJpegQuality, setExportJpegQuality] = useState(0.92);
  const [exportShowToday, setExportShowToday] = useState(true);
  const [publicOrigin, setPublicOrigin] = useState(null);
  const [publicFolderOptions, setPublicFolderOptions] = useState(() =>
    buildFolderSelectOptions([]),
  );
  const [isLoadingPublicFolders, setIsLoadingPublicFolders] = useState(false);
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

  const dependencyCycleIds = useMemo(() => findDependencyCycleIds(tasks), [tasks]);

  const reportSourceTasks = reportTasks ?? tasks;

  useEffect(() => {
    const v = getDisplayVersion();
    document.title = v ? `HL-Scheduler (Ver.${v})` : 'HL-Scheduler';
  }, []);

  const appRole = useMemo(() => getSchedulerAppRole(), []);
  const publicAppUrl = useMemo(() => getPublicAppUrl(), []);
  const adminAppUrl = useMemo(() => getAdminAppUrl(), []);
  const sharedScheduleId = useMemo(() => getSharedScheduleId(), []);
  const isSharedScheduleLocked = !!sharedScheduleId;
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

  useEffect(() => {
    if (!canAccessEditor && activeMainTab === 'edit') {
      setActiveMainTab('browse');
    }
  }, [canAccessEditor, activeMainTab]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsAuthModalOpen(false);
  }, [isAuthenticated]);



  const openReportModal = useCallback(() => {
    setReportTasks(tasks);
    setIsReportModalOpen(true);
  }, [tasks]);

  const closeReportModal = useCallback(() => {
    setIsReportModalOpen(false);
    setReportTasks(null);
  }, []);

  const openModal = (task = null) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        category: task.category || '',
        taskName: task.taskName || '',
        department: task.department || '',
        assignee: task.assignee || '',
        assigneeEmail: task.assigneeEmail || '',
        assigneePosition: task.assigneePosition || '',
        start: task.start || '',
        end: task.end || task.start || '',
        progress: Number(task.progress || 0),
        memo: task.memo || '',
        dependencies: Array.isArray(task.dependencies) ? task.dependencies.map((depId) => String(depId)) : [],
      });
    } else {
      setEditingTask(null);
      setFormData(newTaskTemplate());
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!String(formData.category || '').trim() || !String(formData.taskName || '').trim()) {
      void alertAsync('구분과 작업명은 필수입니다.');
      return;
    }

    const startMs = toUtcMidnightMs(formData.start);
    const endMs = toUtcMidnightMs(formData.end || formData.start);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      void alertAsync('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }

    const rawProgress = Number(formData.progress);
    const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;
    const dependencies = Array.isArray(formData.dependencies)
      ? Array.from(
        new Set(
          formData.dependencies
            .map((depId) => String(depId ?? '').trim())
            .filter((depId) => depId && (!editingTask || depId !== String(editingTask.id))),
        ),
      )
      : [];

    const payload = {
      ...formData,
      progress,
      end: formData.end || formData.start || '',
      assigneeEmail: String(formData.assigneeEmail || '').trim().toLowerCase(),
      assigneePosition: String(formData.assigneePosition || '').trim(),
      memo: String(formData.memo ?? ''),
      dependencies,
    };

    if (editingTask) {
      updateTasksWithRules(
        (prev) => prev.map((t) => (t.id === editingTask.id ? { ...payload, id: t.id } : t)),
        '작업 수정',
      );
    } else {
      updateTasksWithRules((prev) => [...prev, { ...payload, id: generateId() }], '작업 추가');
    }

    setIsModalOpen(false);
  };

  const handleDelete = async (id) => {
    const confirmed = await confirmAsync('삭제하시겠습니까?', {
      title: '삭제 확인',
      confirmText: '삭제',
      cancelText: '취소',
    });
    if (!confirmed) return;
    const deletedId = String(id);
    updateTasksWithRules(
      (prev) =>
        prev
          .filter((t) => String(t.id) !== deletedId)
          .map((t) => ({
            ...t,
            dependencies: Array.isArray(t.dependencies)
              ? t.dependencies.map((depId) => String(depId)).filter((depId) => depId !== deletedId)
              : [],
          })),
      '작업 삭제',
    );
  };

  const moveTask = (id, direction) => {
    updateTasksWithRules((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const nextIdx = Math.min(prev.length - 1, Math.max(0, idx + direction));
      if (nextIdx === idx) return prev;
      const arr = [...prev];
      const [item] = arr.splice(idx, 1);
      arr.splice(nextIdx, 0, item);
      return arr;
    }, '작업 순서 변경');
  };

  const moveTaskToIndex = (id, toIndex) => {
    updateTasksWithRules((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const nextIdx = Math.min(prev.length - 1, Math.max(0, Number(toIndex) - 1));
      if (nextIdx === idx) return prev;
      const arr = [...prev];
      const [item] = arr.splice(idx, 1);
      arr.splice(nextIdx, 0, item);
      return arr;
    }, '작업 순서 변경');
  };

  const sortTasksByStart = (direction = 'asc') => {
    updateTasksWithRules((prev) => {
      const parse = (d) => {
        if (!d) return null;
        const ms = toUtcMidnightMs(d);
        return Number.isFinite(ms) ? ms : null;
      };

      return [...prev].sort((a, b) => {
        const ta = parse(a.start);
        const tb = parse(b.start);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return direction === 'desc' ? tb - ta : ta - tb;
      });
    }, '시작일 정렬');
  };

  const updateTaskDates = (taskId, start, end) => {
    const nextStart = String(start || '').trim();
    if (!nextStart) return;
    const nextEnd = String(end || '').trim() || nextStart;

    updateTasksWithRules(
      (prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          if (t.start === nextStart && (t.end || t.start) === nextEnd) return t;
          return { ...t, start: nextStart, end: nextEnd };
        }),
      '간트 일정 이동',
    );
  };

  const updateTaskMemo = (taskId, memo) => {
    const nextMemo = String(memo ?? '');
    setTasks((prev) => {
      let changed = false;
      const nextTasks = prev.map((t) => {
        if (t.id !== taskId) return t;
        if (String(t.memo ?? '') === nextMemo) return t;
        changed = true;
        return { ...t, memo: nextMemo };
      });
      return changed ? nextTasks : prev;
    });
  };

  const addVacation = () => {
    if (!vacForm.start) {
      void alertAsync('휴가 시작일이 누락되었습니다.');
      return;
    }

    const start = vacForm.start;
    const end = vacForm.end || start;
    const startMs = toUtcMidnightMs(start);
    const endMs = toUtcMidnightMs(end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      void alertAsync('종료일이 시작일보다 빠릅니다.');
      return;
    }

    const payload = {
      id: generateId(),
      title: (vacForm.title || '휴가').trim() || '휴가',
      start,
      end,
    };
    setVacations((prev) => [...prev, payload]);
    const today = formatDate(new Date());
    setVacForm({ title: '', start: today, end: today });
  };

  const deleteVacation = async (id) => {
    const confirmed = await confirmAsync('휴가 일정을 삭제하시겠습니까?', {
      title: '삭제 확인',
      confirmText: '삭제',
      cancelText: '취소',
    });
    if (!confirmed) return;
    setVacations((prev) => prev.filter((v) => v.id !== id));
  };

  const updatePadding = (key, value) => {
    const v = Math.max(0, Number(value || 0));
    setRangePadding((prev) => ({ ...prev, [ganttViewMode]: { ...(prev[ganttViewMode] || {}), [key]: v } }));
  };

  const updateFit = (enabled) => {
    setFitSettings((prev) => {
      const current = prev[ganttViewMode] || { enabled: false };
      return { ...prev, [ganttViewMode]: { ...current, enabled: !!enabled } };
    });
  };

  const updateZoom = (value) => {
    const next = Math.round(Number(value));
    if (!Number.isFinite(next)) return;
    const clamped = Math.max(25, Math.min(300, next));
    setZoomSettings((prev) => ({ ...prev, [ganttViewMode]: clamped }));
  };

  const updateProjectName = useCallback(
    (nextName) => {
      setProjectName(nextName);
    },
    [setProjectName],
  );

  const resetProjectState = useCallback(() => {
    const today = formatDate(new Date());
    setTasks([]);
    setProjectName('');
    setVacations([]);
    setRangePadding(mergeRangePadding(null));
    setFitSettings(sanitizeFitSettings(null));
    setZoomSettings(sanitizeZoomSettings(null));
    setPublicOrigin(null);
    setFilterText('');
    setGanttViewMode('Day');
    setIsVacationPanelOpen(true);
    setVacForm({ title: '', start: today, end: today });
    setIsModalOpen(false);
    setEditingTask(null);
    setActiveMainTab('edit');
    setActiveEditorTab('tasks');
    setTaskManagerResetToken((value) => value + 1);
  }, [setTasks, setProjectName, setVacations, setRangePadding, setFitSettings, setZoomSettings, setPublicOrigin]);

  const createNewProject = useCallback(async () => {
    const confirmed = await confirmAsync(
      '새 프로젝트를 만들면 현재 작업/휴가/보기 설정이 초기화됩니다.\n계속할까요?',
      { title: '새 프로젝트 만들기', confirmText: '초기화', cancelText: '취소' },
    );
    if (!confirmed) return;

    resetProjectState();
  }, [
    confirmAsync,
    resetProjectState,
  ]);


  const openImageExportModal = () => {
    setExportFileName('');
    setExportScope('full');
    setExportFormat('png');
    setExportScale(3);
    setExportJpegQuality(0.92);
    setExportShowToday(true);
    setIsImageExportModalOpen(true);
  };

  const exportGanttImage = async () => {
    try {
      const targetId = exportScope === 'visible' ? 'gantt-main' : 'gantt-image-export-target';
      const el = document.getElementById(targetId);
      if (!el) throw new Error('Export target not found');
      const { getFontEmbedCSS, toJpeg, toPng, html2canvas } = await loadImageExportLibs();

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const isFullExport = exportScope !== 'visible';
      const baseWidth = isFullExport ? el.scrollWidth : el.clientWidth;
      const baseHeight = isFullExport ? el.scrollHeight : el.clientHeight;
      let pixelRatio = Number(exportScale || 3);
      if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) pixelRatio = 1;
      pixelRatio = Math.min(4, pixelRatio);

      const maxCanvasSize = 16384;
      const maxBaseDim = Math.max(baseWidth, baseHeight);
      if (Number.isFinite(maxBaseDim) && maxBaseDim > 0) {
        const maxAllowedRatio = maxCanvasSize / maxBaseDim;
        if (Number.isFinite(maxAllowedRatio) && maxAllowedRatio > 0 && maxAllowedRatio < pixelRatio) {
          console.warn('Export size too large; reducing pixelRatio', { from: pixelRatio, to: maxAllowedRatio });
          pixelRatio = maxAllowedRatio;
        }
      }
      const ext = exportFormat === 'jpg' ? 'jpg' : 'png';
      const parsedQuality = Number(exportJpegQuality);
      const quality =
        exportFormat === 'jpg'
          ? Math.max(0.5, Math.min(1, Number.isFinite(parsedQuality) ? parsedQuality : 0.92))
          : 1;

      const filter = (node) => {
        if (exportShowToday) return true;
        return !(node instanceof HTMLElement) || node.dataset?.ganttToday !== 'true';
      };

      let dataUrl;
      let fontEmbedCSS;
      try {
        fontEmbedCSS = await getFontEmbedCSS(el, { cacheBust: true });
      } catch (error) {
        console.warn('Failed to embed fonts for export; falling back to system fonts', error);
        fontEmbedCSS = undefined;
      }

      const captureWithHtmlToImage = async () => {
        const baseOptions = { backgroundColor: '#ffffff', pixelRatio, cacheBust: true, filter, fontEmbedCSS };
        const options = isFullExport
          ? { ...baseOptions, width: el.scrollWidth, height: el.scrollHeight }
          : { ...baseOptions, width: el.clientWidth, height: el.clientHeight };
        return exportFormat === 'jpg' ? toJpeg(el, { ...options, quality }) : toPng(el, options);
      };

      const captureWithHtml2Canvas = async () => {
        const baseOptions = {
          scale: pixelRatio,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: isFullExport ? el.scrollWidth : el.clientWidth,
          height: isFullExport ? el.scrollHeight : el.clientHeight,
          windowWidth: isFullExport ? el.scrollWidth : el.clientWidth,
          windowHeight: isFullExport ? el.scrollHeight : el.clientHeight,
          ignoreElements: (element) => !exportShowToday && element?.dataset?.ganttToday === 'true',
          onclone: (clonedDoc) => {
            const style = clonedDoc.createElement('style');
            style.textContent = `
              * { animation: none !important; transition: none !important; }
            `;
            clonedDoc.head.appendChild(style);

            if (!isFullExport) return;
            const clonedTarget = clonedDoc.getElementById(targetId);
            if (!clonedTarget) return;
            const wrapper = clonedTarget.parentElement;
            if (!wrapper) return;
            wrapper.style.position = 'absolute';
            wrapper.style.left = '0px';
            wrapper.style.top = '0px';
          },
        };

        const options = isFullExport ? { ...baseOptions, scrollX: 0, scrollY: 0 } : baseOptions;
        const canvas = await html2canvas(el, options);
        const mime = exportFormat === 'jpg' ? 'image/jpeg' : 'image/png';
        return canvas.toDataURL(mime, quality);
      };

      try {
        dataUrl = await captureWithHtmlToImage();
      } catch (primaryError) {
        console.warn('html-to-image export failed; falling back to html2canvas', primaryError);
        dataUrl = await captureWithHtml2Canvas();
      }

      const baseNameRaw =
        exportFileName || `${projectName || '프로젝트'}_간트_${ganttViewMode}_${formatDate(new Date())}`;
      const baseName = sanitizeFileName(baseNameRaw, 'gantt');
      const downloadName = `${baseName}.${ext}`;

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsImageExportModalOpen(false);
    } catch (error) {
      console.error(error);
      void alertAsync('이미지 내보내기에 실패했습니다.');
    }
  };

  const generateWordReport = async () => {
    setIsGenerating(true);
    try {
      const targetId = 'gantt-report-export-target';
      const ganttElement = document.getElementById(targetId);
      if (!ganttElement) throw new Error('Chart not found');
      const { getFontEmbedCSS, toPng, html2canvas } = await loadImageExportLibs();

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const reportMaxWidthPx = REPORT_PAGE_WIDTH_PX;
      const isFullExport = true;
      const baseWidth = ganttElement.scrollWidth || 0;
      const baseHeight = ganttElement.scrollHeight || 0;
      const safeWidth = Math.max(1, baseWidth);
      const safeHeight = Math.max(1, baseHeight);

      const maxCanvasSize = 16384;
      const maxBaseDim = Math.max(safeWidth, safeHeight);
      let pixelRatio = REPORT_IMAGE_PIXEL_RATIO;
      if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) pixelRatio = 1;
      pixelRatio = Math.min(4, pixelRatio);
      if (Number.isFinite(maxBaseDim) && maxBaseDim > 0 && maxBaseDim * pixelRatio > maxCanvasSize) {
        const nextRatio = maxCanvasSize / maxBaseDim;
        if (Number.isFinite(nextRatio) && nextRatio > 0 && nextRatio < pixelRatio) {
          console.warn('Report chart too large; reducing pixelRatio', { from: pixelRatio, to: nextRatio });
          pixelRatio = nextRatio;
        }
      }

      const showToday = true;
      const filter = (node) => {
        if (showToday) return true;
        return !(node instanceof HTMLElement) || node.dataset?.ganttToday !== 'true';
      };

      let imgData;
      let fontEmbedCSS;
      try {
        fontEmbedCSS = await getFontEmbedCSS(ganttElement, { cacheBust: true });
      } catch (error) {
        console.warn('리포트 폰트 임베드 실패, 시스템 폰트로 대체합니다.', error);
        fontEmbedCSS = undefined;
      }

      const captureWithHtmlToImage = async () => {
        const baseOptions = { backgroundColor: '#ffffff', pixelRatio, cacheBust: true, filter, fontEmbedCSS };
        const options = { ...baseOptions, width: safeWidth, height: safeHeight };
        return toPng(ganttElement, options);
      };

      const captureWithHtml2Canvas = async () => {
        const baseOptions = {
          scale: pixelRatio,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: safeWidth,
          height: safeHeight,
          windowWidth: safeWidth,
          windowHeight: safeHeight,
          ignoreElements: (element) => !showToday && element?.dataset?.ganttToday === 'true',
          onclone: (clonedDoc) => {
            const style = clonedDoc.createElement('style');
            style.textContent = `
              * { animation: none !important; transition: none !important; }
            `;
            clonedDoc.head.appendChild(style);

            if (!isFullExport) return;
            const clonedTarget = clonedDoc.getElementById(targetId);
            if (!clonedTarget) return;
            const wrapper = clonedTarget.parentElement;
            if (!wrapper) return;
            wrapper.style.position = 'absolute';
            wrapper.style.left = '0px';
            wrapper.style.top = '0px';
          },
        };

        const options = isFullExport ? { ...baseOptions, scrollX: 0, scrollY: 0 } : baseOptions;
        const canvas = await html2canvas(ganttElement, options);
        return canvas.toDataURL('image/png');
      };

      try {
        imgData = await captureWithHtmlToImage();
      } catch (primaryError) {
        console.warn('html-to-image report capture failed; falling back to html2canvas', primaryError);
        imgData = await captureWithHtml2Canvas();
      }

      const reportImageWidthPx = Math.min(reportMaxWidthPx, safeWidth);
      const reportImageHeightPx = Math.max(1, Math.round((reportImageWidthPx / safeWidth) * safeHeight));
      const totalProgress = Math.round(
        reportSourceTasks.reduce((acc, curr) => acc + curr.progress, 0) / (reportSourceTasks.length || 1),
      );
      const completed = reportSourceTasks.filter((t) => t.progress === 100).length;
      const reportTitle = escapeHtml(projectName) || '제목 없는 프로젝트';

      const reportHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8" />
          <title>${reportTitle} 보고서</title>
          <style>
            body{font-family:'Malgun Gothic',sans-serif}
            h1{font-size:24pt;color:#1e3a8a;text-align:center;margin-bottom:20px}
            h2{font-size:16pt;color:#334155;border-bottom:2px solid #334155;padding-bottom:5px;margin-top:30px}
            table{border-collapse:collapse;width:100%;margin-top:10px;font-size:10pt}
            th,td{border:1px solid #64748b;padding:8px;text-align:center}
            th{background-color:#f1f5f9;font-weight:bold}
            .summary-box{border:1px solid #cbd5e1;padding:15px;background-color:#f8fafc;margin-bottom:20px}
            .stat{font-size:11pt;margin-bottom:5px}
            .img-container{text-align:center;margin-top:20px}
            img{max-width:100%;height:auto;border:1px solid #cbd5e1}
            @page Section1{size:8.27in 11.69in;margin:0.7in;mso-page-orientation:portrait}
            @page Section2{size:11.69in 8.27in;margin:0.6in;mso-page-orientation:landscape}
            div.Section1{page:Section1}
            div.Section2{page:Section2}
          </style>
        </head>
        <body>
          <div class="Section1">
          <h1>${reportTitle} 진행 보고서</h1>
          <h2>1. 프로젝트 요약</h2>
          <div class="summary-box">
            <p class="stat"><strong>작성일:</strong> ${formatDate(new Date())}</p>
            <p class="stat"><strong>전체 진척률:</strong> ${totalProgress}%</p>
            <p class="stat"><strong>총 작업:</strong> ${reportSourceTasks.length}개 (완료: ${completed}개)</p>
          </div>
          <h2>2. 작업 상세</h2>
          <table>
            <thead>
              <tr>
                <th>구분</th>
                <th>작업명</th>
                <th>부서</th>
                <th>담당자</th>
                <th>기간</th>
                <th>선행작업</th>
                <th>진척률</th>
              </tr>
            </thead>
            <tbody>
              ${reportSourceTasks
          .map((t) => {
            const category = escapeHtml(t.category);
            const taskName = escapeHtml(t.taskName);
            const department = escapeHtml(t.department);
            const assignee = escapeHtml(t.assignee || '-');
            const start = escapeHtml(t.start || '-');
            const end = escapeHtml(t.end || t.start || '-');
            const dependencies = escapeHtml(
              Array.isArray(t.dependencies) ? t.dependencies.map((depId) => String(depId)).join(', ') : '-',
            );
            const progress = escapeHtml(`${t.progress}%`);
            return `<tr><td>${category}</td><td>${taskName}</td><td>${department}</td><td>${assignee}</td><td>${start} ~ ${end}</td><td>${dependencies}</td><td>${progress}</td></tr>`;
          })
          .join('')}
            </tbody>
          </table>
          </div>
          <br clear="all" style="page-break-before:always;mso-break-type:section-break;">
          <div class="Section2">
          <h2>3. 일정 타임라인 (간트 - ${escapeHtml(reportGanttMode)} 보기)</h2>
          <div class="img-container" style="width:${reportImageWidthPx}px;margin:0 auto;">
            <img
              src="${imgData}"
              width="${reportImageWidthPx}"
              height="${reportImageHeightPx}"
              style="width:${reportImageWidthPx}px;height:${reportImageHeightPx}px;"
            />
          </div>
          <br /><br />
          </div>
        </body>
        </html>`;

      const blob = new Blob(['\ufeff', reportHtml], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizeFileName(projectName, '프로젝트')}_보고서_${formatDate(new Date())}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      closeReportModal();
    } catch (error) {
      console.error(error);
      void alertAsync('보고서 생성에 실패했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const exportProjectXlsx = async (taskList = tasks) => {
    try {
      const xlsxModule = await import('xlsx');
      const XLSX = xlsxModule.default ?? xlsxModule;
      if (!XLSX?.utils?.book_new) throw new Error('xlsx module not available');

      const safeTasks = Array.isArray(taskList) ? taskList : tasks;

      const toDurationDays = (start, end) => {
        const s = toUtcMidnightMs(start);
        const e = toUtcMidnightMs(end || start);
        if (!Number.isFinite(s) || !Number.isFinite(e)) return '';
        return Math.max(1, Math.round((e - s) / 86400000) + 1);
      };

      const wb = XLSX.utils.book_new();
      const today = formatDate(new Date());
      const safeProjectName = projectName || '프로젝트';

      const tasksSheet = XLSX.utils.aoa_to_sheet([
        [
          '구분',
          '작업명',
          '부서',
          '담당자',
          '시작일',
          '종료일',
          '기간(일)',
          '진척률(%)',
          '선행작업',
          '메모',
        ],
        ...safeTasks.map((t) => [
          t.category || '',
          t.taskName || '',
          t.department || '',
          t.assignee || '',
          t.start || '',
          t.end || t.start || '',
          toDurationDays(t.start, t.end),
          Number.isFinite(Number(t.progress)) ? Number(t.progress) : 0,
          Array.isArray(t.dependencies) ? t.dependencies.map((depId) => String(depId)).join(', ') : '',
          String(t.memo ?? ''),
        ]),
      ]);

      tasksSheet['!cols'] = [
        { wch: 14 },
        { wch: 28 },
        { wch: 16 },
        { wch: 14 },
        { wch: 12 },
        { wch: 12 },
        { wch: 14 },
        { wch: 12 },
        { wch: 24 },
        { wch: 40 },
      ];

      XLSX.utils.book_append_sheet(wb, tasksSheet, '작업목록');

      const vacationsSheet = XLSX.utils.aoa_to_sheet([
        ['휴가명', '시작일', '종료일'],
        ...vacations.map((v) => [v.title || '', v.start || '', v.end || v.start || '']),
      ]);

      vacationsSheet['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, vacationsSheet, '휴가일정');

      const completed = safeTasks.filter((t) => t.progress === 100).length;
      const totalProgress =
        safeTasks.length === 0
          ? 0
          : Math.round(safeTasks.reduce((acc, curr) => acc + curr.progress, 0) / safeTasks.length);

      const summarySheet = XLSX.utils.aoa_to_sheet([
        ['프로젝트명', safeProjectName],
        ['내보낸 날짜', today],
        ['총 작업 수', safeTasks.length],
        ['완료 작업 수', completed],
        ['전체 진척률(%)', totalProgress],
        ['휴가 건수', vacations.length],
      ]);
      summarySheet['!cols'] = [{ wch: 18 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, summarySheet, '요약');

      const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizeFileName(safeProjectName, 'HL-Scheduler')}_내보내기_${today}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      void alertAsync('엑셀(XLSX) 내보내기에 실패했습니다.');
    }
  };

  const saveProjectFile = () => {
    const data = { name: projectName, tasks, vacations, rangePadding, fitSettings, zoomSettings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const node = document.createElement('a');
    node.href = url;
    node.download = `${sanitizeFileName(projectName, 'HL-Scheduler')}_백업_${formatDate(new Date())}.json`;
    document.body.appendChild(node);
    node.click();
    document.body.removeChild(node);
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      void alertAsync('파일 크기가 너무 큽니다. 최대 10MB까지 가능합니다.');
      e.target.value = null;
      return;
    }
    if (file.name && !file.name.toLowerCase().endsWith('.json')) {
      void alertAsync('JSON 파일만 가져올 수 있습니다.');
      e.target.value = null;
      return;
    }
    const fileReader = new FileReader();
    fileReader.onerror = () => {
      void alertAsync('파일을 읽지 못했습니다.');
    };
    fileReader.readAsText(file, 'UTF-8');
    fileReader.onload = async (evt) => {
      try {
        const text = stripUtf8Bom(typeof evt.target?.result === 'string' ? evt.target.result : '');
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          const tasksRaw = limitArray(parsed, MAX_IMPORT_TASKS);
          const limitNotice = buildImportLimitNotice(
            Array.isArray(parsed) && parsed.length > MAX_IMPORT_TASKS ? MAX_IMPORT_TASKS : 0,
            0,
          );
          const invalidTasks = countInvalidRanges(
            tasksRaw,
            (t) => t?.start || t?.actStart || t?.planStart || '',
            (t) => t?.end || t?.actEnd || t?.planEnd || '',
          );
          const invalidNotice = buildInvalidRangeNotice(invalidTasks, 0) + limitNotice;
          const confirmed = await confirmAsync(`작업 배열 데이터를 가져와 현재 프로젝트를 덮어쓸까요?${invalidNotice}`, {
            title: '가져오기 확인',
            confirmText: '가져오기',
            cancelText: '취소',
          });
          if (confirmed) {
            setTasks(applyTaskRules(tasksRaw));
            setProjectName('');
            setVacations([]);
            setRangePadding(mergeRangePadding(null));
            setFitSettings(sanitizeFitSettings(null));
            setZoomSettings(sanitizeZoomSettings(null));
            setPublicOrigin(null);
          }
        } else if (isPlainObject(parsed) && (Array.isArray(parsed.tasks) || Array.isArray(parsed.vacations))) {
          const tasksRaw = limitArray(parsed.tasks || [], MAX_IMPORT_TASKS);
          const vacationsRaw = limitArray(parsed.vacations || [], MAX_IMPORT_VACATIONS);
          const limitNotice = buildImportLimitNotice(
            Array.isArray(parsed.tasks) && parsed.tasks.length > MAX_IMPORT_TASKS ? MAX_IMPORT_TASKS : 0,
            Array.isArray(parsed.vacations) && parsed.vacations.length > MAX_IMPORT_VACATIONS
              ? MAX_IMPORT_VACATIONS
              : 0,
          );
          const invalidTasks = countInvalidRanges(
            tasksRaw,
            (t) => t?.start || t?.actStart || t?.planStart || '',
            (t) => t?.end || t?.actEnd || t?.planEnd || '',
          );
          const invalidVacations = countInvalidRanges(
            vacationsRaw,
            (v) => v?.start || v?.startDate || '',
            (v) => v?.end || v?.endDate || v?.start || v?.startDate || '',
          );
          const invalidNotice = buildInvalidRangeNotice(invalidTasks, invalidVacations) + limitNotice;
          const confirmed = await confirmAsync(`'${parsed.name || '프로젝트'}' 프로젝트를 가져올까요?${invalidNotice}`, {
            title: '가져오기 확인',
            confirmText: '가져오기',
            cancelText: '취소',
          });
          if (confirmed) {
            setTasks(applyTaskRules(tasksRaw));
            setProjectName(typeof parsed.name === 'string' ? parsed.name : '');
            setVacations(normalizeVacations(vacationsRaw));
            setRangePadding(mergeRangePadding(parsed.rangePadding));
            setFitSettings(sanitizeFitSettings(parsed.fitSettings));
            setZoomSettings(sanitizeZoomSettings(parsed.zoomSettings));
            setPublicOrigin(null);
          }
        } else {
          void alertAsync('지원하지 않는 파일 형식입니다.');
        }
      } catch {
        void alertAsync('파일이 손상되었거나 JSON 형식이 올바르지 않습니다.');
      }
    };
    e.target.value = null;
  };

  const applyImportedData = useCallback(
    async (parsed, { sourceName } = {}, { skipConfirm = false } = {}) => {
      if (Array.isArray(parsed)) {
        const tasksRaw = limitArray(parsed, MAX_IMPORT_TASKS);
        const limitNotice = buildImportLimitNotice(
          Array.isArray(parsed) && parsed.length > MAX_IMPORT_TASKS ? MAX_IMPORT_TASKS : 0,
          0,
        );
        const invalidTasks = countInvalidRanges(
          tasksRaw,
          (t) => t?.start || t?.actStart || t?.planStart || '',
          (t) => t?.end || t?.actEnd || t?.planEnd || '',
        );
        const invalidNotice = buildInvalidRangeNotice(invalidTasks, 0) + limitNotice;
        const title = sourceName ? `'${sourceName}'` : '선택한 일정';
        const confirmed = skipConfirm
          ? true
          : await confirmAsync(`${title}을(를) 가져올까요?${invalidNotice}\n\n현재 일정 데이터는 덮어쓰기 됩니다.`, {
            title: '가져오기 확인',
            confirmText: '가져오기',
            cancelText: '취소',
          });
        if (confirmed) {
          setTasks(applyTaskRules(tasksRaw));
          setProjectName(resolveImportedProjectName({ sourceName }));
          setVacations([]);
          setRangePadding(mergeRangePadding(null));
          setFitSettings(sanitizeFitSettings(null));
          setZoomSettings(sanitizeZoomSettings(null));
          return true;
        }
        return false;
      }

      if (isPlainObject(parsed) && (Array.isArray(parsed.tasks) || Array.isArray(parsed.vacations))) {
        const tasksRaw = limitArray(parsed.tasks || [], MAX_IMPORT_TASKS);
        const vacationsRaw = limitArray(parsed.vacations || [], MAX_IMPORT_VACATIONS);
        const limitNotice = buildImportLimitNotice(
          Array.isArray(parsed.tasks) && parsed.tasks.length > MAX_IMPORT_TASKS ? MAX_IMPORT_TASKS : 0,
          Array.isArray(parsed.vacations) && parsed.vacations.length > MAX_IMPORT_VACATIONS ? MAX_IMPORT_VACATIONS : 0,
        );
        const invalidTasks = countInvalidRanges(
          tasksRaw,
          (t) => t?.start || t?.actStart || t?.planStart || '',
          (t) => t?.end || t?.actEnd || t?.planEnd || '',
        );
        const invalidVacations = countInvalidRanges(
          vacationsRaw,
          (v) => v?.start || v?.startDate || '',
          (v) => v?.end || v?.endDate || v?.start || v?.startDate || '',
        );
        const invalidNotice = buildInvalidRangeNotice(invalidTasks, invalidVacations) + limitNotice;
        const resolvedName = String(parsed.name || sourceName || '프로젝트').trim() || '프로젝트';
        const confirmed = skipConfirm
          ? true
          : await confirmAsync(`'${resolvedName}' 프로젝트를 가져올까요?${invalidNotice}\n\n현재 일정 데이터는 덮어쓰기 됩니다.`, {
            title: '가져오기 확인',
            confirmText: '가져오기',
            cancelText: '취소',
          });
        if (confirmed) {
          setTasks(applyTaskRules(tasksRaw));
          setProjectName(resolveImportedProjectName({ parsedName: parsed.name, sourceName }));
          setVacations(normalizeVacations(vacationsRaw));
          setRangePadding(mergeRangePadding(parsed.rangePadding));
          setFitSettings(sanitizeFitSettings(parsed.fitSettings));
          setZoomSettings(sanitizeZoomSettings(parsed.zoomSettings));
          return true;
        }
        return false;
      }

      throw new Error('지원하지 않는 데이터 형식입니다.');
    },
    [
      setTasks,
      setProjectName,
      setVacations,
      setRangePadding,
      setFitSettings,
      setZoomSettings,
      applyTaskRules,
      confirmAsync,
    ],
  );

  const importFromPublicSchedule = useCallback(
    async (
      scheduleData,
      {
        sourceName,
        sourceId,
        sourceUpdatedAt,
        sourceFolderId,
        sourceFolderPath,
        sourceStatus,
        sourceHoldingReason,
        sourceNextAction,
        skipConfirm = false,
      } = {},
    ) => {
      try {
        if (!canAccessEditor) {
          setIsAuthModalOpen(true);
          void alertAsync('가져오기/편집 기능은 로그인 후 사용할 수 있습니다.');
          return;
        }
        const imported = await applyImportedData(scheduleData, { sourceName }, { skipConfirm });
        if (!imported) return;
        const safeSourceId = String(sourceId || '').trim();
        const safeUpdatedAt = Number(sourceUpdatedAt);
        const safeFolderIdRaw = String(sourceFolderId || '').trim();
        const safeFolderPath = String(sourceFolderPath || '').trim();
        const safeStatus = normalizePublicScheduleStatus(sourceStatus ?? scheduleData?.status);
        const safeHoldingReason = String((sourceHoldingReason ?? scheduleData?.holdingReason) || '').trim();
        const safeNextAction = String((sourceNextAction ?? scheduleData?.nextAction) || '').trim();
        setPublicOrigin(
          safeSourceId
            ? {
              id: safeSourceId,
              name: String(sourceName || '').trim(),
              updatedAt: Number.isFinite(safeUpdatedAt) ? safeUpdatedAt : null,
              folderId: safeFolderIdRaw || PUBLIC_UNCATEGORIZED_FOLDER_ID,
              folderPath: safeFolderPath,
              status: safeStatus,
              holdingReason: safeHoldingReason,
              nextAction: safeNextAction,
            }
            : null,
        );
        setActiveMainTab('edit');
        setActiveEditorTab('schedule');
      } catch (error) {
        console.error(error);
        void alertAsync(error?.message || '일정을 가져오지 못했습니다.');
      }
    },
    [applyImportedData, alertAsync, canAccessEditor],
  );

  const [isPublicUploadModalOpen, setIsPublicUploadModalOpen] = useState(false);
  const [isUploadingPublicSchedule, setIsUploadingPublicSchedule] = useState(false);
  const [isSharedBootstrapDone, setIsSharedBootstrapDone] = useState(false);

  useEffect(() => {
    if (!isSharedScheduleLocked || isSharedBootstrapDone || !canAccessEditor) return;
    if (!isPublicSchedulesEnabled()) {
      setIsSharedBootstrapDone(true);
      return;
    }

    let canceled = false;

    const bootstrapSharedSchedule = async () => {
      try {
        const raw = await getPublicSchedule(sharedScheduleId);
        const scheduleData =
          raw && typeof raw === 'object'
            ? raw.data != null
              ? raw.data
              : raw.schedule != null
                ? raw.schedule
                : raw
            : raw;

        const sourceName = String(raw?.name || scheduleData?.name || '').trim();
        await importFromPublicSchedule(scheduleData, {
          sourceName,
          sourceId: sharedScheduleId,
          sourceUpdatedAt: raw?.updatedAt ?? raw?.updated_at ?? null,
          sourceFolderId: raw?.folderId ?? raw?.folder_id ?? null,
          sourceFolderPath: raw?.folderPath ?? raw?.folder_path ?? '',
          sourceStatus: raw?.status ?? scheduleData?.status,
          sourceHoldingReason: raw?.holdingReason ?? scheduleData?.holdingReason,
          sourceNextAction: raw?.nextAction ?? scheduleData?.nextAction,
          skipConfirm: true,
        });
      } catch (error) {
        console.error(error);
        if (!canceled) {
          void alertAsync(error?.message || '공유 원본 일정을 자동으로 불러오지 못했습니다.');
        }
      } finally {
        if (!canceled) setIsSharedBootstrapDone(true);
      }
    };

    void bootstrapSharedSchedule();

    return () => {
      canceled = true;
    };
  }, [isSharedScheduleLocked, isSharedBootstrapDone, sharedScheduleId, importFromPublicSchedule, alertAsync, canAccessEditor]);

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
        await alertAsync('가입 요청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.');
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
      setIsPublicUploadModalOpen(false);
      setActiveMainTab('browse');
      setActiveEditorTab('tasks');
    } finally {
      setIsAuthSubmitting(false);
    }
  }, [signOut]);

  const openPublicUploadModal = useCallback(async () => {
    if (!isAuthenticated) {
      setIsAuthModalOpen(true);
      void alertAsync('편집 기능은 로그인 후 사용할 수 있습니다.');
      return;
    }
    if (!canEditSchedules) {
      void alertAsync('승인된 계정만 편집/업로드를 사용할 수 있습니다.');
      return;
    }
    if (!canWritePublicSchedules) {
      void alertAsync('공개 일정 쓰기 서버가 설정되어 있지 않습니다. (VITE_PUBLIC_SCHEDULES_WRITE_API_BASE)');
      return;
    }
    if (!isPublicSchedulesEnabled()) {
      void alertAsync('공개 일정 서버가 설정되어 있지 않습니다. (VITE_PUBLIC_SCHEDULES_API_BASE)');
      return;
    }

    setIsLoadingPublicFolders(true);
    let shouldOpenModal = true;
    try {
      const folders = await listPublicFoldersTree();
      setPublicFolderOptions(buildFolderSelectOptions(folders));
    } catch (error) {
      console.error(error);
      if (error?.status === 401 || error?.status === 403) {
        setIsAuthModalOpen(true);
        void refreshSession();
        shouldOpenModal = false;
      }
      setPublicFolderOptions(buildFolderSelectOptions([]));
      void alertAsync(
        `${error?.message || '폴더 목록을 불러오지 못했습니다.'}\n미분류 폴더로 업로드는 계속 진행할 수 있습니다.`,
      );
    } finally {
      setIsLoadingPublicFolders(false);
    }

    if (shouldOpenModal) setIsPublicUploadModalOpen(true);
  }, [alertAsync, canEditSchedules, canWritePublicSchedules, isAuthenticated, refreshSession]);

  const closePublicUploadModal = useCallback(() => {
    if (isUploadingPublicSchedule) return;
    setIsPublicUploadModalOpen(false);
  }, [isUploadingPublicSchedule]);

  const uploadCurrentProject = useCallback(
    async ({ title, mode = 'create', folderId, status, holdingReason, nextAction, targetId } = {}) => {
      try {
        if (!isAuthenticated) {
          setIsAuthModalOpen(true);
          void alertAsync('편집 기능은 로그인 후 사용할 수 있습니다.');
          return;
        }
        if (!canEditSchedules) {
          void alertAsync('승인된 계정만 편집/업로드를 사용할 수 있습니다.');
          return;
        }
        if (!canWritePublicSchedules) {
          void alertAsync('공개 일정 쓰기 서버가 설정되어 있지 않습니다. (VITE_PUBLIC_SCHEDULES_WRITE_API_BASE)');
          return;
        }
        if (!isPublicSchedulesEnabled()) {
          void alertAsync('공개 일정 서버가 설정되어 있지 않습니다. (VITE_PUBLIC_SCHEDULES_API_BASE)');
          return;
        }

        const safeTitle = String(title || '').trim();
        if (!safeTitle) {
          void alertAsync('업로드 제목을 입력해주세요.');
          return;
        }

        const requestedMode = mode === 'update' ? 'update' : 'create';
        const safeMode = isSharedScheduleLocked ? 'update' : requestedMode;
        const safeFolderId = String(folderId || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID;
        const safeStatus = normalizePublicScheduleStatus(status ?? publicOrigin?.status);
        const safeHoldingReason = String((holdingReason ?? publicOrigin?.holdingReason) || '').trim();
        const safeNextAction = String((nextAction ?? publicOrigin?.nextAction) || '').trim();
        const safeTargetId = isSharedScheduleLocked ? sharedScheduleId : String(targetId || '').trim();

        const knownFolderIds = new Set(
          (Array.isArray(publicFolderOptions) ? publicFolderOptions : []).map((item) => String(item?.id || '').trim()),
        );
        if (knownFolderIds.size > 0 && !knownFolderIds.has(safeFolderId)) {
          void alertAsync('선택한 폴더가 현재 폴더 목록에 없습니다. 폴더를 다시 선택해주세요.');
          return;
        }

        if (safeMode === 'update') {
          if (!safeTargetId) {
            void alertAsync('업데이트할 일정 ID(또는 링크)를 입력해주세요.');
            return;
          }
        }

        let ifUnmodifiedAt = null;
        if (safeMode === 'update') {
          if (String(publicOrigin?.id || '').trim() === safeTargetId && Number.isFinite(Number(publicOrigin?.updatedAt))) {
            ifUnmodifiedAt = Number(publicOrigin.updatedAt);
          } else {
            try {
              const latest = await getPublicSchedule(safeTargetId);
              const latestUpdatedAt = Number(latest?.updatedAt ?? latest?.updated_at);
              if (Number.isFinite(latestUpdatedAt)) ifUnmodifiedAt = latestUpdatedAt;
            } catch {
              // keep null and let server handle the request
            }
          }
        }

        const payload = {
          name: safeTitle,
          folderId: safeFolderId,
          status: safeStatus,
          holdingReason: safeHoldingReason,
          nextAction: safeNextAction,
          tasks,
          vacations,
          rangePadding,
          fitSettings,
          zoomSettings,
          uploadedAt: new Date().toISOString(),
          ...(safeMode === 'update' && Number.isFinite(ifUnmodifiedAt) ? { ifUnmodifiedAt } : {}),
        };

        if (tasks.length > MAX_IMPORT_TASKS) {
          void alertAsync(`업로드 가능한 작업 수를 초과했습니다. (현재 ${tasks.length}개 / 최대 ${MAX_IMPORT_TASKS}개)`);
          return;
        }
        if (vacations.length > MAX_IMPORT_VACATIONS) {
          void alertAsync(
            `업로드 가능한 휴가 수를 초과했습니다. (현재 ${vacations.length}개 / 최대 ${MAX_IMPORT_VACATIONS}개)`,
          );
          return;
        }

        const payloadText = JSON.stringify(payload);
        const payloadBytes = getUtf8ByteLength(payloadText);
        if (payloadBytes > MAX_PUBLIC_UPLOAD_TEXT_LENGTH) {
          const currentKb = Math.round(payloadBytes / 1024);
          const maxKb = Math.round(MAX_PUBLIC_UPLOAD_TEXT_LENGTH / 1024);
          void alertAsync(
            `업로드 데이터 크기가 서버 제한을 초과했습니다. (현재 약 ${currentKb}KB / 최대 ${maxKb}KB)\n작업/휴가 수를 줄이거나 메모 내용을 정리한 뒤 다시 시도해주세요.`,
          );
          return;
        }

        setIsUploadingPublicSchedule(true);
        const result =
          safeMode === 'update'
            ? await updatePublicSchedule(safeTargetId, payload)
            : await uploadPublicSchedule(payload);

        const shareUrl = String(result?.url || '').trim();
	        const nextUpdatedAt = Number(result?.updatedAt ?? result?.updated_at);
	        const nextStatus = normalizePublicScheduleStatus(result?.status ?? safeStatus);
	        const nextHoldingReason = String((result?.holdingReason ?? safeHoldingReason) || '').trim();
	        const nextNextAction = String((result?.nextAction ?? safeNextAction) || '').trim();

        if (shareUrl) {
          try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(shareUrl);
            await alertAsync(
              `${safeMode === 'update' ? '업데이트' : '업로드'}가 완료되었습니다.\n\n링크가 클립보드에 복사되었습니다:\n${shareUrl}`,
              { title: '완료', confirmText: '확인' },
            );
          } catch {
            await alertAsync(
              `${safeMode === 'update' ? '업데이트' : '업로드'}가 완료되었습니다.\n\n링크:\n${shareUrl}`,
              {
                title: '완료',
                confirmText: '확인',
              },
            );
          }
        } else {
          await alertAsync(`${safeMode === 'update' ? '업데이트' : '업로드'}가 완료되었습니다.`, {
            title: '완료',
            confirmText: '확인',
          });
        }

        const updatedId = String(result?.id || safeTargetId).trim();
        const nextFolderId = String(result?.folderId || '').trim() || safeFolderId;
        const nextFolderPath =
          String(result?.folderPath || '').trim() ||
          String(publicFolderOptions.find((item) => String(item?.id || '').trim() === nextFolderId)?.path || '').trim();

        setPublicOrigin(
          updatedId
            ? {
              id: updatedId,
              name: safeTitle,
              updatedAt: Number.isFinite(nextUpdatedAt)
                ? nextUpdatedAt
                : Number.isFinite(ifUnmodifiedAt)
                  ? ifUnmodifiedAt
                  : null,
	              folderId: nextFolderId,
	              folderPath: nextFolderPath,
	              status: nextStatus,
	              holdingReason: nextHoldingReason,
	              nextAction: nextNextAction,
	            }
	            : null,
	        );

        setActiveMainTab('browse');
        setPublicRefreshToken((v) => v + 1);
        setIsPublicUploadModalOpen(false);
      } catch (error) {
        console.error(error);
        if (error?.status === 409) {
          void alertAsync('다른 사용자가 먼저 일정을 수정했습니다. 최신 일정을 다시 불러온 뒤 재시도해주세요.');
        } else if (error?.status === 401 || error?.status === 403) {
          setIsAuthModalOpen(true);
          void refreshSession();
          void alertAsync(error?.message || '로그인 상태를 확인한 뒤 다시 시도해주세요.');
        } else {
          void alertAsync(error?.message || '업로드/업데이트에 실패했습니다.');
        }
      } finally {
        setIsUploadingPublicSchedule(false);
      }
    },
    [
      tasks,
      vacations,
      rangePadding,
      fitSettings,
      zoomSettings,
      publicOrigin,
      publicFolderOptions,
      alertAsync,
      isAuthenticated,
      canEditSchedules,
      canWritePublicSchedules,
      isSharedScheduleLocked,
      sharedScheduleId,
      refreshSession,
    ],
  );

  const [publicRefreshToken, setPublicRefreshToken] = useState(0);

  const renderEditorContent = () => {
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
  };

  const renderContent = () => {
    if (activeMainTab === 'browse' || !canAccessEditor) {
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

      <main className="relative z-0 flex min-h-0 w-full flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
        {storageError && (
          <div
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            role="alert"
          >
            브라우저 저장소를 사용할 수 없어 새로고침 시 변경사항이 사라질 수 있습니다.
          </div>
        )}
        {dependencyCycleIds.length > 0 && (
          <div
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="alert"
          >
            의존성 순환이 감지되었습니다. 순환에 포함된 작업은 자동 일정 밀기 대상에서 제외됩니다.
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

      <PublicUploadModal
        isOpen={isPublicUploadModalOpen}
        onClose={closePublicUploadModal}
        defaultTitle={String(projectName || '').trim()}
        defaultUpdateTargetId={isSharedScheduleLocked ? sharedScheduleId : String(publicOrigin?.id || '').trim()}
        defaultUpdateTargetName={String(publicOrigin?.name || '').trim()}
        currentUserEmail={authUser?.email || ''}
        currentUserProfile={authEmployeeProfile}
        defaultFolderId={String(publicOrigin?.folderId || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID}
        defaultStatus={normalizePublicScheduleStatus(publicOrigin?.status)}
        defaultHoldingReason={String(publicOrigin?.holdingReason || '').trim()}
        defaultNextAction={String(publicOrigin?.nextAction || '').trim()}
        folderOptions={publicFolderOptions}
        tasksCount={tasks.length}
        isUploading={isUploadingPublicSchedule || isLoadingPublicFolders}
        lockModeToUpdate={isSharedScheduleLocked}
        lockedTargetId={sharedScheduleId}
        onSubmit={uploadCurrentProject}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={closeReportModal}
        tasks={reportSourceTasks}
        vacations={vacations}
        rangePadding={rangePadding}
        reportChartWidth={REPORT_CHART_WIDTH_PX}
        reportLeftPaneWidth={GANTT_EXPORT_LEFT_PANE_PX}
        reportGanttMode={reportGanttMode}
        setReportGanttMode={setReportGanttMode}
        generateWordReport={generateWordReport}
        isGenerating={isGenerating}
      />

      {isReportModalOpen && (
        <div style={{ position: 'fixed', left: '-9999px', top: '0px', pointerEvents: 'none' }}>
          <GanttChart
            tasks={reportSourceTasks}
            vacations={vacations}
            viewMode={reportGanttMode}
            rangePadding={rangePadding[reportGanttMode] || { before: 0, after: 0 }}
            fitEnabled
            isExportMode
            exportId="gantt-report-export-target"
            exportViewportWidth={REPORT_CHART_WIDTH_PX}
            exportLeftPaneWidth={GANTT_EXPORT_LEFT_PANE_PX}
          />
        </div>
      )}

      <ImageExportModal
        isOpen={isImageExportModalOpen}
        onClose={() => setIsImageExportModalOpen(false)}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        exportScope={exportScope}
        setExportScope={setExportScope}
        exportScale={exportScale}
        setExportScale={setExportScale}
        exportShowToday={exportShowToday}
        setExportShowToday={setExportShowToday}
        exportFileName={exportFileName}
        setExportFileName={setExportFileName}
        exportJpegQuality={exportJpegQuality}
        setExportJpegQuality={setExportJpegQuality}
        exportGanttImage={exportGanttImage}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        isSubmitting={isAuthSubmitting || isAuthLoading}
        onClose={closeAuthModal}
        onLogin={submitAuthLogin}
        onRegister={submitAuthRegister}
      />

      <Modal
        isOpen={confirmDialog.isOpen}
        onClose={() => closeConfirmDialog(confirmDialog.mode === 'alert')}
        ariaLabel={confirmDialog.title || '확인'}
        panelClassName="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-slate-900">{confirmDialog.title || '확인'}</h3>
          </div>
        </div>

        <div className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{confirmDialog.message}</div>

        <div className="mt-6 flex items-center justify-end gap-2">
          {confirmDialog.mode !== 'alert' && (
            <button
              type="button"
              onClick={() => closeConfirmDialog(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {confirmDialog.cancelText || '취소'}
            </button>
          )}
          <button
            type="button"
            onClick={() => closeConfirmDialog(true)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {confirmDialog.confirmText || '확인'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default App;
