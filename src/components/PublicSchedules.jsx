import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Plus, Search, Trash2, Users } from './Icons';
import GanttChart from './GanttChart';
import Modal from './Modal';
import {
  PUBLIC_UNCATEGORIZED_FOLDER_ID,
  createPublicFolder,
  deletePublicFolder,
  getPublicSchedule,
  isPublicSchedulesEnabled,
  listPublicFoldersTree,
  listPublicSchedules,
  updatePublicScheduleFolder,
} from '../utils/publicSchedulesApi';
import { normalizeTasks, normalizeVacations } from '../utils/data';
import { mergeRangePadding, sanitizeFitSettings, sanitizeZoomSettings } from '../utils/schedulerSettings';
import { normalizeEmailList } from '../utils/email';

const ALL_FOLDERS_ID = '__all_folders__';
const PAGE_SIZE = 40;

const formatDateTime = (value) => {
  if (value == null) return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);

const normalizeSchedulePayload = (payload, fallbackName) => {
  if (Array.isArray(payload)) {
    return {
      name: String(fallbackName || '제목 없음').trim() || '제목 없음',
      tasks: normalizeTasks(payload),
      vacations: [],
      rangePadding: mergeRangePadding(null),
      fitSettings: sanitizeFitSettings(null),
      zoomSettings: sanitizeZoomSettings(null),
      notificationRecipients: [],
    };
  }

  if (!isPlainObject(payload)) {
    throw new Error('일정 데이터 형식이 올바르지 않습니다.');
  }

  return {
    name: String(payload.name || fallbackName || '제목 없음').trim() || '제목 없음',
    tasks: normalizeTasks(payload.tasks || []),
    vacations: normalizeVacations(payload.vacations || []),
    rangePadding: mergeRangePadding(payload.rangePadding),
    fitSettings: sanitizeFitSettings(payload.fitSettings),
    zoomSettings: sanitizeZoomSettings(payload.zoomSettings),
    notificationRecipients: normalizeEmailList(payload.notificationRecipients),
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
    .filter(Boolean)
    .sort((a, b) => a.path.localeCompare(b.path, 'ko'));

const buildFolderSelectOptions = (folders) => {
  const options = [
    {
      id: PUBLIC_UNCATEGORIZED_FOLDER_ID,
      depth: 0,
      path: '',
      label: '미분류',
    },
  ];

  folders.forEach((folder) => {
    const depth = Math.max(1, Number(folder?.depth) || 1);
    const label = `${'-- '.repeat(Math.max(0, depth - 1))}${folder.name}`;
    options.push({
      id: folder.id,
      depth,
      path: folder.path,
      label,
    });
  });

  return options;
};

const clampZoom = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.max(25, Math.min(300, Math.round(n)));
};

function PublicSchedules({
  refreshToken = 0,
  onImportSchedule,
  canManage = false,
  canImport = true,
  sharedScheduleId = '',
}) {
  const enabled = useMemo(() => isPublicSchedulesEnabled(), []);
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
  const [foldersError, setFoldersError] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(ALL_FOLDERS_ID);
  const [listReloadToken, setListReloadToken] = useState(0);

  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [folderManageError, setFolderManageError] = useState('');
  const [isFolderAdminModalOpen, setIsFolderAdminModalOpen] = useState(false);
  const [movingFolderBySchedule, setMovingFolderBySchedule] = useState(() => ({}));

  const [contentView, setContentView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');

  const [previewViewMode, setPreviewViewMode] = useState('Week');
  const [previewFilterText, setPreviewFilterText] = useState('');
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
    if (selectedFolderId === ALL_FOLDERS_ID || selectedFolderId === PUBLIC_UNCATEGORIZED_FOLDER_ID) return;
    if (!folders.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(ALL_FOLDERS_ID);
    }
  }, [supportsFolders, selectedFolderId, folders]);

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
    [enabled, query, supportsFolders, selectedFolderId],
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
        folderId: raw?.folderId ?? item?.folderId ?? null,
        folderPath: raw?.folderPath ?? item?.folderPath ?? '',
      }));
      setPreviewViewMode('Week');
      setPreviewFilterText('');
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
        notificationRecipients: selectedSchedule.notificationRecipients,
      },
      {
        sourceName: selectedSchedule.name,
        sourceId: selectedId,
        sourceUpdatedAt: selectedMeta?.updatedAt ?? selectedMeta?.updated_at,
        sourceNotificationRecipients: selectedSchedule.notificationRecipients,
        sourceFolderId: selectedMeta?.folderId ?? selectedMeta?.folder_id ?? null,
        sourceFolderPath: selectedMeta?.folderPath ?? selectedMeta?.folder_path ?? '',
      },
    );
  };

  const createFolder = async () => {
    if (!canManageFolders) {
      setFolderManageError('Folder management is available only in admin mode.');
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
      setFolderManageError('Folder management is available only in admin mode.');
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
    const confirmed = window.confirm(`폴더 '${selectedFolder.path || selectedFolder.name}'를 삭제할까요?`);
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

  const changeScheduleFolder = async (item, nextFolderIdRaw) => {
    if (!canManageFolders) {
      setListError('Folder move is available only in admin mode.');
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

      setItems((prev) =>
        prev.map((row) =>
          String(row?.id || '').trim() !== scheduleId
            ? row
            : {
                ...row,
                folderId: resultFolderId,
                folderPath: resultFolderPath,
                updatedAt: Number(result?.updatedAt) || row?.updatedAt,
              },
        ),
      );
      setSelectedMeta((prev) =>
        !prev || String(prev?.id || '').trim() !== scheduleId
          ? prev
          : {
              ...prev,
              folderId: resultFolderId,
              folderPath: resultFolderPath,
              updatedAt: Number(result?.updatedAt) || prev?.updatedAt,
            },
      );
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

  const zoomValue = clampZoom(previewZoomSettings?.[previewViewMode] ?? 100);
  const rangePadding = previewRangePadding?.[previewViewMode] || { before: 0, after: 0 };
  const fitEnabled = (previewFitSettings?.[previewViewMode] || {}).enabled || false;
  const rangeUnit = previewViewMode === 'Day' ? '일' : previewViewMode === 'Week' ? '주' : '개월';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <aside className="glass-panel w-full shrink-0 overflow-hidden lg:w-[320px]">
        <div className="border-b border-slate-200/70 px-4 py-4">
          <h2 className="text-base font-bold text-slate-900">폴더 트리</h2>
          <p className="mt-1 text-xs text-slate-500">
            {supportsFolders ? (isLoadingFolders ? '폴더 로딩 중...' : `${folders.length}개 폴더`) : '평면 목록 모드'}
          </p>
          {sharedModeId && <p className="mt-1 text-[11px] font-semibold text-blue-700">공유 원본 ID 고정 모드: {sharedModeId}</p>}
        </div>

        {foldersError && <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{foldersError}</div>}

        <div className="custom-scrollbar max-h-[36vh] overflow-y-auto px-2 py-3">
          <button
            type="button"
            onClick={() => setSelectedFolderId(ALL_FOLDERS_ID)}
            className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
              selectedFolderId === ALL_FOLDERS_ID ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className="font-semibold">전체</span>
          </button>
          {supportsFolders && (
            <button
              type="button"
              onClick={() => setSelectedFolderId(PUBLIC_UNCATEGORIZED_FOLDER_ID)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedFolderId === PUBLIC_UNCATEGORIZED_FOLDER_ID ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>미분류</span>
            </button>
          )}
          {supportsFolders &&
            folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => setSelectedFolderId(folder.id)}
                className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                  selectedFolderId === folder.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
                style={{ paddingLeft: `${12 + (folder.depth - 1) * 14}px` }}
              >
                <span className="truncate">{folder.name}</span>
                <span className="text-[11px] text-slate-400">{folder.projectCount}</span>
              </button>
            ))}
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
      </aside>

      {contentView === 'list' ? (
        <section className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-4">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`검색 (${selectedFolderDisplayName})`}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {listError && <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{listError}</div>}
          {!canImport && (
            <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              로그인 전에는 일정 조회만 가능합니다. 편집/가져오기는 로그인 후 사용할 수 있습니다.
            </div>
          )}

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto divide-y divide-slate-100">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-400">
                {isLoadingList ? '불러오는 중...' : '등록된 공개 일정이 없습니다.'}
              </div>
            ) : (
              items.map((item) => {
                const id = String(item?.id || '').trim();
                const name = String(item?.name || item?.title || '').trim() || '제목 없음';
                const tasksCount = Number(item?.tasksCount ?? item?.taskCount ?? 0) || 0;
                const createdAt = formatDateTime(item?.createdAt ?? item?.created_at);
                const updatedAt = formatDateTime(item?.updatedAt ?? item?.updated_at);
                const createdByEmail = String(item?.createdByEmail || item?.created_by_email || '').trim().toLowerCase();
                const updatedByEmail = String(item?.updatedByEmail || item?.updated_by_email || '').trim().toLowerCase();
                const isSelected = selectedId && id && selectedId === id;
                const rowFolderIdValue = String(item?.folderId || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID;
                const isMoving = !!movingFolderBySchedule[id];

                return (
                  <div key={id || name} className={`${isSelected ? 'bg-blue-50/40' : 'bg-transparent'} px-4 py-3`}>
                    <button
                      type="button"
                      onClick={() => openPreview(item)}
                      className="flex w-full items-start gap-3 rounded-lg px-2 py-1 text-left transition hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-slate-800">{name}</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span>작업 {tasksCount}개</span>
                          {updatedAt && <span>수정 {updatedAt}</span>}
                          {!updatedAt && createdAt && <span>등록 {createdAt}</span>}
                        </div>
                        {(updatedByEmail || createdByEmail) && (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            {createdByEmail && <span>게시자 {createdByEmail}</span>}
                            {updatedByEmail && <span>수정자 {updatedByEmail}</span>}
                          </div>
                        )}
                      </div>
                      <span className="pt-0.5 text-xs font-semibold text-blue-700">Preview</span>
                    </button>

                    {supportsFolders && (
                      <div className="mt-2 flex items-center gap-2 px-2">
                        <span className="text-[11px] font-semibold text-slate-500">폴더</span>
                        <select
                          value={rowFolderIdValue}
                          onChange={(e) => {
                            void changeScheduleFolder(item, e.target.value);
                          }}
                          disabled={!canManageFolders || isMoving}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                        >
                          {folderSelectOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {isMoving && <span className="text-[11px] text-slate-400">변경 중...</span>}
                      </div>
                    )}
                  </div>
                );
              })
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
      ) : (
        <section className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200/70 px-5 py-4">
            <button type="button" onClick={() => setContentView('list')} className="inline-flex w-fit items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
              {'<'} 목록으로
            </button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold tracking-tight text-slate-900">{selectedSchedule?.name || '미리보기'}</h2>
                <p className="mt-1 text-xs text-slate-500">{selectedSchedule ? `작업 ${selectedSchedule.tasks.length}개` : '목록에서 일정을 선택하세요.'}</p>
              </div>
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

          {scheduleError && <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{scheduleError}</div>}
          {!selectedSchedule && !isLoadingSchedule && !scheduleError && <div className="flex-1 px-5 py-8 text-sm text-slate-500">일정을 선택하면 미리보기가 표시됩니다.</div>}
          {isLoadingSchedule && <div className="flex-1 px-5 py-8 text-sm text-slate-400">일정을 불러오는 중...</div>}

          {selectedSchedule && (
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
                    <option value="Day">Day</option>
                    <option value="Week">Week</option>
                    <option value="Month">Month</option>
                  </select>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <span className="font-semibold text-slate-500">Zoom</span>
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
                  <GanttChart tasks={filteredPreviewTasks} vacations={selectedSchedule.vacations} viewMode={previewViewMode} rangePadding={rangePadding} fitEnabled={fitEnabled} zoom={zoomValue / 100} />
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {canManageFolders && (
        <Modal
          isOpen={isFolderAdminModalOpen}
          onClose={() => {
            setFolderManageError('');
            setIsFolderAdminModalOpen(false);
          }}
          ariaLabel="폴더 관리"
          panelClassName="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">폴더 관리</h3>
              <p className="mt-1 text-xs text-slate-500">폴더 생성/삭제를 수행합니다.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
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
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void createFolder()} disabled={isCreatingFolder} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                <Plus size={14} /> {isCreatingFolder ? '생성 중...' : '폴더 생성'}
              </button>
              <button type="button" onClick={() => void deleteSelectedFolder()} disabled={isDeletingFolder || selectedFolderId === ALL_FOLDERS_ID || selectedFolderId === PUBLIC_UNCATEGORIZED_FOLDER_ID} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60">
                <Trash2 size={14} /> {isDeletingFolder ? '삭제 중...' : '선택 폴더 삭제'}
              </button>
            </div>
          </div>

          {folderManageError && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{folderManageError}</div>}
        </Modal>
      )}
    </div>
  );
}

export default PublicSchedules;
