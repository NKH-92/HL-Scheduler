import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Trash2, Users } from './Icons';
import GanttChart from './GanttChart';
import Dashboard from './Dashboard';
import FolderAdminModal from './public-schedules/FolderAdminModal';
import PublicSchedulesBoardHeader from './public-schedules/PublicSchedulesBoardHeader';
import PublicSchedulesKanbanBoard from './public-schedules/PublicSchedulesKanbanBoard';
import PublicSchedulePreviewSummary from './public-schedules/PublicSchedulePreviewSummary';
import PublicSchedulePreviewToolbar from './public-schedules/PublicSchedulePreviewToolbar';
import PublicSchedulesSidebar from './public-schedules/PublicSchedulesSidebar';
import {
  PUBLIC_UNCATEGORIZED_FOLDER_ID,
  createPublicFolder,
  deletePublicSchedule,
  deletePublicFolder,
  getPublicSchedule,
  isPublicSchedulesEnabled,
  listPublicFoldersTree,
  listPublicSchedules,
  reorderPublicFolder,
  updatePublicSchedule,
  updatePublicScheduleFolder,
} from '../utils/publicSchedulesApi';
import { findEmployeeByEmail, getEmployeeDirectory } from '../utils/employeeDirectory';
import { normalizeTasks, normalizeVacations } from '../utils/data';
import { mergeRangePadding, sanitizeFitSettings, sanitizeZoomSettings } from '../utils/schedulerSettings';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import {
  PUBLIC_SCHEDULE_STATUS_ORDER,
  getPublicScheduleStatusLabel,
  normalizePublicScheduleStatus,
} from '../utils/publicScheduleStatus';
import {
  buildTeamLeadStats,
  collectTeamLeadFilterOptions,
  filterTeamLeadSchedules,
  normalizeBoardActivity,
  normalizeBoardOverview,
  summarizeActivityDate,
} from '../utils/publicSchedulesBoard';
import { isPlainObject, clampZoom, buildFolderSelectOptions as buildFolderSelectOptionsBase } from '../utils/shared';

const ALL_FOLDERS_ID = '__all_folders__';
const PAGE_SIZE = 40;
const VIEW_MODE_LABELS = {
  Day: '�� (Day)',
  Week: '�� (Week)',
  Month: '�� (Month)',
};
const KANBAN_STATUS_TONES = {
  planning: {
    shell: 'border-sky-200/80 bg-sky-50/80',
    header: 'bg-sky-100 text-sky-950',
    badge: 'bg-sky-600 text-white',
    cardGlow: 'hover:shadow-sky-100/80',
  },
  in_progress: {
    shell: 'border-emerald-200/80 bg-emerald-50/80',
    header: 'bg-emerald-100 text-emerald-950',
    badge: 'bg-emerald-600 text-white',
    cardGlow: 'hover:shadow-emerald-100/80',
  },
  holding: {
    shell: 'border-amber-200/80 bg-amber-50/80',
    header: 'bg-amber-100 text-amber-950',
    badge: 'bg-amber-600 text-white',
    cardGlow: 'hover:shadow-amber-100/80',
  },
  closed: {
    shell: 'border-slate-200/80 bg-slate-100/80',
    header: 'bg-slate-200 text-slate-900',
    badge: 'bg-slate-700 text-white',
    cardGlow: 'hover:shadow-slate-200/80',
  },
};
const KANBAN_COLUMNS = PUBLIC_SCHEDULE_STATUS_ORDER.map((status) => ({
  id: status,
  label: getPublicScheduleStatusLabel(status),
  tone: KANBAN_STATUS_TONES[status],
}));

const formatDateTime = (value) => {
  if (value == null) return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const buildEmployeeDisplay = (email, directory) => {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) return { email: '', profile: '' };

  const employee = findEmployeeByEmail(safeEmail, directory);
  if (!employee) return { email: safeEmail, profile: '' };

  return {
    email: safeEmail,
    profile: `${employee.name || '-'} / ${employee.department || '-'} / ${employee.position || '-'}`,
  };
};

// isPlainObject is now imported from shared.js

const normalizeSchedulePayload = (payload, fallbackName) => {
  if (Array.isArray(payload)) {
    return {
      name: String(fallbackName || '���� ����').trim() || '���� ����',
      status: normalizePublicScheduleStatus(null),
      holdingReason: '',
      nextAction: '',
      activityLog: [],
      overview: normalizeBoardOverview(null),
      tasks: normalizeTasks(payload),
      vacations: [],
      rangePadding: mergeRangePadding(null),
      fitSettings: sanitizeFitSettings(null),
      zoomSettings: sanitizeZoomSettings(null),
    };
  }

  if (!isPlainObject(payload)) {
    throw new Error('���� ������ ������ �ùٸ��� �ʽ��ϴ�.');
  }

  return {
    name: String(payload.name || fallbackName || '���� ����').trim() || '���� ����',
    status: normalizePublicScheduleStatus(payload.status),
    holdingReason: String(payload.holdingReason || '').trim(),
    nextAction: String(payload.nextAction || '').trim(),
    activityLog: normalizeBoardActivity(payload.activityLog || payload.recentActivity || []),
    overview: normalizeBoardOverview(payload),
    tasks: normalizeTasks(payload.tasks || []),
    vacations: normalizeVacations(payload.vacations || []),
    rangePadding: mergeRangePadding(payload.rangePadding),
    fitSettings: sanitizeFitSettings(payload.fitSettings),
    zoomSettings: sanitizeZoomSettings(payload.zoomSettings),
  };
};

const normalizeFolderNodes = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const id = String(row?.id || '').trim();
      if (!id) return null;
      const depth = Math.max(1, Number(row?.depth) || 1);
      const name = String(row?.name || '').trim() || id;
      const path = String(row?.path || '').trim() || name;
      return {
        id,
        name,
        parentId: row?.parentId == null ? null : String(row.parentId).trim() || null,
        depth,
        sortOrder: Number(row?.sortOrder) || 0,
        path,
        projectCount: Number(row?.projectCount) || 0,
      };
    })
    .filter(Boolean);

const buildFolderSelectOptions = (folders) => buildFolderSelectOptionsBase(
  folders.map((folder) => ({
    id: folder.id,
    depth: folder.depth,
    name: folder.name,
    path: folder.path,
  })),
  PUBLIC_UNCATEGORIZED_FOLDER_ID,
);

// clampZoom is now imported from shared.js

function PublicSchedules({
  refreshToken = 0,
  onImportSchedule,
  onConfirm,
  canManage = false,
  canImport = true,
  sharedScheduleId = '',
}) {
  const isMobileViewport = useIsMobileViewport();
  const enabled = useMemo(() => isPublicSchedulesEnabled(), []);
  const employeeDirectory = useMemo(() => getEmployeeDirectory(), []);
  const canManageFolders = !!canManage;
  const sharedModeId = String(sharedScheduleId || '').trim();

  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [listError, setListError] = useState('');

  const [folders, setFolders] = useState([]);
  const [supportsFolders, setSupportsFolders] = useState(true);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [hasAttemptedFolderLoad, setHasAttemptedFolderLoad] = useState(false);
  const [foldersError, setFoldersError] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [hasInitializedFolderSelection, setHasInitializedFolderSelection] = useState(false);
  const [listReloadToken, setListReloadToken] = useState(0);
  const [isFolderPanelCollapsed, setIsFolderPanelCollapsed] = useState(false);

  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [folderManageError, setFolderManageError] = useState('');
  const [isFolderAdminModalOpen, setIsFolderAdminModalOpen] = useState(false);
  const [movingFolderId, setMovingFolderId] = useState('');
  const [movingFolderBySchedule, setMovingFolderBySchedule] = useState(() => ({}));
  const [updatingStatusBySchedule, setUpdatingStatusBySchedule] = useState(() => ({}));
  const [savingMetaBySchedule, setSavingMetaBySchedule] = useState(() => ({}));
  const [holdingReasonDrafts, setHoldingReasonDrafts] = useState(() => ({}));
  const [nextActionDrafts, setNextActionDrafts] = useState(() => ({}));
  const [deletingScheduleId, setDeletingScheduleId] = useState('');
  const [teamLeadAssigneeFilter, setTeamLeadAssigneeFilter] = useState('');
  const [teamLeadDepartmentFilter, setTeamLeadDepartmentFilter] = useState('');
  const [teamLeadRiskFilter, setTeamLeadRiskFilter] = useState('all');

  const [contentView, setContentView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');

  const [previewViewMode, setPreviewViewMode] = useState('Week');
  const [previewFilterText, setPreviewFilterText] = useState('');
  const [previewTab, setPreviewTab] = useState('schedule');
  const [previewZoomSettings, setPreviewZoomSettings] = useState(() => sanitizeZoomSettings(null));
  const [previewRangePadding, setPreviewRangePadding] = useState(() => mergeRangePadding(null));
  const [previewFitSettings, setPreviewFitSettings] = useState(() => sanitizeFitSettings(null));

  const listRequestIdRef = useRef(0);
  const scheduleRequestIdRef = useRef(0);
  const selectedIdRef = useRef('');

  const folderSelectOptions = useMemo(() => buildFolderSelectOptions(folders), [folders]);

  const folderPathById = useMemo(() => {
    const map = new Map();
    folderSelectOptions.forEach((item) => {
      map.set(String(item.id || '').trim(), String(item.path || '').trim());
    });
    return map;
  }, [folderSelectOptions]);

  const selectedFolderDisplayName = useMemo(() => {
    if (!supportsFolders || selectedFolderId === ALL_FOLDERS_ID) return '��ü';
    if (selectedFolderId === PUBLIC_UNCATEGORIZED_FOLDER_ID) return '�̺з�';
    const selected = folders.find((folder) => folder.id === selectedFolderId);
    return selected?.path || selected?.name || '��ü';
  }, [supportsFolders, selectedFolderId, folders]);

  const folderMoveStateById = useMemo(() => {
    const grouped = new Map();
    folders.forEach((folder) => {
      const key = String(folder?.parentId || '').trim();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(folder);
    });

    const stateById = new Map();
    grouped.forEach((siblings) => {
      siblings.forEach((folder, index) => {
        stateById.set(folder.id, {
          canMoveUp: index > 0,
          canMoveDown: index < siblings.length - 1,
        });
      });
    });

    return stateById;
  }, [folders]);

  const loadFolders = useCallback(async () => {
    if (!enabled) return;
    setIsLoadingFolders(true);
    setFoldersError('');
    try {
      const folderRows = await listPublicFoldersTree();
      setFolders(normalizeFolderNodes(folderRows));
      setSupportsFolders(true);
    } catch (error) {
      if (Number(error?.status) === 404) {
        setSupportsFolders(false);
        setFolders([]);
        setFoldersError('���� ���� ������ ���� Ʈ���� �������� �ʽ��ϴ�.');
      } else {
        setFoldersError(error?.message || '���� ����� �ҷ����� ���߽��ϴ�.');
      }
    } finally {
      setIsLoadingFolders(false);
      setHasAttemptedFolderLoad(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void loadFolders();
  }, [enabled, refreshToken, loadFolders]);

  useEffect(() => {
    selectedIdRef.current = String(selectedId || '').trim();
  }, [selectedId]);

  useEffect(() => {
    if (canManageFolders) return;
    setIsFolderAdminModalOpen(false);
  }, [canManageFolders]);

  useEffect(() => {
    if (supportsFolders) return;
    setSelectedFolderId(ALL_FOLDERS_ID);
  }, [supportsFolders]);

  useEffect(() => {
    if (!supportsFolders) return;
    if (!hasAttemptedFolderLoad) return;
    const defaultFolderId = folders[0]?.id || PUBLIC_UNCATEGORIZED_FOLDER_ID;
    if (!hasInitializedFolderSelection) {
      setSelectedFolderId(defaultFolderId);
      setHasInitializedFolderSelection(true);
      return;
    }
    if (!selectedFolderId || selectedFolderId === ALL_FOLDERS_ID) {
      setSelectedFolderId(defaultFolderId);
      return;
    }
    if (selectedFolderId === PUBLIC_UNCATEGORIZED_FOLDER_ID) return;
    if (!folders.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(defaultFolderId);
    }
  }, [supportsFolders, selectedFolderId, folders, hasInitializedFolderSelection, hasAttemptedFolderLoad]);

  const fetchSchedulesPage = useCallback(
    async ({ offset = 0, append = false } = {}) => {
      if (!enabled) return;
      const requestId = ++listRequestIdRef.current;
      if (append) setIsLoadingMore(true);
      else setIsLoadingList(true);
      setListError('');

      try {
        const folderFilter =
          supportsFolders && selectedFolderId !== ALL_FOLDERS_ID ? selectedFolderId : undefined;
        const list = await listPublicSchedules({
          query,
          limit: PAGE_SIZE,
          offset,
          ...(folderFilter !== undefined
            ? {
                folderId: folderFilter,
                includeDescendants: true,
              }
            : {}),
        });
        if (listRequestIdRef.current !== requestId) return;
        const safeList = Array.isArray(list) ? list : [];
        setItems((prev) => (append ? [...prev, ...safeList] : safeList));
        setNextOffset(offset + safeList.length);
        setHasMore(safeList.length === PAGE_SIZE);
      } catch (error) {
        if (listRequestIdRef.current !== requestId) return;
        setListError(error?.message || '���� ���� ����� �ҷ����� ���߽��ϴ�.');
        if (!append) {
          setItems([]);
          setHasMore(false);
          setNextOffset(0);
        }
      } finally {
        if (listRequestIdRef.current !== requestId) return;
        setIsLoadingList(false);
        setIsLoadingMore(false);
      }
    },
    [enabled, query, selectedFolderId, supportsFolders],
  );

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      void fetchSchedulesPage({ offset: 0, append: false });
    }, query.trim() ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [enabled, query, refreshToken, selectedFolderId, supportsFolders, listReloadToken, fetchSchedulesPage]);

  const loadSchedule = useCallback(async (item) => {
    const id = String(item?.id || '').trim();
    if (!id) return;
    const requestId = ++scheduleRequestIdRef.current;
    selectedIdRef.current = id;
    setSelectedId(id);
    setSelectedMeta(item || null);
    setSelectedSchedule(null);
    setScheduleError('');
    setIsLoadingSchedule(true);

    try {
      const raw = await getPublicSchedule(id);
      const payload =
        raw && typeof raw === 'object'
          ? raw.data != null
            ? raw.data
            : raw.schedule != null
              ? raw.schedule
              : raw
          : raw;
      const fallbackName = String(item?.name || item?.title || raw?.name || '').trim();
      const normalized = normalizeSchedulePayload(payload, fallbackName);
      const rawUpdatedAt = Number(raw?.updatedAt ?? raw?.updated_at ?? item?.updatedAt ?? item?.updated_at);
      if (scheduleRequestIdRef.current !== requestId) return;

      setSelectedSchedule(normalized);
      setSelectedMeta((prev) => ({
        ...(prev && typeof prev === 'object' ? prev : {}),
        ...(item && typeof item === 'object' ? item : {}),
        ...(Number.isFinite(rawUpdatedAt) ? { updatedAt: rawUpdatedAt } : {}),
        status: normalizePublicScheduleStatus(raw?.status ?? item?.status ?? normalized.status),
        folderId: raw?.folderId ?? item?.folderId ?? null,
        folderPath: raw?.folderPath ?? item?.folderPath ?? '',
        holdingReason: String((raw?.holdingReason ?? item?.holdingReason ?? normalized.holdingReason) || '').trim(),
        nextAction: String((raw?.nextAction ?? item?.nextAction ?? normalized.nextAction) || '').trim(),
        recentActivity: normalizeBoardActivity(raw?.recentActivity ?? item?.recentActivity ?? normalized.activityLog),
        activityLog: normalizeBoardActivity(raw?.activityLog ?? normalized.activityLog),
        overview: normalizeBoardOverview(raw?.overview ? { overview: raw.overview } : normalized),
      }));
      setPreviewViewMode('Week');
      setPreviewFilterText('');
      setPreviewTab('schedule');
      setPreviewZoomSettings(normalized.zoomSettings);
      setPreviewRangePadding(normalized.rangePadding);
      setPreviewFitSettings(normalized.fitSettings);
    } catch (error) {
      if (scheduleRequestIdRef.current !== requestId) return;
      setScheduleError(error?.message || '������ �ҷ����� ���߽��ϴ�.');
      setSelectedSchedule(null);
    } finally {
      if (scheduleRequestIdRef.current !== requestId) return;
      setIsLoadingSchedule(false);
    }
  }, []);

  const openPreview = useCallback(
    (item) => {
      setContentView('preview');
      setPreviewTab('schedule');
      void loadSchedule(item);
    },
    [loadSchedule],
  );

  const filteredPreviewTasks = useMemo(() => {
    const tasks = selectedSchedule?.tasks || [];
    const q = String(previewFilterText || '').trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((task) => {
      return (
        (task.taskName && String(task.taskName).toLowerCase().includes(q)) ||
        (task.department && String(task.department).toLowerCase().includes(q)) ||
        (task.assignee && String(task.assignee).toLowerCase().includes(q))
      );
    });
  }, [selectedSchedule, previewFilterText]);

  const previewHistoryItems = useMemo(() => {
    const meta = selectedMeta && typeof selectedMeta === 'object' ? selectedMeta : {};
    const folderId = String(meta.folderId ?? meta.folder_id ?? '').trim();
    const folderPath =
      String(meta.folderPath ?? meta.folder_path ?? '').trim() ||
      String(folderPathById.get(folderId || PUBLIC_UNCATEGORIZED_FOLDER_ID) || '').trim() ||
      (folderId ? folderId : '�̺з�');
    const createdAt = formatDateTime(meta.createdAt ?? meta.created_at);
    const updatedAt = formatDateTime(meta.updatedAt ?? meta.updated_at);
    const statusLabel = getPublicScheduleStatusLabel(meta.status ?? selectedSchedule?.status);
    const createdByInfo = buildEmployeeDisplay(meta.createdByEmail || meta.created_by_email || '', employeeDirectory);
    const updatedByInfo = buildEmployeeDisplay(meta.updatedByEmail || meta.updated_by_email || '', employeeDirectory);

    return [
      { label: '����', value: folderPath || '�̺з�' },
      { label: '����', value: statusLabel },
      { label: '���', value: createdAt || '-' },
      { label: '����', value: updatedAt || '-' },
      { label: '�Խ���', value: createdByInfo.profile || createdByInfo.email || '-' },
      { label: '���� ������', value: updatedByInfo.profile || updatedByInfo.email || '-' },
    ];
  }, [selectedMeta, selectedSchedule, folderPathById, employeeDirectory]);

  const importSelectedSchedule = () => {
    if (!selectedSchedule || !canImport) return;
    onImportSchedule?.(
      {
        name: selectedSchedule.name,
        tasks: selectedSchedule.tasks,
        vacations: selectedSchedule.vacations,
        rangePadding: selectedSchedule.rangePadding,
        fitSettings: selectedSchedule.fitSettings,
        zoomSettings: selectedSchedule.zoomSettings,
      },
      {
        sourceName: selectedSchedule.name,
        sourceId: selectedId,
        sourceUpdatedAt: selectedMeta?.updatedAt ?? selectedMeta?.updated_at,
        sourceFolderId: selectedMeta?.folderId ?? selectedMeta?.folder_id ?? null,
        sourceFolderPath: selectedMeta?.folderPath ?? selectedMeta?.folder_path ?? '',
        sourceStatus: selectedMeta?.status ?? selectedSchedule?.status,
        sourceHoldingReason: selectedMeta?.holdingReason ?? selectedSchedule?.holdingReason ?? '',
        sourceNextAction: selectedMeta?.nextAction ?? selectedSchedule?.nextAction ?? '',
      },
    );
  };

  const createFolder = async () => {
    if (!canManageFolders) {
      setFolderManageError('���� ������ ������ ��忡���� ����� �� �ֽ��ϴ�.');
      return;
    }
    const safeName = String(newFolderName || '').trim();
    if (!safeName) {
      setFolderManageError('�� ���� �̸��� �Է����ּ���.');
      return;
    }
    setIsCreatingFolder(true);
    setFolderManageError('');
    try {
      await createPublicFolder({ name: safeName, parentId: newFolderParentId || null });
      setNewFolderName('');
      await loadFolders();
      setListReloadToken((v) => v + 1);
    } catch (error) {
      setFolderManageError(error?.message || '������ �������� ���߽��ϴ�.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const deleteSelectedFolder = async () => {
    if (!canManageFolders) {
      setFolderManageError('���� ������ ������ ��忡���� ����� �� �ֽ��ϴ�.');
      return;
    }
    if (selectedFolderId === ALL_FOLDERS_ID || selectedFolderId === PUBLIC_UNCATEGORIZED_FOLDER_ID) {
      setFolderManageError('��ü/�̺з� ������ ������ �� �����ϴ�.');
      return;
    }
    const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
    if (!selectedFolder) {
      setFolderManageError('������ ������ ã�� �� �����ϴ�.');
      return;
    }
    const doConfirm = typeof onConfirm === 'function'
      ? () => onConfirm(`���� '${selectedFolder.path || selectedFolder.name}'�� �����ұ��?`, { title: '���� Ȯ��', confirmText: '����', cancelText: '���' })
      : () => Promise.resolve(window.confirm(`���� '${selectedFolder.path || selectedFolder.name}'�� �����ұ��?`));
    const confirmed = await doConfirm();
    if (!confirmed) return;

    setIsDeletingFolder(true);
    setFolderManageError('');
    try {
      await deletePublicFolder(selectedFolder.id);
      setSelectedFolderId(ALL_FOLDERS_ID);
      await loadFolders();
      setListReloadToken((v) => v + 1);
    } catch (error) {
      setFolderManageError(error?.message || '������ �������� ���߽��ϴ�.');
    } finally {
      setIsDeletingFolder(false);
    }
  };

  const moveFolderOrder = async (folder, direction) => {
    if (!canManageFolders) {
      setFolderManageError('���� ���� ������ ������ ��忡���� ����� �� �ֽ��ϴ�.');
      return;
    }

    const folderId = String(folder?.id || '').trim();
    if (!folderId) return;

    const safeDirection = String(direction || '').trim().toLowerCase();
    const moveState = folderMoveStateById.get(folderId);
    if (!moveState) {
      setFolderManageError('������ ������ ã�� �� �����ϴ�.');
      return;
    }
    if ((safeDirection === 'up' && !moveState.canMoveUp) || (safeDirection === 'down' && !moveState.canMoveDown)) {
      return;
    }

    setMovingFolderId(folderId);
    setFolderManageError('');
    try {
      await reorderPublicFolder(folderId, safeDirection);
      await loadFolders();
    } catch (error) {
      setFolderManageError(error?.message || '���� ������ �������� ���߽��ϴ�.');
    } finally {
      setMovingFolderId('');
    }
  };

  const normalizeScheduleRecord = useCallback((record, patch = {}) => {
    const base = record && typeof record === 'object' ? record : {};
    const next = patch && typeof patch === 'object' ? patch : {};
    const overviewSource = Object.prototype.hasOwnProperty.call(next, 'overview')
      ? { overview: next.overview }
      : Object.prototype.hasOwnProperty.call(base, 'overview')
        ? { overview: base.overview }
        : null;
    const activitySource = Object.prototype.hasOwnProperty.call(next, 'activityLog')
      ? next.activityLog
      : Object.prototype.hasOwnProperty.call(next, 'recentActivity')
        ? next.recentActivity
        : base.activityLog ?? base.recentActivity ?? [];

    const normalized = {
      ...base,
      ...next,
      status: normalizePublicScheduleStatus(next.status ?? base.status),
      holdingReason: String(next.holdingReason ?? base.holdingReason ?? '').trim(),
      nextAction: String(next.nextAction ?? base.nextAction ?? '').trim(),
      recentActivity: normalizeBoardActivity(activitySource).slice(0, 5),
    };

    if (overviewSource) {
      normalized.overview = normalizeBoardOverview(overviewSource);
    }

    if (Object.prototype.hasOwnProperty.call(next, 'activityLog') || Object.prototype.hasOwnProperty.call(base, 'activityLog')) {
      normalized.activityLog = normalizeBoardActivity(next.activityLog ?? base.activityLog ?? []);
    }

    if (Object.prototype.hasOwnProperty.call(next, 'updatedAt') || Object.prototype.hasOwnProperty.call(base, 'updatedAt')) {
      const updatedAt = Number(next.updatedAt ?? next.updated_at ?? base.updatedAt ?? base.updated_at);
      normalized.updatedAt = Number.isFinite(updatedAt) ? updatedAt : base.updatedAt ?? base.updated_at ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(next, 'createdAt') || Object.prototype.hasOwnProperty.call(base, 'createdAt')) {
      const createdAt = Number(next.createdAt ?? next.created_at ?? base.createdAt ?? base.created_at);
      normalized.createdAt = Number.isFinite(createdAt) ? createdAt : base.createdAt ?? base.created_at ?? null;
    }

    return normalized;
  }, []);

  const applySchedulePatchLocally = useCallback((scheduleId, patch = {}) => {
    const safeId = String(scheduleId || '').trim();
    if (!safeId) return;

    setItems((prev) =>
      prev.map((row) => (String(row?.id || '').trim() === safeId ? normalizeScheduleRecord(row, patch) : row)),
    );
    setSelectedMeta((prev) =>
      prev && String(prev?.id || '').trim() === safeId ? normalizeScheduleRecord(prev, patch) : prev,
    );
    setSelectedSchedule((prev) => {
      if (!prev || selectedIdRef.current !== safeId) return prev;
      return normalizeScheduleRecord(prev, patch);
    });
  }, [normalizeScheduleRecord]);

  const updateScheduleMeta = useCallback(
    async (item, patch, { errorMessage = '������Ʈ ������ �������� ���߽��ϴ�.', stateKey = 'meta' } = {}) => {
      if (!canManageFolders) {
        setListError('������Ʈ ��Ÿ ���� ������ ������ ��忡���� ����� �� �ֽ��ϴ�.');
        return null;
      }

      const scheduleId = String(item?.id || '').trim();
      if (!scheduleId) return null;

      const busySetter =
        stateKey === 'status'
          ? setUpdatingStatusBySchedule
          : stateKey === 'folder'
            ? setMovingFolderBySchedule
            : setSavingMetaBySchedule;

      busySetter((prev) => ({ ...prev, [scheduleId]: true }));
      setListError('');

      try {
        const result = await updatePublicSchedule(scheduleId, patch);
        const normalizedPatch = {
          ...patch,
          ...result,
          status: normalizePublicScheduleStatus(result?.status ?? patch?.status ?? item?.status),
          holdingReason: String(result?.holdingReason ?? patch?.holdingReason ?? item?.holdingReason ?? '').trim(),
          nextAction: String(result?.nextAction ?? patch?.nextAction ?? item?.nextAction ?? '').trim(),
          updatedByEmail: result?.updatedByEmail ?? result?.updated_by_email ?? item?.updatedByEmail ?? item?.updated_by_email ?? '',
          createdByEmail: result?.createdByEmail ?? result?.created_by_email ?? item?.createdByEmail ?? item?.created_by_email ?? '',
          activityLog: normalizeBoardActivity(result?.activityLog ?? result?.recentActivity ?? item?.activityLog ?? item?.recentActivity ?? []),
          recentActivity: normalizeBoardActivity(result?.recentActivity ?? result?.activityLog ?? item?.recentActivity ?? item?.activityLog ?? []),
          overview: result?.overview ?? item?.overview ?? null,
          updatedAt: Number(result?.updatedAt ?? result?.updated_at ?? item?.updatedAt ?? item?.updated_at),
        };
        applySchedulePatchLocally(scheduleId, normalizedPatch);
        return normalizedPatch;
      } catch (error) {
        setListError(error?.message || errorMessage);
        return null;
      } finally {
        busySetter((prev) => {
          const next = { ...prev };
          delete next[scheduleId];
          return next;
        });
      }
    },
    [applySchedulePatchLocally, canManageFolders],
  );

  const changeScheduleFolder = async (item, nextFolderIdRaw) => {
    if (!canManageFolders) {
      setListError('���� �̵��� ������ ��忡���� ����� �� �ֽ��ϴ�.');
      return;
    }

    const scheduleId = String(item?.id || '').trim();
    if (!scheduleId) return;

    const currentFolderSelectValue = String(item?.folderId || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID;
    const nextFolderSelectValue = String(nextFolderIdRaw || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID;
    if (currentFolderSelectValue === nextFolderSelectValue) return;

    setMovingFolderBySchedule((prev) => ({ ...prev, [scheduleId]: true }));
    setListError('');
    try {
      const result = await updatePublicScheduleFolder(scheduleId, nextFolderSelectValue);
      const resultFolderIdRaw = String(result?.folderId || '').trim();
      const resultFolderId = resultFolderIdRaw || null;
      const resultFolderSelectValue = resultFolderIdRaw || PUBLIC_UNCATEGORIZED_FOLDER_ID;
      const resultFolderPath =
        String(result?.folderPath || '').trim() || String(folderPathById.get(resultFolderSelectValue) || '').trim();
      applySchedulePatchLocally(scheduleId, {
        folderId: resultFolderId,
        folderPath: resultFolderPath,
        updatedAt: Number(result?.updatedAt ?? result?.updated_at),
        updatedByEmail: result?.updatedByEmail ?? result?.updated_by_email ?? item?.updatedByEmail ?? '',
        activityLog: normalizeBoardActivity(result?.activityLog ?? result?.recentActivity ?? item?.activityLog ?? item?.recentActivity ?? []),
        recentActivity: normalizeBoardActivity(result?.recentActivity ?? item?.recentActivity ?? []),
        overview: result?.overview ?? item?.overview ?? null,
      });
      setListReloadToken((v) => v + 1);
    } catch (error) {
      setListError(error?.message || '������Ʈ ������ �������� ���߽��ϴ�.');
    } finally {
      setMovingFolderBySchedule((prev) => {
        const next = { ...prev };
        delete next[scheduleId];
        return next;
      });
    }
  };

  const changeScheduleStatus = async (item, nextStatusRaw) => {
    if (!canManageFolders) {
      setListError('ĭ�� ���� ������ ������ ��忡���� ����� �� �ֽ��ϴ�.');
      return;
    }

    const scheduleId = String(item?.id || '').trim();
    if (!scheduleId) return;

    const currentStatus = normalizePublicScheduleStatus(item?.status);
    const nextStatus = normalizePublicScheduleStatus(nextStatusRaw);
    if (currentStatus === nextStatus) return;

    await updateScheduleMeta(item, { status: nextStatus }, { errorMessage: '������Ʈ ���¸� �������� ���߽��ϴ�.', stateKey: 'status' });
  };

  const deleteSchedule = async (item) => {
    if (!canManageFolders) {
      setListError('���� ������ ������ ��忡���� ����� �� �ֽ��ϴ�.');
      return;
    }

    const scheduleId = String(item?.id || selectedId || '').trim();
    if (!scheduleId) return;

    const scheduleName = String(item?.name || item?.title || selectedSchedule?.name || selectedMeta?.name || '').trim() || '���� ����';
    const doConfirm = typeof onConfirm === 'function'
      ? () => onConfirm(`���� '${scheduleName}'�� �����ұ��?`, { title: '���� Ȯ��', confirmText: '����', cancelText: '���' })
      : () => Promise.resolve(window.confirm(`���� '${scheduleName}'�� �����ұ��?`));
    const confirmed = await doConfirm();
    if (!confirmed) return;

    setDeletingScheduleId(scheduleId);
    setListError('');
    setScheduleError('');
    try {
      await deletePublicSchedule(scheduleId);
      setItems((prev) => prev.filter((row) => String(row?.id || '').trim() !== scheduleId));

      if (selectedId === scheduleId) {
        setContentView('list');
        setSelectedId('');
        setSelectedMeta(null);
        setSelectedSchedule(null);
      }

      await loadFolders();
      setListReloadToken((v) => v + 1);
    } catch (error) {
      const message = error?.message || '������ �������� ���߽��ϴ�.';
      setListError(message);
      if (selectedId === scheduleId) setScheduleError(message);
    } finally {
      setDeletingScheduleId('');
    }
  };

  const closeFolderAdminModal = useCallback(() => {
    setFolderManageError('');
    setIsFolderAdminModalOpen(false);
  }, []);

  const clearTeamLeadFilters = useCallback(() => {
    setTeamLeadAssigneeFilter('');
    setTeamLeadDepartmentFilter('');
    setTeamLeadRiskFilter('all');
  }, []);
  const toggleFolderPanel = useCallback(() => {
    setIsFolderPanelCollapsed((prev) => !prev);
  }, []);
  const openFolderAdminModal = useCallback(() => {
    setFolderManageError('');
    setIsFolderAdminModalOpen(true);
  }, []);
  const handlePreviewZoomChange = useCallback(
    (delta) => {
      setPreviewZoomSettings((prev) => ({
        ...(prev || {}),
        [previewViewMode]: clampZoom((prev?.[previewViewMode] ?? 100) + delta),
      }));
    },
    [previewViewMode],
  );
  const handlePreviewRangeChange = useCallback(
    (side, value) => {
      const safeValue = Math.max(0, Number(value) || 0);
      setPreviewRangePadding((prev) => ({
        ...mergeRangePadding(prev),
        [previewViewMode]: {
          ...mergeRangePadding(prev)[previewViewMode],
          [side]: safeValue,
        },
      }));
    },
    [previewViewMode],
  );
  const handlePreviewFitChange = useCallback(
    (enabledValue) => {
      setPreviewFitSettings((prev) => ({
        ...sanitizeFitSettings(prev),
        [previewViewMode]: { enabled: !!enabledValue },
      }));
    },
    [previewViewMode],
  );

  const zoomValue = clampZoom(previewZoomSettings?.[previewViewMode] ?? 100);
  const rangePadding = previewRangePadding?.[previewViewMode] || { before: 0, after: 0 };
  const fitEnabled = (previewFitSettings?.[previewViewMode] || {}).enabled || false;
  const rangeUnit = previewViewMode === 'Day' ? '��' : previewViewMode === 'Week' ? '��' : '����';
  const selectedFolderForAdmin = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) || null,
    [folders, selectedFolderId],
  );
  const folderNavigationItems = useMemo(() => {
    if (!supportsFolders) return [];
    const base = folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      path: folder.path,
      depth: folder.depth,
      projectCount: Number(folder?.projectCount ?? 0) || 0,
    }));
    return [
      ...base,
      {
        id: PUBLIC_UNCATEGORIZED_FOLDER_ID,
        name: '�̺з�',
        path: '�̺з�',
        depth: 1,
        projectCount: 0,
      },
    ];
  }, [supportsFolders, folders]);
  const selectedFolderSummary = useMemo(() => {
    if (!supportsFolders) {
      return {
        id: ALL_FOLDERS_ID,
        name: '���� ����',
        path: '��ü ����',
        depth: 1,
        projectCount: items.length,
      };
    }
    if (selectedFolderId === PUBLIC_UNCATEGORIZED_FOLDER_ID) {
      return {
        id: PUBLIC_UNCATEGORIZED_FOLDER_ID,
        name: '�̺з�',
        path: '�̺з�',
        depth: 1,
        projectCount: items.length,
      };
    }
    return (
      folderNavigationItems.find((folder) => folder.id === selectedFolderId) || {
        id: selectedFolderId || ALL_FOLDERS_ID,
        name: selectedFolderDisplayName,
        path: selectedFolderDisplayName,
        depth: 1,
        projectCount: items.length,
      }
    );
  }, [supportsFolders, selectedFolderId, selectedFolderDisplayName, folderNavigationItems, items.length]);

  const boardItems = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : [];
    return safeItems
      .filter((item) => !sharedModeId || String(item?.id || '').trim() === sharedModeId)
      .map((item) =>
        normalizeScheduleRecord(item, {
          overview: item?.overview ?? null,
          activityLog: item?.activityLog ?? item?.recentActivity ?? [],
          recentActivity: item?.recentActivity ?? item?.activityLog ?? [],
          holdingReason: item?.holdingReason ?? '',
          nextAction: item?.nextAction ?? '',
        }),
      );
  }, [items, normalizeScheduleRecord, sharedModeId]);

  const teamLeadFilterOptions = useMemo(() => collectTeamLeadFilterOptions(boardItems), [boardItems]);

  useEffect(() => {
    if (teamLeadAssigneeFilter && !teamLeadFilterOptions.assignees.includes(teamLeadAssigneeFilter)) {
      setTeamLeadAssigneeFilter('');
    }
  }, [teamLeadAssigneeFilter, teamLeadFilterOptions.assignees]);

  useEffect(() => {
    if (teamLeadDepartmentFilter && !teamLeadFilterOptions.departments.includes(teamLeadDepartmentFilter)) {
      setTeamLeadDepartmentFilter('');
    }
  }, [teamLeadDepartmentFilter, teamLeadFilterOptions.departments]);

  const filteredBoardItems = useMemo(
    () =>
      filterTeamLeadSchedules(boardItems, {
        assignee: teamLeadAssigneeFilter,
        department: teamLeadDepartmentFilter,
        risk: teamLeadRiskFilter,
      }),
    [boardItems, teamLeadAssigneeFilter, teamLeadDepartmentFilter, teamLeadRiskFilter],
  );

  const teamLeadStats = useMemo(() => buildTeamLeadStats(filteredBoardItems), [filteredBoardItems]);

  const kanbanColumns = useMemo(() => {
    const grouped = new Map(PUBLIC_SCHEDULE_STATUS_ORDER.map((status) => [status, []]));
    filteredBoardItems.forEach((item) => {
      const status = normalizePublicScheduleStatus(item?.status);
      grouped.get(status).push(item);
    });
    return KANBAN_COLUMNS.map((column) => ({
      ...column,
      items: grouped.get(column.id) || [],
      itemCount: (grouped.get(column.id) || []).length,
    }));
  }, [filteredBoardItems]);

  const selectedBoardState = useMemo(
    () =>
      normalizeScheduleRecord(
        {
          ...(selectedMeta && typeof selectedMeta === 'object' ? selectedMeta : {}),
          ...(selectedSchedule && typeof selectedSchedule === 'object' ? selectedSchedule : {}),
        },
        {
          overview: selectedSchedule?.overview ?? selectedMeta?.overview ?? null,
          activityLog: selectedSchedule?.activityLog ?? selectedMeta?.activityLog ?? selectedMeta?.recentActivity ?? [],
          recentActivity: selectedSchedule?.recentActivity ?? selectedMeta?.recentActivity ?? [],
          holdingReason: selectedSchedule?.holdingReason ?? selectedMeta?.holdingReason ?? '',
          nextAction: selectedSchedule?.nextAction ?? selectedMeta?.nextAction ?? '',
        },
      ),
    [normalizeScheduleRecord, selectedMeta, selectedSchedule],
  );

  const selectedOverview = useMemo(() => normalizeBoardOverview(selectedBoardState), [selectedBoardState]);
  const selectedActivityLog = useMemo(
    () => normalizeBoardActivity(selectedBoardState?.activityLog ?? selectedBoardState?.recentActivity ?? []),
    [selectedBoardState],
  );
  const updateHoldingReasonDraft = useCallback((scheduleId, value) => {
    const safeId = String(scheduleId || '').trim();
    if (!safeId) return;
    setHoldingReasonDrafts((prev) => ({ ...prev, [safeId]: value }));
  }, []);

  const updateNextActionDraft = useCallback((scheduleId, value) => {
    const safeId = String(scheduleId || '').trim();
    if (!safeId) return;
    setNextActionDrafts((prev) => ({ ...prev, [safeId]: value }));
  }, []);

  const saveHoldingReason = useCallback(
    async (item) => {
      const scheduleId = String(item?.id || '').trim();
      if (!scheduleId) return;
      const nextValue = String(
        Object.prototype.hasOwnProperty.call(holdingReasonDrafts, scheduleId)
          ? holdingReasonDrafts[scheduleId]
          : item?.holdingReason ?? '',
      ).trim();
      const currentValue = String(item?.holdingReason ?? '').trim();
      if (nextValue === currentValue) return;
      await updateScheduleMeta(item, { holdingReason: nextValue }, { errorMessage: 'Holding ������ �������� ���߽��ϴ�.' });
    },
    [holdingReasonDrafts, updateScheduleMeta],
  );

  const saveNextAction = useCallback(
    async (item) => {
      const scheduleId = String(item?.id || '').trim();
      if (!scheduleId) return;
      const nextValue = String(
        Object.prototype.hasOwnProperty.call(nextActionDrafts, scheduleId)
          ? nextActionDrafts[scheduleId]
          : item?.nextAction ?? '',
      ).trim();
      const currentValue = String(item?.nextAction ?? '').trim();
      if (nextValue === currentValue) return;
      await updateScheduleMeta(item, { nextAction: nextValue }, { errorMessage: '���� �׼��� �������� ���߽��ϴ�.' });
    },
    [nextActionDrafts, updateScheduleMeta],
  );

  if (!enabled) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">���� ���� ����� ��Ȱ��ȭ�Ǿ� �ֽ��ϴ�.</h2>
            <p className="mt-1 text-sm text-slate-500">
              <code>VITE_PUBLIC_SCHEDULES_API_BASE</code> ȯ�� ������ ������ �� �ٽ� �������ּ���.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 ${contentView === 'list' ? 'flex-col gap-4 lg:flex-row' : 'flex-col gap-4'}`}>
      {contentView === 'list' ? (
        <>
          <PublicSchedulesSidebar
            isCollapsed={isFolderPanelCollapsed}
            supportsFolders={supportsFolders}
            isLoadingFolders={isLoadingFolders}
            canManageFolders={canManageFolders}
            sharedModeId={sharedModeId}
            folderNavigationItems={folderNavigationItems}
            selectedFolderId={selectedFolderId}
            selectedItemCount={items.length}
            foldersError={foldersError}
            onToggleCollapse={toggleFolderPanel}
            onOpenFolderAdmin={openFolderAdminModal}
            onSelectFolder={setSelectedFolderId}
          />

          <section className="glass-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <PublicSchedulesBoardHeader
              selectedFolderSummary={selectedFolderSummary}
              sharedModeId={sharedModeId}
              boardCount={boardItems.length}
              filteredCount={filteredBoardItems.length}
              query={query}
              onQueryChange={setQuery}
              stats={teamLeadStats}
              filterOptions={teamLeadFilterOptions}
              assigneeFilter={teamLeadAssigneeFilter}
              departmentFilter={teamLeadDepartmentFilter}
              riskFilter={teamLeadRiskFilter}
              onAssigneeChange={setTeamLeadAssigneeFilter}
              onDepartmentChange={setTeamLeadDepartmentFilter}
              onRiskChange={setTeamLeadRiskFilter}
              onClearFilters={clearTeamLeadFilters}
            />

            {isFolderPanelCollapsed && foldersError ? (
              <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{foldersError}</div>
            ) : null}
            {listError && <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{listError}</div>}
            {!canImport && (
              <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                �α��� ������ ���� ��ȸ�� �����մϴ�. ����/��������� �α��� �� ����� �� �ֽ��ϴ�.
              </div>
            )}

            <div className="custom-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(241,245,249,0.82)_100%)] px-4 py-3 sm:px-5 sm:py-4">
              <PublicSchedulesKanbanBoard
                columns={kanbanColumns}
                isLoading={isLoadingList}
                cardProps={{
                  selectedId,
                  isMobileViewport,
                  canManage: canManageFolders,
                  supportsFolders,
                  deletingScheduleId,
                  movingFolderBySchedule,
                  updatingStatusBySchedule,
                  savingMetaBySchedule,
                  holdingReasonDrafts,
                  nextActionDrafts,
                  folderSelectOptions,
                  employeeDirectory,
                  buildEmployeeDisplay,
                  onOpenPreview: openPreview,
                  onDeleteSchedule: deleteSchedule,
                  onChangeScheduleStatus: changeScheduleStatus,
                  onChangeScheduleFolder: changeScheduleFolder,
                  onHoldingReasonDraftChange: updateHoldingReasonDraft,
                  onNextActionDraftChange: updateNextActionDraft,
                  onSaveHoldingReason: saveHoldingReason,
                  onSaveNextAction: saveNextAction,
                }}
              />
            </div>

            {hasMore && (
              <div className="border-t border-slate-200/70 px-4 py-3">
                <button
                  type="button"
                  onClick={() => void fetchSchedulesPage({ offset: nextOffset, append: true })}
                  disabled={isLoadingMore || isLoadingList}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingMore ? '�ҷ����� ��...' : '�� ����'}
                </button>
              </div>
            )}
          </section>
      </>
      ) : (
        <section className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200/70 px-5 py-4">
            <button type="button" onClick={() => setContentView('list')} className="inline-flex w-fit items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
              {'<'} �����
            </button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold tracking-tight text-slate-900">{selectedBoardState?.name || selectedSchedule?.name || '�̸�����'}</h2>
                <p className="mt-1 text-xs text-slate-500">{selectedSchedule ? `�۾� ${selectedSchedule.tasks.length}��` : '��Ͽ��� ������ �����ϼ���.'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canManageFolders && (
                  <button
                    type="button"
                    onClick={() => void deleteSchedule(selectedMeta || { id: selectedId, name: selectedSchedule?.name })}
                    disabled={!selectedSchedule || deletingScheduleId === selectedId}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 size={18} /> {deletingScheduleId === selectedId ? '���� ��...' : '����'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={importSelectedSchedule}
                  disabled={!selectedSchedule || !canImport}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  title={!canImport ? '��������� �α��� �� ����� �� �ֽ��ϴ�.' : undefined}
                >
                  <Download size={18} /> {canImport ? '��������' : '�������� (�α��� �ʿ�)'}
                </button>
              </div>
            </div>
          </div>

          {scheduleError && <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{scheduleError}</div>}
          {!selectedSchedule && !isLoadingSchedule && !scheduleError && <div className="flex-1 px-5 py-8 text-sm text-slate-500">������Ʈ ī�带 �����ϸ� �̸����Ⱑ ǥ�õ˴ϴ�.</div>}
          {isLoadingSchedule && <div className="flex-1 px-5 py-8 text-sm text-slate-400">������ �ҷ����� ��...</div>}

          {selectedSchedule && (
            <>
              <PublicSchedulePreviewSummary
                previewHistoryItems={previewHistoryItems}
                selectedOverview={selectedOverview}
                selectedActivityLog={selectedActivityLog}
                selectedId={selectedId}
                selectedBoardState={selectedBoardState}
                canManage={canManageFolders}
                holdingReasonDrafts={holdingReasonDrafts}
                nextActionDrafts={nextActionDrafts}
                savingMetaBySchedule={savingMetaBySchedule}
                employeeDirectory={employeeDirectory}
                buildEmployeeDisplay={buildEmployeeDisplay}
                summarizeActivityDate={summarizeActivityDate}
                onHoldingReasonDraftChange={updateHoldingReasonDraft}
                onNextActionDraftChange={updateNextActionDraft}
                onSaveHoldingReason={saveHoldingReason}
                onSaveNextAction={saveNextAction}
              />

              {previewTab === 'schedule' ? (
                <>
                  <PublicSchedulePreviewToolbar
                    previewFilterText={previewFilterText}
                    onPreviewFilterChange={setPreviewFilterText}
                    previewViewMode={previewViewMode}
                    onPreviewViewModeChange={setPreviewViewMode}
                    viewModeLabels={VIEW_MODE_LABELS}
                    zoomValue={zoomValue}
                    onZoomOut={() => handlePreviewZoomChange(-10)}
                    onZoomIn={() => handlePreviewZoomChange(10)}
                    rangePadding={rangePadding}
                    rangeUnit={rangeUnit}
                    onRangeBeforeChange={(value) => handlePreviewRangeChange('before', value)}
                    onRangeAfterChange={(value) => handlePreviewRangeChange('after', value)}
                    fitEnabled={fitEnabled}
                    onFitChange={handlePreviewFitChange}
                  />

                  <div className="min-h-0 flex-1 p-4">
                    <div className="h-full min-h-[340px] min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <GanttChart
                        tasks={filteredPreviewTasks}
                        vacations={selectedSchedule.vacations}
                        viewMode={previewViewMode}
                        rangePadding={rangePadding}
                        fitEnabled={fitEnabled}
                        zoom={zoomValue / 100}
                        compactMode={isMobileViewport}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                  <Dashboard tasks={selectedSchedule.tasks} projectName={selectedSchedule.name} />
                </div>
              )}
            </>
          )}
        </section>
      )}

      <FolderAdminModal
        isOpen={canManageFolders && isFolderAdminModalOpen}
        onClose={closeFolderAdminModal}
        folderManageError={folderManageError}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        newFolderParentId={newFolderParentId}
        setNewFolderParentId={setNewFolderParentId}
        isCreatingFolder={isCreatingFolder}
        isDeletingFolder={isDeletingFolder}
        movingFolderId={movingFolderId}
        folders={folders}
        selectedFolderForAdmin={selectedFolderForAdmin}
        selectedFolderId={selectedFolderId}
        setSelectedFolderId={setSelectedFolderId}
        createFolder={createFolder}
        deleteSelectedFolder={deleteSelectedFolder}
        moveFolderOrder={moveFolderOrder}
        folderMoveStateById={folderMoveStateById}
      />
    </div>
  );
}

export default PublicSchedules;

