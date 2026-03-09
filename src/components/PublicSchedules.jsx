import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Plus, Search, Trash2, Users, XIcon } from './Icons';
import GanttChart from './GanttChart';
import Dashboard from './Dashboard';
import Modal from './Modal';
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
  TEAM_LEAD_RISK_FILTERS,
  buildTeamLeadStats,
  collectTeamLeadFilterOptions,
  filterTeamLeadSchedules,
  formatOverviewDate,
  getRiskToneClass,
  normalizeBoardActivity,
  normalizeBoardOverview,
  summarizeActivityDate,
} from '../utils/publicSchedulesBoard';
import { isPlainObject, clampZoom, buildFolderSelectOptions as buildFolderSelectOptionsBase } from '../utils/shared';

const ALL_FOLDERS_ID = '__all_folders__';
const PAGE_SIZE = 40;
const VIEW_MODE_LABELS = {
  Day: '일 (Day)',
  Week: '주 (Week)',
  Month: '월 (Month)',
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
      name: String(fallbackName || '제목 없음').trim() || '제목 없음',
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
    throw new Error('일정 데이터 형식이 올바르지 않습니다.');
  }

  return {
    name: String(payload.name || fallbackName || '제목 없음').trim() || '제목 없음',
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

  const folderSelectOptions = useMemo(() => buildFolderSelectOptions(folders), [folders]);

  const folderPathById = useMemo(() => {
    const map = new Map();
    folderSelectOptions.forEach((item) => {
      map.set(String(item.id || '').trim(), String(item.path || '').trim());
    });
    return map;
  }, [folderSelectOptions]);

  const selectedFolderDisplayName = useMemo(() => {
    if (!supportsFolders || selectedFolderId === ALL_FOLDERS_ID) return '전체';
    if (selectedFolderId === PUBLIC_UNCATEGORIZED_FOLDER_ID) return '미분류';
    const selected = folders.find((folder) => folder.id === selectedFolderId);
    return selected?.path || selected?.name || '전체';
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
        setFoldersError('현재 서버 버전은 폴더 트리를 지원하지 않습니다.');
      } else {
        setFoldersError(error?.message || '폴더 목록을 불러오지 못했습니다.');
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
        setListError(error?.message || '공개 일정 목록을 불러오지 못했습니다.');
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
      setScheduleError(error?.message || '일정을 불러오지 못했습니다.');
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
      (folderId ? folderId : '미분류');
    const createdAt = formatDateTime(meta.createdAt ?? meta.created_at);
    const updatedAt = formatDateTime(meta.updatedAt ?? meta.updated_at);
    const statusLabel = getPublicScheduleStatusLabel(meta.status ?? selectedSchedule?.status);
    const createdByInfo = buildEmployeeDisplay(meta.createdByEmail || meta.created_by_email || '', employeeDirectory);
    const updatedByInfo = buildEmployeeDisplay(meta.updatedByEmail || meta.updated_by_email || '', employeeDirectory);

    return [
      { label: '폴더', value: folderPath || '미분류' },
      { label: '상태', value: statusLabel },
      { label: '등록', value: createdAt || '-' },
      { label: '수정', value: updatedAt || '-' },
      { label: '게시자', value: createdByInfo.profile || createdByInfo.email || '-' },
      { label: '최종 수정자', value: updatedByInfo.profile || updatedByInfo.email || '-' },
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
      setFolderManageError('폴더 관리는 관리자 모드에서만 사용할 수 있습니다.');
      return;
    }
    const safeName = String(newFolderName || '').trim();
    if (!safeName) {
      setFolderManageError('새 폴더 이름을 입력해주세요.');
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
      setFolderManageError(error?.message || '폴더를 생성하지 못했습니다.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const deleteSelectedFolder = async () => {
    if (!canManageFolders) {
      setFolderManageError('폴더 관리는 관리자 모드에서만 사용할 수 있습니다.');
      return;
    }
    if (selectedFolderId === ALL_FOLDERS_ID || selectedFolderId === PUBLIC_UNCATEGORIZED_FOLDER_ID) {
      setFolderManageError('전체/미분류 폴더는 삭제할 수 없습니다.');
      return;
    }
    const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
    if (!selectedFolder) {
      setFolderManageError('선택한 폴더를 찾을 수 없습니다.');
      return;
    }
    const doConfirm = typeof onConfirm === 'function'
      ? () => onConfirm(`폴더 '${selectedFolder.path || selectedFolder.name}'를 삭제할까요?`, { title: '삭제 확인', confirmText: '삭제', cancelText: '취소' })
      : () => Promise.resolve(window.confirm(`폴더 '${selectedFolder.path || selectedFolder.name}'를 삭제할까요?`));
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
      setFolderManageError(error?.message || '폴더를 삭제하지 못했습니다.');
    } finally {
      setIsDeletingFolder(false);
    }
  };

  const moveFolderOrder = async (folder, direction) => {
    if (!canManageFolders) {
      setFolderManageError('폴더 순서 변경은 관리자 모드에서만 사용할 수 있습니다.');
      return;
    }

    const folderId = String(folder?.id || '').trim();
    if (!folderId) return;

    const safeDirection = String(direction || '').trim().toLowerCase();
    const moveState = folderMoveStateById.get(folderId);
    if (!moveState) {
      setFolderManageError('선택한 폴더를 찾을 수 없습니다.');
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
      setFolderManageError(error?.message || '폴더 순서를 변경하지 못했습니다.');
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
      if (!prev || !selectedId || selectedId !== safeId) return prev;
      return normalizeScheduleRecord(prev, patch);
    });
  }, [normalizeScheduleRecord, selectedId]);

  const updateScheduleMeta = useCallback(
    async (item, patch, { errorMessage = '프로젝트 정보를 저장하지 못했습니다.', stateKey = 'meta' } = {}) => {
      if (!canManageFolders) {
        setListError('프로젝트 메타 정보 수정은 관리자 모드에서만 사용할 수 있습니다.');
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
      setListError('폴더 이동은 관리자 모드에서만 사용할 수 있습니다.');
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
      setListError(error?.message || '프로젝트 폴더를 변경하지 못했습니다.');
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
      setListError('칸반 상태 변경은 관리자 모드에서만 사용할 수 있습니다.');
      return;
    }

    const scheduleId = String(item?.id || '').trim();
    if (!scheduleId) return;

    const currentStatus = normalizePublicScheduleStatus(item?.status);
    const nextStatus = normalizePublicScheduleStatus(nextStatusRaw);
    if (currentStatus === nextStatus) return;

    await updateScheduleMeta(item, { status: nextStatus }, { errorMessage: '프로젝트 상태를 변경하지 못했습니다.', stateKey: 'status' });
  };

  const deleteSchedule = async (item) => {
    if (!canManageFolders) {
      setListError('일정 삭제는 관리자 모드에서만 사용할 수 있습니다.');
      return;
    }

    const scheduleId = String(item?.id || selectedId || '').trim();
    if (!scheduleId) return;

    const scheduleName = String(item?.name || item?.title || selectedSchedule?.name || selectedMeta?.name || '').trim() || '제목 없음';
    const doConfirm = typeof onConfirm === 'function'
      ? () => onConfirm(`일정 '${scheduleName}'을 삭제할까요?`, { title: '삭제 확인', confirmText: '삭제', cancelText: '취소' })
      : () => Promise.resolve(window.confirm(`일정 '${scheduleName}'을 삭제할까요?`));
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
      const message = error?.message || '일정을 삭제하지 못했습니다.';
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

  const zoomValue = clampZoom(previewZoomSettings?.[previewViewMode] ?? 100);
  const rangePadding = previewRangePadding?.[previewViewMode] || { before: 0, after: 0 };
  const fitEnabled = (previewFitSettings?.[previewViewMode] || {}).enabled || false;
  const rangeUnit = previewViewMode === 'Day' ? '일' : previewViewMode === 'Week' ? '주' : '개월';
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
        name: '미분류',
        path: '미분류',
        depth: 1,
        projectCount: 0,
      },
    ];
  }, [supportsFolders, folders]);
  const selectedFolderSummary = useMemo(() => {
    if (!supportsFolders) {
      return {
        id: ALL_FOLDERS_ID,
        name: '공개 일정',
        path: '전체 일정',
        depth: 1,
        projectCount: items.length,
      };
    }
    if (selectedFolderId === PUBLIC_UNCATEGORIZED_FOLDER_ID) {
      return {
        id: PUBLIC_UNCATEGORIZED_FOLDER_ID,
        name: '미분류',
        path: '미분류',
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
      await updateScheduleMeta(item, { holdingReason: nextValue }, { errorMessage: 'Holding 사유를 저장하지 못했습니다.' });
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
      await updateScheduleMeta(item, { nextAction: nextValue }, { errorMessage: '다음 액션을 저장하지 못했습니다.' });
    },
    [nextActionDrafts, updateScheduleMeta],
  );

  const renderProjectCard = (item, toneOverride = null) => {
    const id = String(item?.id || '').trim();
    const name = String(item?.name || item?.title || '').trim() || '제목 없음';
    const tasksCount = Number(item?.tasksCount ?? item?.taskCount ?? 0) || 0;
    const overview = normalizeBoardOverview(item);
    const recentActivity = normalizeBoardActivity(item?.recentActivity ?? item?.activityLog ?? []);
    const dueDateLabel = formatOverviewDate(overview.endDate) || '-';
    const updatedAtLabel =
      summarizeActivityDate(overview.lastActivityAt || item?.updatedAt || item?.updated_at) ||
      formatDateTime(item?.updatedAt ?? item?.updated_at) ||
      '-';
    const primaryAssignee = overview.primaryAssignee || overview.assignees.join(', ') || '미지정';
    const departmentLabel = overview.primaryDepartment || overview.departments.join(', ') || '-';
    const isSelected = selectedId && id && selectedId === id;
    const rowFolderIdValue = String(item?.folderId || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID;
    const rowStatusValue = normalizePublicScheduleStatus(item?.status);
    const isMoving = !!movingFolderBySchedule[id];
    const isUpdatingStatus = !!updatingStatusBySchedule[id];
    const isSavingMeta = !!savingMetaBySchedule[id];
    const holdingReasonValue = Object.prototype.hasOwnProperty.call(holdingReasonDrafts, id)
      ? holdingReasonDrafts[id]
      : String(item?.holdingReason || '').trim();
    const nextActionValue = Object.prototype.hasOwnProperty.call(nextActionDrafts, id)
      ? nextActionDrafts[id]
      : String(item?.nextAction || '').trim();
    const revealClassName = isMobileViewport
      ? 'mt-4 space-y-3 opacity-100'
      : 'pointer-events-none mt-0 max-h-0 translate-y-2 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:mt-4 group-hover:max-h-[48rem] group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:mt-4 group-focus-within:max-h-[48rem] group-focus-within:translate-y-0 group-focus-within:opacity-100';
    const riskToneClass = getRiskToneClass(overview) || 'border-white/70';
    const tone = toneOverride || KANBAN_STATUS_TONES[rowStatusValue];

    return (
      <article
        key={id || name}
        className={`group rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${tone?.cardGlow || ''} ${riskToneClass} ${
          isSelected ? 'ring-2 ring-blue-500/80' : ''
        }`}
      >
        <button type="button" onClick={() => openPreview(item)} className="block w-full text-left">
          <h4 className="text-sm font-black leading-5 text-slate-900 break-words transition group-hover:text-blue-700 group-focus-within:text-blue-700">
            {name}
          </h4>
        </button>

        <div className={revealClassName}>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Owner</p>
              <p className="mt-1 font-semibold text-slate-700 break-words">{primaryAssignee}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Progress</p>
              <p className="mt-1 font-semibold text-slate-700">{overview.progress}%</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Due</p>
              <p className="mt-1 font-semibold text-slate-700">{dueDateLabel}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Updated</p>
              <p className="mt-1 font-semibold text-slate-700">{updatedAtLabel}</p>
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${Math.max(4, overview.progress)}%` }} />
          </div>

          <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">작업 {tasksCount}개</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{departmentLabel}</span>
            {(overview.riskLabels.length > 0 ? overview.riskLabels : ['정상']).map((riskLabel) => (
              <span
                key={`${id}-risk-${riskLabel}`}
                className={`rounded-full px-2.5 py-1 ${
                  riskLabel === '지연' || riskLabel === '오늘 마감'
                    ? 'bg-rose-50 text-rose-700'
                    : riskLabel === '이번 주 마감' || riskLabel === '오래 미갱신' || riskLabel === '보류'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {riskLabel}
              </span>
            ))}
          </div>

          <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-[11px]">
            <div>
              <p className="font-bold uppercase tracking-wide text-slate-400">Holding</p>
              {canManageFolders ? (
                <textarea
                  value={holdingReasonValue}
                  onChange={(event) =>
                    setHoldingReasonDrafts((prev) => ({ ...prev, [id]: event.target.value }))
                  }
                  onBlur={() => {
                    void saveHoldingReason(item);
                  }}
                  disabled={isSavingMeta}
                  placeholder="보류 상태라면 멈춘 이유를 적어주세요."
                  className="mt-1 min-h-[68px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
              ) : (
                <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{holdingReasonValue || '-'}</p>
              )}
            </div>
            <div>
              <p className="font-bold uppercase tracking-wide text-slate-400">Next action</p>
              {canManageFolders ? (
                <textarea
                  value={nextActionValue}
                  onChange={(event) =>
                    setNextActionDrafts((prev) => ({ ...prev, [id]: event.target.value }))
                  }
                  onBlur={() => {
                    void saveNextAction(item);
                  }}
                  disabled={isSavingMeta}
                  placeholder="누가 무엇을 하면 다시 진행되는지 적어주세요."
                  className="mt-1 min-h-[68px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
              ) : (
                <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{nextActionValue || '-'}</p>
              )}
            </div>
            {isSavingMeta ? <p className="text-[10px] font-semibold text-amber-600">메타 정보 저장 중...</p> : null}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Recent activity</p>
              <span className="text-[10px] font-semibold text-slate-400">{recentActivity.length}건</span>
            </div>
            {recentActivity.length === 0 ? (
              <p className="mt-2 text-[11px] text-slate-400">최근 활동이 없습니다.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {recentActivity.slice(0, 3).map((entry) => {
                  const actor = buildEmployeeDisplay(entry.actorEmail, employeeDirectory);
                  return (
                    <div key={entry.id || `${id}-${entry.at}`} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold text-slate-700 break-words">{entry.message}</p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {actor.profile || actor.email || '기록자 없음'} · {summarizeActivityDate(entry.at) || '-'}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => openPreview(item)}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-blue-600 hover:text-white"
            >
              일정 보기
            </button>
            {canManageFolders ? (
              <button
                type="button"
                onClick={() => void deleteSchedule(item)}
                disabled={deletingScheduleId === id}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingScheduleId === id ? '삭제 중...' : '삭제'}
              </button>
            ) : null}
          </div>

          {canManageFolders ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label htmlFor={`status-${id}`} className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  상태
                </label>
                <select
                  id={`status-${id}`}
                  value={rowStatusValue}
                  onChange={(event) => {
                    void changeScheduleStatus(item, event.target.value);
                  }}
                  disabled={isUpdatingStatus}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {PUBLIC_SCHEDULE_STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {getPublicScheduleStatusLabel(status)}
                    </option>
                  ))}
                </select>
                {isUpdatingStatus ? <span className="text-[10px] font-semibold text-amber-600">...</span> : null}
              </div>
              {supportsFolders ? (
                <div className="flex items-center gap-2">
                  <label htmlFor={`folder-${id}`} className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    폴더
                  </label>
                  <select
                    id={`folder-${id}`}
                    value={rowFolderIdValue}
                    onChange={(event) => {
                      void changeScheduleFolder(item, event.target.value);
                    }}
                    disabled={isMoving}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {folderSelectOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {isMoving ? <span className="text-[10px] font-semibold text-amber-600">...</span> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>
    );
  };

  if (!enabled) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">공개 일정 기능이 비활성화되어 있습니다.</h2>
            <p className="mt-1 text-sm text-slate-500">
              <code>VITE_PUBLIC_SCHEDULES_API_BASE</code> 환경 변수를 설정한 뒤 다시 실행해주세요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 ${contentView === 'list' ? 'flex-col gap-5 lg:flex-row' : 'flex-col gap-4'}`}>
      {contentView === 'list' ? (
        <>
          <aside
            className={`glass-panel w-full shrink-0 overflow-hidden transition-all duration-300 ${
              isFolderPanelCollapsed ? 'lg:w-[88px]' : 'lg:w-[320px]'
            }`}
          >
            <div className={`border-b border-slate-200/70 ${isFolderPanelCollapsed ? 'px-3 py-3' : 'px-4 py-4'}`}>
              <div className={`flex ${isFolderPanelCollapsed ? 'justify-center' : 'items-start justify-between gap-3'}`}>
                {!isFolderPanelCollapsed ? (
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">폴더 목록</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {supportsFolders ? (isLoadingFolders ? '폴더 로딩 중...' : `${folderNavigationItems.length}개 구분`) : '평면 목록 모드'}
                    </p>
                    {sharedModeId ? <p className="mt-1 text-[11px] font-semibold text-blue-700">공유 원본 ID 고정 모드: {sharedModeId}</p> : null}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={toggleFolderPanel}
                  aria-expanded={!isFolderPanelCollapsed}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {isFolderPanelCollapsed ? '펼치기' : '접기'}
                </button>
              </div>
            </div>

            {isFolderPanelCollapsed ? (
              <div className="flex h-full flex-col items-center gap-3 px-3 py-4">
                <div className="w-full rounded-2xl bg-slate-100 px-2 py-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">폴더</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{folderNavigationItems.length}</p>
                </div>
                <button
                  type="button"
                  disabled={!canManageFolders}
                  title={canManageFolders ? '폴더 관리' : '폴더 관리 (읽기 전용)'}
                  onClick={() => {
                    setFolderManageError('');
                    setIsFolderAdminModalOpen(true);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  관리
                </button>
                {sharedModeId ? (
                  <div className="w-full rounded-xl bg-blue-50 px-2 py-2 text-center text-[10px] font-semibold text-blue-700">ID 고정</div>
                ) : null}
              </div>
            ) : (
              <>
                {foldersError && <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{foldersError}</div>}

                <div className="custom-scrollbar max-h-[50vh] overflow-y-auto px-3 py-3">
                  {folderNavigationItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                      {isLoadingFolders ? '폴더를 불러오는 중...' : '표시할 폴더가 없습니다.'}
                    </div>
                  ) : (
                    folderNavigationItems.map((folder) => {
                      const isSelected = selectedFolderId === folder.id;
                      const projectCount = isSelected ? items.length : Number(folder?.projectCount ?? 0) || 0;
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => setSelectedFolderId(folder.id)}
                          className={`mb-1 flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-sm transition-all duration-200 ${
                            isSelected
                              ? 'bg-blue-50 font-bold text-blue-700 ring-1 ring-inset ring-blue-500/20'
                              : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                          style={{ paddingLeft: `${16 + (Math.max(1, folder.depth) - 1) * 16}px` }}
                        >
                          <span className="truncate">{folder.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                            {projectCount}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-slate-200/70 px-4 py-3">
                  <button
                    type="button"
                    disabled={!canManageFolders}
                    onClick={() => {
                      setFolderManageError('');
                      setIsFolderAdminModalOpen(true);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    폴더 관리 {canManageFolders ? '' : '(읽기 전용)'}
                  </button>
                </div>
              </>
            )}
          </aside>

          <section className="glass-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="border-b border-slate-200/70 px-5 py-5">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                    <Users size={14} />
                    공개 일정 보드
                  </div>
                  <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-900">{selectedFolderSummary.name}</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-500">
                    선택한 폴더의 프로젝트를 상태와 위험 신호 중심으로 빠르게 확인할 수 있습니다.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    <div className="rounded-full bg-slate-100 px-3 py-2">폴더 {selectedFolderSummary.path || selectedFolderSummary.name}</div>
                    <div className="rounded-full bg-slate-100 px-3 py-2">전체 {boardItems.length}개</div>
                    <div className="rounded-full bg-slate-100 px-3 py-2">표시 {filteredBoardItems.length}개</div>
                    {sharedModeId ? <div className="rounded-full bg-blue-50 px-3 py-2 text-blue-700">공유 원본 ID 고정: {sharedModeId}</div> : null}
                  </div>
                </div>

                <div className="w-full xl:max-w-md">
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">검색</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Search size={18} />
                    </span>
                    <input
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={`${selectedFolderSummary.name} 프로젝트 검색`}
                      className="w-full rounded-2xl border-0 bg-slate-100/80 py-3 pl-11 pr-4 text-sm outline-none ring-1 ring-inset ring-slate-200/50 transition-all duration-300 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500 focus:shadow-md"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 xl:max-w-3xl">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Project</p>
                  <p className="mt-2 text-2xl font-black text-slate-900">{teamLeadStats.totalProjects}</p>
                  <p className="mt-1 text-[11px] text-slate-500">현재 필터 기준</p>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-rose-500">Delayed</p>
                  <p className="mt-2 text-2xl font-black text-rose-700">{teamLeadStats.delayed}</p>
                  <p className="mt-1 text-[11px] text-rose-600">오늘 마감 {teamLeadStats.dueToday}</p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Holding</p>
                  <p className="mt-2 text-2xl font-black text-amber-700">{teamLeadStats.holding}</p>
                  <p className="mt-1 text-[11px] text-amber-700">이번 주 마감 {teamLeadStats.dueThisWeek}</p>
                </div>
              </div>

              <div className="mt-5 rounded-[26px] border border-slate-200/80 bg-slate-50/70 p-4">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,0.85fr)_auto]">
                  <select
                    value={teamLeadAssigneeFilter}
                    onChange={(event) => setTeamLeadAssigneeFilter(event.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    <option value="">전체 담당자</option>
                    {teamLeadFilterOptions.assignees.map((assignee) => (
                      <option key={assignee} value={assignee}>
                        {assignee}
                      </option>
                    ))}
                  </select>
                  <select
                    value={teamLeadDepartmentFilter}
                    onChange={(event) => setTeamLeadDepartmentFilter(event.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    <option value="">전체 부서</option>
                    {teamLeadFilterOptions.departments.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                  <select
                    value={teamLeadRiskFilter}
                    onChange={(event) => setTeamLeadRiskFilter(event.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    {TEAM_LEAD_RISK_FILTERS.map((risk) => (
                      <option key={risk.id} value={risk.id}>
                        {risk.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={clearTeamLeadFilters}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    필터 초기화
                  </button>
                </div>

                {teamLeadStats.assigneeStats.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {teamLeadStats.assigneeStats.slice(0, 6).map((assignee) => (
                      <button
                        key={`assignee-chip-${assignee.name}`}
                        type="button"
                        onClick={() => setTeamLeadAssigneeFilter(assignee.name)}
                        className={`rounded-full px-3 py-2 text-[11px] font-semibold transition ${
                          teamLeadAssigneeFilter === assignee.name
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {assignee.name} · {assignee.projectCount}개
                        {assignee.delayedCount > 0 ? ` · 지연 ${assignee.delayedCount}` : ''}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {isFolderPanelCollapsed && foldersError ? (
              <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{foldersError}</div>
            ) : null}
            {listError && <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{listError}</div>}
            {!canImport && (
              <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                로그인 전에는 일정 조회만 가능합니다. 편집/가져오기는 로그인 후 사용할 수 있습니다.
              </div>
            )}

            <div className="custom-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(241,245,249,0.82)_100%)] px-4 py-4 sm:px-5 sm:py-5">
              {filteredBoardItems.length === 0 && !isLoadingList ? (
                <div className="flex h-full min-h-[420px] items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-6 text-center text-sm text-slate-400">
                  현재 필터 조건에 맞는 프로젝트가 없습니다.
                </div>
              ) : (
                <div className="grid h-full min-w-full auto-cols-[minmax(280px,1fr)] grid-flow-col gap-4 xl:auto-cols-[minmax(320px,1fr)]">
                  {kanbanColumns.map((column) => (
                    <section
                      key={`column-${column.id}`}
                      className={`flex h-full min-h-[460px] min-w-0 flex-col rounded-[28px] border shadow-sm ${column.tone.shell}`}
                    >
                      <div className={`m-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-4 ${column.tone.header}`}>
                        <h3 className="text-lg font-black">{column.label}</h3>
                        <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-700">{column.itemCount}</span>
                      </div>

                      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto px-3 pb-3">
                        {column.items.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-center text-sm text-slate-400">
                            {isLoadingList ? '불러오는 중...' : '이 컬럼에는 프로젝트가 없습니다.'}
                          </div>
                        ) : (
                          column.items.map((item) => renderProjectCard(item, column.tone))
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>

            {hasMore && (
              <div className="border-t border-slate-200/70 px-4 py-3">
                <button
                  type="button"
                  onClick={() => void fetchSchedulesPage({ offset: nextOffset, append: true })}
                  disabled={isLoadingMore || isLoadingList}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingMore ? '불러오는 중...' : '더 보기'}
                </button>
              </div>
            )}
          </section>
      </>
      ) : (
        <section className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200/70 px-5 py-4">
            <button type="button" onClick={() => setContentView('list')} className="inline-flex w-fit items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
              {'<'} 보드로
            </button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold tracking-tight text-slate-900">{selectedBoardState?.name || selectedSchedule?.name || '미리보기'}</h2>
                <p className="mt-1 text-xs text-slate-500">{selectedSchedule ? `작업 ${selectedSchedule.tasks.length}개` : '목록에서 일정을 선택하세요.'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canManageFolders && (
                  <button
                    type="button"
                    onClick={() => void deleteSchedule(selectedMeta || { id: selectedId, name: selectedSchedule?.name })}
                    disabled={!selectedSchedule || deletingScheduleId === selectedId}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 size={18} /> {deletingScheduleId === selectedId ? '삭제 중...' : '삭제'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={importSelectedSchedule}
                  disabled={!selectedSchedule || !canImport}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  title={!canImport ? '가져오기는 로그인 후 사용할 수 있습니다.' : undefined}
                >
                  <Download size={18} /> {canImport ? '가져오기' : '가져오기 (로그인 필요)'}
                </button>
              </div>
            </div>
          </div>

          {scheduleError && <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{scheduleError}</div>}
          {!selectedSchedule && !isLoadingSchedule && !scheduleError && <div className="flex-1 px-5 py-8 text-sm text-slate-500">프로젝트 카드를 선택하면 미리보기가 표시됩니다.</div>}
          {isLoadingSchedule && <div className="flex-1 px-5 py-8 text-sm text-slate-400">일정을 불러오는 중...</div>}

          {selectedSchedule && (
            <>
              <div className="border-b border-slate-200/70 px-5 py-4">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('schedule')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      previewTab === 'schedule' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    일정
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('dashboard')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      previewTab === 'dashboard' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    대시보드
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-6">
                  {previewHistoryItems.map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                      <p className="mt-1 truncate text-[11px] font-semibold text-slate-700">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 lg:grid-cols-5">
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Owner</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-700 break-words">
                      {selectedOverview.primaryAssignee || selectedOverview.assignees.join(', ') || '미지정'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Department</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-700 break-words">
                      {selectedOverview.primaryDepartment || selectedOverview.departments.join(', ') || '-'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Progress</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-700">{selectedOverview.progress}%</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Due</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-700">{formatOverviewDate(selectedOverview.endDate) || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Health</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-700">
                      {selectedOverview.riskLabels.length > 0 ? selectedOverview.riskLabels.join(', ') : '정상'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(selectedOverview.riskLabels.length > 0 ? selectedOverview.riskLabels : ['정상']).map((riskLabel) => (
                    <span
                      key={`preview-risk-${riskLabel}`}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        riskLabel === '지연' || riskLabel === '오늘 마감'
                          ? 'bg-rose-50 text-rose-700'
                          : riskLabel === '이번 주 마감' || riskLabel === '오래 미갱신' || riskLabel === '보류'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {riskLabel}
                    </span>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Holding reason</p>
                    {canManageFolders ? (
                      <textarea
                        value={
                          Object.prototype.hasOwnProperty.call(holdingReasonDrafts, selectedId)
                            ? holdingReasonDrafts[selectedId]
                            : String(selectedBoardState?.holdingReason || '').trim()
                        }
                        onChange={(event) =>
                          setHoldingReasonDrafts((prev) => ({ ...prev, [selectedId]: event.target.value }))
                        }
                        onBlur={() => {
                          void saveHoldingReason(selectedBoardState);
                        }}
                        disabled={!!savingMetaBySchedule[selectedId]}
                        placeholder="보류 상태라면 멈춘 이유를 적어주세요."
                        className="mt-2 min-h-[112px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                        {String(selectedBoardState?.holdingReason || '').trim() || '-'}
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Next action</p>
                    {canManageFolders ? (
                      <textarea
                        value={
                          Object.prototype.hasOwnProperty.call(nextActionDrafts, selectedId)
                            ? nextActionDrafts[selectedId]
                            : String(selectedBoardState?.nextAction || '').trim()
                        }
                        onChange={(event) =>
                          setNextActionDrafts((prev) => ({ ...prev, [selectedId]: event.target.value }))
                        }
                        onBlur={() => {
                          void saveNextAction(selectedBoardState);
                        }}
                        disabled={!!savingMetaBySchedule[selectedId]}
                        placeholder="누가 무엇을 하면 다시 진행되는지 적어주세요."
                        className="mt-2 min-h-[112px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                        {String(selectedBoardState?.nextAction || '').trim() || '-'}
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Recent activity</p>
                      <span className="text-[10px] font-semibold text-slate-400">{selectedActivityLog.length}건</span>
                    </div>
                    {selectedActivityLog.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-400">최근 활동이 없습니다.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {selectedActivityLog.slice(0, 5).map((entry) => {
                          const actor = buildEmployeeDisplay(entry.actorEmail, employeeDirectory);
                          return (
                            <div key={entry.id || `selected-activity-${entry.at}`} className="rounded-xl bg-slate-50 px-3 py-2">
                              <p className="text-sm font-semibold text-slate-700 break-words">{entry.message}</p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {actor.profile || actor.email || '기록자 없음'} · {summarizeActivityDate(entry.at) || '-'}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {previewTab === 'schedule' ? (
                <>
                  <div className="flex flex-col gap-3 border-b border-slate-200/70 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="w-full lg:max-w-sm">
                      <label className="field-label">미리보기 필터</label>
                      <input
                        type="text"
                        value={previewFilterText}
                        onChange={(e) => setPreviewFilterText(e.target.value)}
                        placeholder="작업명, 부서, 담당자"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <select value={previewViewMode} onChange={(e) => setPreviewViewMode(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                        <option value="Day">{VIEW_MODE_LABELS.Day}</option>
                        <option value="Week">{VIEW_MODE_LABELS.Week}</option>
                        <option value="Month">{VIEW_MODE_LABELS.Month}</option>
                      </select>
                      <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <span className="font-semibold text-slate-500">배율</span>
                        <button type="button" onClick={() => setPreviewZoomSettings((prev) => ({ ...(prev || {}), [previewViewMode]: clampZoom(zoomValue - 10) }))} className="h-6 w-6 rounded border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50">-</button>
                        <span className="w-12 text-center text-[11px] tabular-nums">{zoomValue}%</span>
                        <button type="button" onClick={() => setPreviewZoomSettings((prev) => ({ ...(prev || {}), [previewViewMode]: clampZoom(zoomValue + 10) }))} className="h-6 w-6 rounded border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50">+</button>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <span className="font-semibold text-slate-500">여백</span>
                        <input type="number" min="0" className="w-12 rounded border border-slate-200 px-1 text-center" value={Number(rangePadding.before) || 0} onChange={(e) => setPreviewRangePadding((prev) => ({ ...mergeRangePadding(prev), [previewViewMode]: { ...mergeRangePadding(prev)[previewViewMode], before: Math.max(0, Number(e.target.value) || 0) } }))} />
                        <span className="text-slate-400">~</span>
                        <input type="number" min="0" className="w-12 rounded border border-slate-200 px-1 text-center" value={Number(rangePadding.after) || 0} onChange={(e) => setPreviewRangePadding((prev) => ({ ...mergeRangePadding(prev), [previewViewMode]: { ...mergeRangePadding(prev)[previewViewMode], after: Math.max(0, Number(e.target.value) || 0) } }))} />
                        <span className="text-slate-400">({rangeUnit})</span>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
                        <input type="checkbox" className="accent-blue-600" checked={fitEnabled} onChange={(e) => setPreviewFitSettings((prev) => ({ ...sanitizeFitSettings(prev), [previewViewMode]: { enabled: !!e.target.checked } }))} />
                        <span className="text-sm font-semibold text-slate-700">화면 맞춤</span>
                      </label>
                    </div>
                  </div>

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

      {canManageFolders && (
        <Modal
          isOpen={isFolderAdminModalOpen}
          onClose={closeFolderAdminModal}
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
              onClick={closeFolderAdminModal}
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
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="예: 신규사업기획"
              data-modal-autofocus="true"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              disabled={isCreatingFolder}
            />
            <label className="field-label">상위 폴더</label>
            <select value={newFolderParentId} onChange={(e) => setNewFolderParentId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" disabled={isCreatingFolder}>
              <option value="">(루트)</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{`${'-- '.repeat(Math.max(0, folder.depth - 1))}${folder.name}`}</option>
              ))}
            </select>
            <label className="field-label">삭제 대상 폴더</label>
            <select
              value={selectedFolderForAdmin?.id || ''}
              onChange={(e) => setSelectedFolderId(e.target.value || ALL_FOLDERS_ID)}
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
              <button type="button" onClick={() => void createFolder()} disabled={isCreatingFolder || !!movingFolderId} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                <Plus size={14} /> {isCreatingFolder ? '생성 중...' : '폴더 생성'}
              </button>
	            <button type="button" onClick={() => void deleteSelectedFolder()} disabled={isDeletingFolder || !!movingFolderId || !selectedFolderForAdmin || selectedFolderId === ALL_FOLDERS_ID || selectedFolderId === PUBLIC_UNCATEGORIZED_FOLDER_ID} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60">
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
              onClick={closeFolderAdminModal}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default PublicSchedules;
