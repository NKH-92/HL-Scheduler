import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PUBLIC_UNCATEGORIZED_FOLDER_ID,
  getPublicSchedule,
  isPublicSchedulesEnabled,
  listPublicFoldersTree,
  updatePublicSchedule,
  uploadPublicSchedule,
} from '../utils/publicSchedulesApi';
import { buildFolderSelectOptions as buildFolderSelectOptionsBase } from '../utils/shared';
import { normalizePublicScheduleStatus } from '../utils/publicScheduleStatus';
import { MAX_IMPORT_TASKS, MAX_IMPORT_VACATIONS } from './useProjectImport';

const MAX_PUBLIC_UPLOAD_TEXT_LENGTH = 1024 * 1024;
const UTF8_ENCODER = new TextEncoder();

const getUtf8ByteLength = (value) => UTF8_ENCODER.encode(String(value ?? '')).length;
const buildFolderSelectOptions = (rows) => buildFolderSelectOptionsBase(rows, PUBLIC_UNCATEGORIZED_FOLDER_ID);

export default function usePublicScheduleWorkflow({
  alertAsync,
  applyImportedData,
  canAccessEditor,
  canEditSchedules,
  canWritePublicSchedules,
  currentUserEmail,
  currentUserProfile,
  fitSettings,
  isAuthenticated,
  navigateAfterPublish,
  navigateToImportedSchedule,
  openAuthModal,
  projectName,
  publicOrigin,
  rangePadding,
  refreshSession,
  setPublicOrigin,
  sharedScheduleId,
  tasks,
  vacations,
  zoomSettings,
}) {
  const isSharedScheduleLocked = !!sharedScheduleId;
  const [publicFolderOptions, setPublicFolderOptions] = useState(() => buildFolderSelectOptions([]));
  const [isLoadingPublicFolders, setIsLoadingPublicFolders] = useState(false);
  const [isPublicUploadModalOpen, setIsPublicUploadModalOpen] = useState(false);
  const [isUploadingPublicSchedule, setIsUploadingPublicSchedule] = useState(false);
  const [isSharedBootstrapDone, setIsSharedBootstrapDone] = useState(false);
  const [publicRefreshToken, setPublicRefreshToken] = useState(0);

  const openAuthAndAlert = useCallback(
    (message) => {
      openAuthModal();
      void alertAsync(message);
    },
    [alertAsync, openAuthModal],
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
          openAuthAndAlert('일정 가져오기는 로그인 후 사용할 수 있습니다.');
          return;
        }

        const imported = await applyImportedData(scheduleData, { sourceName }, { skipConfirm });
        if (!imported) return;

        const safeSourceId = String(sourceId || '').trim();
        const safeUpdatedAt = Number(sourceUpdatedAt);
        const safeStatus = normalizePublicScheduleStatus(sourceStatus ?? scheduleData?.status);
        const safeHoldingReason = String((sourceHoldingReason ?? scheduleData?.holdingReason) || '').trim();
        const safeNextAction = String((sourceNextAction ?? scheduleData?.nextAction) || '').trim();

        setPublicOrigin(
          safeSourceId
            ? {
                id: safeSourceId,
                name: String(sourceName || '').trim(),
                updatedAt: Number.isFinite(safeUpdatedAt) ? safeUpdatedAt : null,
                folderId: String(sourceFolderId || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID,
                folderPath: String(sourceFolderPath || '').trim(),
                status: safeStatus,
                holdingReason: safeHoldingReason,
                nextAction: safeNextAction,
              }
            : null,
        );
        navigateToImportedSchedule();
      } catch (error) {
        console.error(error);
        void alertAsync(error?.message || '공개 일정을 가져오지 못했습니다.');
      }
    },
    [alertAsync, applyImportedData, canAccessEditor, navigateToImportedSchedule, openAuthAndAlert, setPublicOrigin],
  );

  useEffect(() => {
    setIsSharedBootstrapDone(false);
  }, [sharedScheduleId]);

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

        await importFromPublicSchedule(scheduleData, {
          sourceName: String(raw?.name || scheduleData?.name || '').trim(),
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
          void alertAsync(error?.message || '공유된 일정을 자동으로 불러오지 못했습니다.');
        }
      } finally {
        if (!canceled) {
          setIsSharedBootstrapDone(true);
        }
      }
    };

    void bootstrapSharedSchedule();

    return () => {
      canceled = true;
    };
  }, [alertAsync, canAccessEditor, importFromPublicSchedule, isSharedBootstrapDone, isSharedScheduleLocked, sharedScheduleId]);

  const ensureUploadAllowed = useCallback(() => {
    if (!isAuthenticated) {
      openAuthAndAlert('업로드 기능은 로그인 후 사용할 수 있습니다.');
      return false;
    }
    if (!canEditSchedules) {
      void alertAsync('현재 계정은 일정 편집 및 업로드 권한이 없습니다.');
      return false;
    }
    if (!canWritePublicSchedules) {
      void alertAsync('공개 일정 쓰기 API가 설정되어 있지 않습니다. (VITE_PUBLIC_SCHEDULES_WRITE_API_BASE)');
      return false;
    }
    if (!isPublicSchedulesEnabled()) {
      void alertAsync('공개 일정 API가 설정되어 있지 않습니다. (VITE_PUBLIC_SCHEDULES_API_BASE)');
      return false;
    }
    return true;
  }, [alertAsync, canEditSchedules, canWritePublicSchedules, isAuthenticated, openAuthAndAlert]);

  const openPublicUploadModal = useCallback(async () => {
    if (!ensureUploadAllowed()) return;

    setIsLoadingPublicFolders(true);
    let shouldOpenModal = true;
    try {
      const folders = await listPublicFoldersTree();
      setPublicFolderOptions(buildFolderSelectOptions(folders));
    } catch (error) {
      console.error(error);
      if (error?.status === 401 || error?.status === 403) {
        openAuthModal();
        void refreshSession();
        shouldOpenModal = false;
      }
      setPublicFolderOptions(buildFolderSelectOptions([]));
      void alertAsync(`${error?.message || '폴더 목록을 불러오지 못했습니다.'}\n미분류 폴더로는 계속 진행할 수 있습니다.`);
    } finally {
      setIsLoadingPublicFolders(false);
    }

    if (shouldOpenModal) {
      setIsPublicUploadModalOpen(true);
    }
  }, [alertAsync, ensureUploadAllowed, openAuthModal, refreshSession]);

  const closePublicUploadModal = useCallback(() => {
    if (isUploadingPublicSchedule) return;
    setIsPublicUploadModalOpen(false);
  }, [isUploadingPublicSchedule]);

  const uploadCurrentProject = useCallback(
    async ({ title, mode = 'create', folderId, status, holdingReason, nextAction, targetId } = {}) => {
      try {
        if (!ensureUploadAllowed()) return;

        const safeTitle = String(title || '').trim();
        if (!safeTitle) {
          void alertAsync('프로젝트 제목을 입력해 주세요.');
          return;
        }

        const safeMode = isSharedScheduleLocked ? 'update' : mode === 'update' ? 'update' : 'create';
        const safeFolderId = String(folderId || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID;
        const safeStatus = normalizePublicScheduleStatus(status ?? publicOrigin?.status);
        const safeHoldingReason = String((holdingReason ?? publicOrigin?.holdingReason) || '').trim();
        const safeNextAction = String((nextAction ?? publicOrigin?.nextAction) || '').trim();
        const safeTargetId = isSharedScheduleLocked ? sharedScheduleId : String(targetId || '').trim();

        const knownFolderIds = new Set(
          (Array.isArray(publicFolderOptions) ? publicFolderOptions : []).map((item) => String(item?.id || '').trim()),
        );
        if (knownFolderIds.size > 0 && !knownFolderIds.has(safeFolderId)) {
          void alertAsync('선택한 폴더가 현재 폴더 목록에 없습니다. 폴더를 다시 선택해 주세요.');
          return;
        }

        if (safeMode === 'update' && !safeTargetId) {
          void alertAsync('업데이트할 일정 ID가 없습니다.');
          return;
        }

        let ifUnmodifiedAt = null;
        let preflightErrorMessage = '';
        if (safeMode === 'update') {
          if (String(publicOrigin?.id || '').trim() === safeTargetId && Number.isFinite(Number(publicOrigin?.updatedAt))) {
            ifUnmodifiedAt = Number(publicOrigin.updatedAt);
          } else {
            try {
              const latest = await getPublicSchedule(safeTargetId);
              const latestUpdatedAt = Number(latest?.updatedAt ?? latest?.updated_at);
              if (Number.isFinite(latestUpdatedAt)) {
                ifUnmodifiedAt = latestUpdatedAt;
              }
            } catch (error) {
              preflightErrorMessage = error?.message || '최신 공개 일정 정보를 확인하지 못했습니다.';
            }
          }

          if (!Number.isFinite(ifUnmodifiedAt)) {
            void alertAsync(`${preflightErrorMessage || '최신 공개 일정 정보를 확인하지 못했습니다.'}\n다시 불러온 뒤 재시도해 주세요.`);
            return;
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
          void alertAsync(`업로드 가능한 작업 수를 초과했습니다. (현재 ${tasks.length}건 / 최대 ${MAX_IMPORT_TASKS}건)`);
          return;
        }

        if (vacations.length > MAX_IMPORT_VACATIONS) {
          void alertAsync(`업로드 가능한 휴가 수를 초과했습니다. (현재 ${vacations.length}건 / 최대 ${MAX_IMPORT_VACATIONS}건)`);
          return;
        }

        const payloadBytes = getUtf8ByteLength(JSON.stringify(payload));
        if (payloadBytes > MAX_PUBLIC_UPLOAD_TEXT_LENGTH) {
          const currentKb = Math.round(payloadBytes / 1024);
          const maxKb = Math.round(MAX_PUBLIC_UPLOAD_TEXT_LENGTH / 1024);
          void alertAsync(
            `프로젝트 데이터 크기가 업로드 제한을 초과했습니다. (현재 약 ${currentKb}KB / 최대 ${maxKb}KB)\n작업 수를 줄이거나 메모를 정리한 뒤 다시 시도해 주세요.`,
          );
          return;
        }

        setIsUploadingPublicSchedule(true);
        const result =
          safeMode === 'update' ? await updatePublicSchedule(safeTargetId, payload) : await uploadPublicSchedule(payload);

        const shareUrl = String(result?.url || '').trim();
        const nextUpdatedAt = Number(result?.updatedAt ?? result?.updated_at);
        const nextStatus = normalizePublicScheduleStatus(result?.status ?? safeStatus);
        const nextHoldingReason = String((result?.holdingReason ?? safeHoldingReason) || '').trim();
        const nextNextAction = String((result?.nextAction ?? safeNextAction) || '').trim();

        if (shareUrl) {
          try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(shareUrl);
            await alertAsync(`${safeMode === 'update' ? '업데이트' : '업로드'}가 완료되었습니다.\n\n공유 링크를 클립보드에 복사했습니다.\n${shareUrl}`, {
              title: '완료',
              confirmText: '확인',
            });
          } catch {
            await alertAsync(`${safeMode === 'update' ? '업데이트' : '업로드'}가 완료되었습니다.\n\n링크:\n${shareUrl}`, {
              title: '완료',
              confirmText: '확인',
            });
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

        navigateAfterPublish();
        setPublicRefreshToken((value) => value + 1);
        setIsPublicUploadModalOpen(false);
      } catch (error) {
        console.error(error);
        if (error?.status === 409) {
          void alertAsync('다른 사용자가 같은 일정을 먼저 수정했습니다. 최신 내용을 다시 불러온 뒤 재시도해 주세요.');
        } else if (error?.status === 401 || error?.status === 403) {
          openAuthModal();
          void refreshSession();
          void alertAsync(error?.message || '로그인 상태를 확인한 뒤 다시 시도해 주세요.');
        } else {
          void alertAsync(error?.message || '프로젝트 업로드에 실패했습니다.');
        }
      } finally {
        setIsUploadingPublicSchedule(false);
      }
    },
    [
      alertAsync,
      ensureUploadAllowed,
      fitSettings,
      isSharedScheduleLocked,
      navigateAfterPublish,
      openAuthModal,
      publicFolderOptions,
      publicOrigin,
      rangePadding,
      refreshSession,
      setPublicOrigin,
      sharedScheduleId,
      tasks,
      vacations,
      zoomSettings,
    ],
  );

  const publicUploadModalProps = useMemo(
    () => ({
      isOpen: isPublicUploadModalOpen,
      onClose: closePublicUploadModal,
      defaultTitle: String(projectName || '').trim(),
      defaultUpdateTargetId: isSharedScheduleLocked ? sharedScheduleId : String(publicOrigin?.id || '').trim(),
      defaultUpdateTargetName: String(publicOrigin?.name || '').trim(),
      currentUserEmail: currentUserEmail || '',
      currentUserProfile,
      defaultFolderId: String(publicOrigin?.folderId || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID,
      defaultStatus: normalizePublicScheduleStatus(publicOrigin?.status),
      defaultHoldingReason: String(publicOrigin?.holdingReason || '').trim(),
      defaultNextAction: String(publicOrigin?.nextAction || '').trim(),
      folderOptions: publicFolderOptions,
      tasksCount: tasks.length,
      isUploading: isUploadingPublicSchedule || isLoadingPublicFolders,
      lockModeToUpdate: isSharedScheduleLocked,
      lockedTargetId: sharedScheduleId,
      onSubmit: uploadCurrentProject,
    }),
    [
      closePublicUploadModal,
      currentUserEmail,
      currentUserProfile,
      isLoadingPublicFolders,
      isPublicUploadModalOpen,
      isSharedScheduleLocked,
      isUploadingPublicSchedule,
      projectName,
      publicFolderOptions,
      publicOrigin,
      sharedScheduleId,
      tasks.length,
      uploadCurrentProject,
    ],
  );

  return {
    closePublicUploadModal,
    importFromPublicSchedule,
    openPublicUploadModal,
    publicRefreshToken,
    publicUploadModalProps,
  };
}
