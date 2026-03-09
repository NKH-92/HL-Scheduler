import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { Edit2, Upload, XIcon } from '../Icons';
import { PUBLIC_UNCATEGORIZED_FOLDER_ID } from '../../utils/publicSchedulesApi';
import {
  PUBLIC_SCHEDULE_STATUS,
  PUBLIC_SCHEDULE_STATUS_ORDER,
  getPublicScheduleStatusLabel,
  normalizePublicScheduleStatus,
} from '../../utils/publicScheduleStatus';

const TEXT = {
  uncategorized: '\uBBF8\uBD84\uB958',
  folderRequired: '\uC5C5\uB85C\uB4DC \uD3F4\uB354\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.',
  titleRequired: '\uC81C\uBAA9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.',
  targetRequired: '\uC5C5\uB370\uC774\uD2B8 \uB300\uC0C1 \uC77C\uC815 ID \uB610\uB294 \uB9C1\uD06C\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.',
  modalAria: '\uACF5\uAC1C \uC77C\uC815 \uC5C5\uB85C\uB4DC',
  modalTitle: '\uACF5\uAC1C \uC77C\uC815 \uC5C5\uB85C\uB4DC',
  modalDescription:
    '\uC5C5\uB85C\uB4DC\uD558\uBA74 \uB2E4\uB978 \uC0AC\uC6A9\uC790\uB3C4 \uBAA9\uB85D\uC5D0\uC11C \uC870\uD68C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.',
  close: '\uB2EB\uAE30',
  titleLabel: '\uC81C\uBAA9',
  titlePlaceholder: '\uC608: 2026 \uC0C1\uBC18\uAE30 \uC6B4\uC601 \uC77C\uC815',
  tasksCountPrefix: '\uC5C5\uB85C\uB4DC \uB300\uC0C1 \uC791\uC5C5 \uC218',
  countUnit: '\uAC1C',
  folderLabel: '\uD3F4\uB354',
  folderHint:
    '\uC5C5\uB85C\uB4DC\uB294 \uC0AC\uC804\uC5D0 \uC0DD\uC131\uB41C \uD3F4\uB354\uB9CC \uC120\uD0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.',
  statusLabel: '\uC9C4\uD589 \uC0C1\uD0DC',
  statusHint: '\uACF5\uAC1C \uBCF4\uB4DC\uC5D0\uC11C \uC774 \uD504\uB85C\uC81D\uD2B8\uAC00 \uB4E4\uC5B4\uAC08 \uCE78\uBC18 \uCEEC\uB7FC\uC785\uB2C8\uB2E4.',
  holdingReasonLabel: 'Holding \uC0AC\uC720',
  holdingReasonPlaceholder: '\uBCF4\uB958 \uC0C1\uD0DC\uC77C \uACBD\uC6B0 \uBA48\uCD98 \uC774\uC720\uB97C \uAE30\uB85D\uD558\uC138\uC694.',
  nextActionLabel: '\uB2E4\uC74C \uC561\uC158',
  nextActionPlaceholder: '\uB204\uAC00 \uBB34\uC5C7\uC744 \uD558\uBA74 \uC7AC\uAC1C\uB418\uB294\uC9C0 \uAE30\uB85D\uD558\uC138\uC694.',
  currentEditorLabel: '\uD604\uC7AC \uC218\uC815\uC790',
  currentEditorFallback:
    '\uB85C\uADF8\uC778 \uC0AC\uC6A9\uC790 \uC774\uBA54\uC77C\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
  currentEditorHint:
    '\uC218\uC815\uC790 \uC774\uBA54\uC77C\uC740 \uB85C\uADF8\uC778 \uACC4\uC815\uC73C\uB85C \uC11C\uBC84\uC5D0\uC11C \uC790\uB3D9 \uAE30\uB85D\uB429\uB2C8\uB2E4.',
  modeCreate: '\uC0C8 \uC77C\uC815 \uC5C5\uB85C\uB4DC',
  modeUpdate: '\uAE30\uC874 \uC77C\uC815 \uC5C5\uB370\uC774\uD2B8',
  updateOnlyNotice:
    '\uACF5\uC720 \uC6D0\uBCF8 \uBCF4\uD638 \uBAA8\uB4DC\uAC00 \uD65C\uC131\uD654\uB418\uC5B4 \uAE30\uC874 \uC77C\uC815 \uC5C5\uB370\uC774\uD2B8\uB9CC \uD5C8\uC6A9\uB429\uB2C8\uB2E4.',
  targetLabel: '\uB300\uC0C1 \uC77C\uC815 ID \uB610\uB294 \uB9C1\uD06C',
  targetPlaceholder: 'https://.../api/schedules/<id> \uB610\uB294 <id>',
  recommendedTarget: '\uCD94\uCC9C \uB300\uC0C1',
  targetInvalid:
    'ID\uB97C \uC778\uC2DD\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uB9C1\uD06C \uB610\uB294 ID\uB97C \uB2E4\uC2DC \uD655\uC778\uD574\uC8FC\uC138\uC694.',
  updateHint:
    '\uD604\uC7AC \uD504\uB85C\uC81D\uD2B8\uAC00 \uACF5\uAC1C \uC77C\uC815\uC5D0\uC11C \uAC00\uC838\uC628 \uB370\uC774\uD130\uB77C\uBA74, \uC5C5\uB370\uC774\uD2B8 \uBAA8\uB4DC\uB85C \uB36E\uC5B4\uC4F0\uB294 \uAC83\uB3C4 \uAC00\uB2A5\uD569\uB2C8\uB2E4.',
  cancel: '\uCDE8\uC18C',
  updating: '\uC5C5\uB370\uC774\uD2B8 \uC911...',
  uploading: '\uC5C5\uB85C\uB4DC \uC911...',
  update: '\uC5C5\uB370\uC774\uD2B8',
  upload: '\uC5C5\uB85C\uB4DC',
};

const normalizeUploadMode = (value) => (value === 'update' ? 'update' : 'create');

const extractScheduleId = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const match = /^\/api\/schedules\/([^/]+)$/.exec(url.pathname);
    if (match) return decodeURIComponent(match[1] || '').trim();
  } catch {
    // ignore URL parsing
  }

  const match = /\/api\/schedules\/([^/?#]+)/.exec(raw);
  if (match) return decodeURIComponent(match[1] || '').trim();

  return raw;
};

const normalizeFolderOptions = (options) => {
  const base = Array.isArray(options) ? options : [];
  const mapped = base
    .map((item) => {
      const id = String(item?.id || '').trim();
      if (!id) return null;
      const label = String(item?.label || item?.path || item?.name || '').trim() || id;
      return { id, label };
    })
    .filter(Boolean);

  if (!mapped.some((item) => item.id === PUBLIC_UNCATEGORIZED_FOLDER_ID)) {
    mapped.unshift({ id: PUBLIC_UNCATEGORIZED_FOLDER_ID, label: TEXT.uncategorized });
  }

  return mapped;
};

function PublicUploadModal({
  isOpen,
  onClose,
  defaultTitle = '',
  defaultUpdateTargetId = '',
  defaultUpdateTargetName = '',
  currentUserEmail = '',
  currentUserProfile = null,
  defaultFolderId = PUBLIC_UNCATEGORIZED_FOLDER_ID,
  defaultStatus = PUBLIC_SCHEDULE_STATUS.PLANNING,
  defaultHoldingReason = '',
  defaultNextAction = '',
  folderOptions = [],
  tasksCount = 0,
  isUploading = false,
  lockModeToUpdate = false,
  lockedTargetId = '',
  onSubmit,
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [mode, setMode] = useState('create');
  const [updateTarget, setUpdateTarget] = useState(defaultUpdateTargetId);
  const [selectedFolderId, setSelectedFolderId] = useState(defaultFolderId || PUBLIC_UNCATEGORIZED_FOLDER_ID);
  const [selectedStatus, setSelectedStatus] = useState(PUBLIC_SCHEDULE_STATUS.PLANNING);
  const [holdingReason, setHoldingReason] = useState('');
  const [nextAction, setNextAction] = useState('');

  const safeFolderOptions = useMemo(() => normalizeFolderOptions(folderOptions), [folderOptions]);

  useEffect(() => {
    if (!isOpen) return;

    const lockedId = String(lockedTargetId || '').trim();
    const hasLockedTarget = lockModeToUpdate && !!lockedId;

    setTitle(defaultTitle || '');
    setMode(hasLockedTarget ? 'update' : defaultUpdateTargetId ? 'update' : 'create');
    setUpdateTarget(hasLockedTarget ? lockedId : defaultUpdateTargetId || '');

    const requestedFolderId = String(defaultFolderId || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID;
    const isAllowed = safeFolderOptions.some((item) => item.id === requestedFolderId);
    setSelectedFolderId(isAllowed ? requestedFolderId : PUBLIC_UNCATEGORIZED_FOLDER_ID);
    setSelectedStatus(normalizePublicScheduleStatus(defaultStatus));
    setHoldingReason(String(defaultHoldingReason || '').trim());
    setNextAction(String(defaultNextAction || '').trim());
  }, [isOpen, defaultTitle, defaultUpdateTargetId, defaultFolderId, defaultStatus, defaultHoldingReason, defaultNextAction, lockModeToUpdate, lockedTargetId, safeFolderOptions]);

  const safeTitle = useMemo(() => String(title || '').trim(), [title]);
  const lockedTarget = useMemo(() => String(lockedTargetId || '').trim(), [lockedTargetId]);
  const isModeLockedToUpdate = lockModeToUpdate && !!lockedTarget;
  const safeMode = useMemo(() => (isModeLockedToUpdate ? 'update' : normalizeUploadMode(mode)), [mode, isModeLockedToUpdate]);
  const safeTargetInput = useMemo(
    () => (isModeLockedToUpdate ? lockedTarget : String(updateTarget || '').trim()),
    [updateTarget, lockedTarget, isModeLockedToUpdate],
  );
  const safeTargetId = useMemo(() => extractScheduleId(safeTargetInput), [safeTargetInput]);
  const safeFolderId = useMemo(() => String(selectedFolderId || '').trim(), [selectedFolderId]);
  const safeStatus = useMemo(() => normalizePublicScheduleStatus(selectedStatus), [selectedStatus]);
  const safeHoldingReason = useMemo(() => String(holdingReason || '').trim(), [holdingReason]);
  const safeNextAction = useMemo(() => String(nextAction || '').trim(), [nextAction]);
  const recommendedTargetId = useMemo(
    () => (isModeLockedToUpdate ? lockedTarget : String(defaultUpdateTargetId || '').trim()),
    [isModeLockedToUpdate, lockedTarget, defaultUpdateTargetId],
  );

  const safeCurrentUserEmail = useMemo(() => String(currentUserEmail || '').trim().toLowerCase(), [currentUserEmail]);
  const safeCurrentUserProfile = useMemo(() => {
    if (!currentUserProfile || typeof currentUserProfile !== 'object') return null;
    return {
      name: String(currentUserProfile.name || '').trim(),
      department: String(currentUserProfile.department || '').trim(),
      position: String(currentUserProfile.position || '').trim(),
    };
  }, [currentUserProfile]);

  const missingTitle = !safeTitle;
  const missingFolder = !safeFolderId;
  const missingTargetId = safeMode === 'update' && !safeTargetId;
  const canSubmit = !isUploading && !missingTitle && !missingFolder && (safeMode === 'create' || !missingTargetId);

  const submitHint = useMemo(() => {
    if (missingFolder) return TEXT.folderRequired;
    if (safeMode === 'create') return missingTitle ? TEXT.titleRequired : '';
    if (missingTitle) return TEXT.titleRequired;
    if (missingTargetId) return TEXT.targetRequired;
    return '';
  }, [safeMode, missingTitle, missingFolder, missingTargetId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={TEXT.modalAria}
      panelClassName="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{TEXT.modalTitle}</h3>
          <p className="mt-1 text-xs text-slate-500">{TEXT.modalDescription}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          type="button"
          aria-label={TEXT.close}
          disabled={isUploading}
        >
          <XIcon size={20} />
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label className="field-label">{TEXT.titleLabel}</label>
          <input
            type="text"
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
            placeholder={TEXT.titlePlaceholder}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isUploading}
          />
          <p className="mt-2 text-[11px] text-slate-500">
            {TEXT.tasksCountPrefix}: {Number(tasksCount) || 0}
            {TEXT.countUnit}
          </p>
        </div>

        <div>
          <label className="field-label">{TEXT.folderLabel}</label>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
            value={safeFolderId}
            onChange={(e) => setSelectedFolderId(e.target.value)}
            disabled={isUploading}
          >
            {safeFolderOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11px] text-slate-500">{TEXT.folderHint}</p>
        </div>

        <div>
          <label className="field-label">{TEXT.statusLabel}</label>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
            value={safeStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            disabled={isUploading}
          >
            {PUBLIC_SCHEDULE_STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {getPublicScheduleStatusLabel(status)}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11px] text-slate-500">{TEXT.statusHint}</p>
        </div>

        <div>
          <label className="field-label">{TEXT.holdingReasonLabel}</label>
          <textarea
            className="min-h-[84px] w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
            placeholder={TEXT.holdingReasonPlaceholder}
            value={holdingReason}
            onChange={(e) => setHoldingReason(e.target.value)}
            disabled={isUploading}
          />
        </div>

        <div>
          <label className="field-label">{TEXT.nextActionLabel}</label>
          <textarea
            className="min-h-[84px] w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
            placeholder={TEXT.nextActionPlaceholder}
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            disabled={isUploading}
          />
        </div>

        <div>
          <label className="field-label">{TEXT.currentEditorLabel}</label>
          <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-700">
            {safeCurrentUserEmail || TEXT.currentEditorFallback}
          </div>
          {safeCurrentUserProfile && (
            <p className="mt-2 text-[11px] text-slate-500">{`${safeCurrentUserProfile.name || '-'} / ${safeCurrentUserProfile.department || '-'} / ${safeCurrentUserProfile.position || '-'}`}</p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">{TEXT.currentEditorHint}</p>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {!isModeLockedToUpdate ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode('create')}
                disabled={isUploading}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  safeMode === 'create'
                    ? 'border-blue-200 bg-white text-blue-700 shadow-sm'
                    : 'border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white'
                }`}
              >
                {TEXT.modeCreate}
              </button>
              <button
                type="button"
                onClick={() => setMode('update')}
                disabled={isUploading}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  safeMode === 'update'
                    ? 'border-blue-200 bg-white text-blue-700 shadow-sm'
                    : 'border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white'
                }`}
              >
                {TEXT.modeUpdate}
              </button>
            </div>
          ) : (
            <p className="text-[11px] font-semibold text-slate-600">{TEXT.updateOnlyNotice}</p>
          )}

          {safeMode === 'update' ? (
            <div>
              <label className="field-label">{TEXT.targetLabel}</label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
                placeholder={TEXT.targetPlaceholder}
                value={updateTarget}
                onChange={(e) => setUpdateTarget(e.target.value)}
                disabled={isUploading || isModeLockedToUpdate}
              />

              {recommendedTargetId && (
                <p className="mt-2 text-[11px] text-slate-500">
                  {TEXT.recommendedTarget}: {defaultUpdateTargetName ? `${defaultUpdateTargetName} / ` : ''}
                  {recommendedTargetId}
                </p>
              )}

              {!safeTargetId && safeTargetInput && <p className="mt-2 text-[11px] text-rose-600">{TEXT.targetInvalid}</p>}
            </div>
          ) : (
            defaultUpdateTargetId && <p className="text-[11px] text-slate-500">{TEXT.updateHint}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={isUploading}
          >
            {TEXT.cancel}
          </button>
          <button
            onClick={() =>
              onSubmit?.({
                title: safeTitle,
                mode: safeMode,
                folderId: safeFolderId,
                status: safeStatus,
                holdingReason: safeHoldingReason,
                nextAction: safeNextAction,
                targetId: safeMode === 'update' ? safeTargetId : '',
              })
            }
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            title={!canSubmit ? submitHint : undefined}
          >
            {safeMode === 'update' ? <Edit2 size={16} /> : <Upload size={16} />}
            {isUploading ? (safeMode === 'update' ? TEXT.updating : TEXT.uploading) : safeMode === 'update' ? TEXT.update : TEXT.upload}
          </button>
        </div>
        {!isUploading && !canSubmit && !!submitHint && <p className="text-right text-[11px] text-amber-700">{submitHint}</p>}
      </div>
    </Modal>
  );
}

export default PublicUploadModal;
