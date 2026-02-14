import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { Edit2, Upload, XIcon } from '../Icons';
import { isValidEmail, normalizeEmailList, parseEmailList } from '../../utils/email';
import { PUBLIC_UNCATEGORIZED_FOLDER_ID } from '../../utils/publicSchedulesApi';

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
      return {
        id,
        label,
      };
    })
    .filter(Boolean);

  if (!mapped.some((item) => item.id === PUBLIC_UNCATEGORIZED_FOLDER_ID)) {
    mapped.unshift({ id: PUBLIC_UNCATEGORIZED_FOLDER_ID, label: '미분류' });
  }

  return mapped;
};

const normalizeEmployeeOptions = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((row, index) => {
      const id = String(row?.id || `employee-${index + 1}`).trim();
      const email = String(row?.email || '').trim().toLowerCase();
      const name = String(row?.name || '').trim();
      const department = String(row?.department || '').trim();
      const position = String(row?.position || '').trim();
      if (!id || !name || !email || !isValidEmail(email)) return null;
      return {
        id,
        email,
        name,
        department,
        position,
        label: `${name}${department ? ` / ${department}` : ''}${position ? ` / ${position}` : ''}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

function PublicUploadModal({
  isOpen,
  onClose,
  defaultTitle = '',
  defaultUpdateTargetId = '',
  defaultUpdateTargetName = '',
  defaultNotificationRecipients = [],
  currentUserEmail = '',
  currentUserProfile = null,
  defaultFolderId = PUBLIC_UNCATEGORIZED_FOLDER_ID,
  folderOptions = [],
  employeeDirectory = [],
  tasksCount = 0,
  isUploading = false,
  lockModeToUpdate = false,
  lockedTargetId = '',
  onSubmit,
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [mode, setMode] = useState('create');
  const [updateTarget, setUpdateTarget] = useState(defaultUpdateTargetId);
  const [notificationRecipientsInput, setNotificationRecipientsInput] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(defaultFolderId || PUBLIC_UNCATEGORIZED_FOLDER_ID);
  const [employeeQuery, setEmployeeQuery] = useState('');

  const safeFolderOptions = useMemo(() => normalizeFolderOptions(folderOptions), [folderOptions]);
  const safeEmployeeOptions = useMemo(() => normalizeEmployeeOptions(employeeDirectory), [employeeDirectory]);

  useEffect(() => {
    if (!isOpen) return;

    const lockedId = String(lockedTargetId || '').trim();
    const hasLockedTarget = lockModeToUpdate && !!lockedId;

    setTitle(defaultTitle || '');
    setMode(hasLockedTarget ? 'update' : defaultUpdateTargetId ? 'update' : 'create');
    setUpdateTarget(hasLockedTarget ? lockedId : defaultUpdateTargetId || '');
    setNotificationRecipientsInput(normalizeEmailList(defaultNotificationRecipients).join(', '));
    setEmployeeQuery('');

    const requestedFolderId = String(defaultFolderId || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID;
    const isAllowed = safeFolderOptions.some((item) => item.id === requestedFolderId);
    setSelectedFolderId(isAllowed ? requestedFolderId : PUBLIC_UNCATEGORIZED_FOLDER_ID);
  }, [
    isOpen,
    defaultTitle,
    defaultUpdateTargetId,
    defaultNotificationRecipients,
    defaultFolderId,
    lockModeToUpdate,
    lockedTargetId,
    safeFolderOptions,
  ]);

  const safeTitle = useMemo(() => String(title || '').trim(), [title]);
  const lockedTarget = useMemo(() => String(lockedTargetId || '').trim(), [lockedTargetId]);
  const isModeLockedToUpdate = lockModeToUpdate && !!lockedTarget;
  const safeMode = useMemo(
    () => (isModeLockedToUpdate ? 'update' : normalizeUploadMode(mode)),
    [mode, isModeLockedToUpdate],
  );
  const safeTargetInput = useMemo(
    () => (isModeLockedToUpdate ? lockedTarget : String(updateTarget || '').trim()),
    [updateTarget, lockedTarget, isModeLockedToUpdate],
  );
  const safeTargetId = useMemo(() => extractScheduleId(safeTargetInput), [safeTargetInput]);
  const safeFolderId = useMemo(() => String(selectedFolderId || '').trim(), [selectedFolderId]);
  const recommendedTargetId = useMemo(
    () => (isModeLockedToUpdate ? lockedTarget : String(defaultUpdateTargetId || '').trim()),
    [isModeLockedToUpdate, lockedTarget, defaultUpdateTargetId],
  );

  const safeNotificationRecipients = useMemo(
    () => normalizeEmailList(notificationRecipientsInput),
    [notificationRecipientsInput],
  );
  const recipientSet = useMemo(() => new Set(safeNotificationRecipients), [safeNotificationRecipients]);
  const recipientTokens = useMemo(() => parseEmailList(notificationRecipientsInput), [notificationRecipientsInput]);
  const hasInvalidRecipient = useMemo(() => recipientTokens.some((email) => !isValidEmail(email)), [recipientTokens]);

  const safeCurrentUserEmail = useMemo(() => String(currentUserEmail || '').trim().toLowerCase(), [currentUserEmail]);
  const safeCurrentUserProfile = useMemo(
    () =>
      currentUserProfile && typeof currentUserProfile === 'object'
        ? {
            name: String(currentUserProfile.name || '').trim(),
            department: String(currentUserProfile.department || '').trim(),
            position: String(currentUserProfile.position || '').trim(),
          }
        : null,
    [currentUserProfile],
  );

  const filteredEmployees = useMemo(() => {
    const q = String(employeeQuery || '').trim().toLowerCase();
    if (!q) return [];

    return safeEmployeeOptions
      .filter((employee) => {
        return (
          employee.name.toLowerCase().includes(q) ||
          String(employee.department || '').toLowerCase().includes(q) ||
          String(employee.position || '').toLowerCase().includes(q) ||
          employee.email.toLowerCase().includes(q)
        );
      })
      .slice(0, 30);
  }, [employeeQuery, safeEmployeeOptions]);

  const addRecipientEmail = (email) => {
    const safeEmail = String(email || '').trim().toLowerCase();
    if (!safeEmail || !isValidEmail(safeEmail)) return;
    if (recipientSet.has(safeEmail)) return;
    setNotificationRecipientsInput(normalizeEmailList([...safeNotificationRecipients, safeEmail]).join(', '));
  };

  const missingTitle = !safeTitle;
  const missingFolder = !safeFolderId;
  const missingRecipients = safeMode === 'create' && safeNotificationRecipients.length === 0;
  const missingTargetId = safeMode === 'update' && !safeTargetId;

  const canSubmit = !isUploading && !missingTitle && !missingFolder && (safeMode === 'create'
    ? !missingRecipients && !hasInvalidRecipient
    : !missingTargetId && !hasInvalidRecipient);

  const submitHint = useMemo(() => {
    if (missingFolder) return '업로드 폴더를 선택해주세요.';

    if (safeMode === 'create') {
      if (missingTitle) return '제목을 입력해주세요.';
      if (hasInvalidRecipient) return '알림 대상 메일 형식을 확인해주세요.';
      if (missingRecipients) return '알림 대상 메일을 1개 이상 입력해주세요.';
      return '';
    }

    if (missingTitle) return '제목을 입력해주세요.';
    if (hasInvalidRecipient) return '알림 대상 메일 형식을 확인해주세요.';
    if (missingTargetId) return '업데이트 대상 일정 ID 또는 링크를 입력해주세요.';
    return '';
  }, [safeMode, missingTitle, missingFolder, hasInvalidRecipient, missingRecipients, missingTargetId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="공개 일정 업로드"
      panelClassName="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">공개 일정 업로드</h3>
          <p className="mt-1 text-xs text-slate-500">업로드하면 다른 사용자도 목록에서 조회할 수 있습니다.</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          type="button"
          aria-label="닫기"
          disabled={isUploading}
        >
          <XIcon size={20} />
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label className="field-label">제목</label>
          <input
            type="text"
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
            placeholder="예: 2026 상반기 운영 일정"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isUploading}
          />
          <p className="mt-2 text-[11px] text-slate-500">업로드 대상 작업 수: {Number(tasksCount) || 0}개</p>
        </div>

        <div>
          <label className="field-label">폴더</label>
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
          <p className="mt-2 text-[11px] text-slate-500">업로드는 사전에 생성된 폴더만 선택할 수 있습니다.</p>
        </div>

        <div>
          <label className="field-label">알림 대상 메일</label>
          <textarea
            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
            placeholder="예: teamlead@hanlim.com, manager@hanlim.com"
            value={notificationRecipientsInput}
            onChange={(e) => setNotificationRecipientsInput(e.target.value)}
            rows={3}
            disabled={isUploading}
          />
          <p className="mt-2 text-[11px] text-slate-500">
            쉼표, 세미콜론, 줄바꿈으로 여러 메일 주소를 입력할 수 있습니다.
            {safeMode === 'create' ? ' 새 일정 업로드 시 1명 이상 필수입니다.' : ''}
          </p>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="field-label">사원 검색 (이름 입력)</label>
            <input
              type="text"
              value={employeeQuery}
              onChange={(e) => setEmployeeQuery(e.target.value)}
              placeholder="예: 홍길동"
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
              disabled={isUploading}
            />

            {employeeQuery.trim() && (
              <div className="custom-scrollbar mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {filteredEmployees.length === 0 ? (
                  <p className="px-2 py-1 text-[11px] text-slate-500">검색 결과가 없습니다.</p>
                ) : (
                  <div className="space-y-1">
                    {filteredEmployees.map((employee) => {
                      const selected = recipientSet.has(employee.email);
                      return (
                        <button
                          key={employee.id}
                          type="button"
                          onClick={() => addRecipientEmail(employee.email)}
                          disabled={isUploading || selected}
                          className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs transition ${
                            selected ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate">{employee.label}</span>
                          <span className="ml-2 shrink-0 text-[11px]">{selected ? '추가됨' : '추가'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {hasInvalidRecipient && (
            <p className="mt-2 text-[11px] text-rose-600">유효하지 않은 메일 주소가 포함되어 있습니다.</p>
          )}
          {!hasInvalidRecipient && recipientTokens.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-500">알림 대상 {safeNotificationRecipients.length}명</p>
          )}
        </div>

        <div>
          <label className="field-label">현재 수정자</label>
          <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-700">
            {safeCurrentUserEmail || '로그인 사용자 이메일을 불러오지 못했습니다.'}
          </div>
          {safeCurrentUserProfile && (
            <p className="mt-2 text-[11px] text-slate-500">
              {`${safeCurrentUserProfile.name || '-'} / ${safeCurrentUserProfile.department || '-'} / ${safeCurrentUserProfile.position || '-'}`}
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">수정자 이메일은 로그인 계정으로 서버에서 자동 기록됩니다.</p>
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
                새 일정 업로드
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
                기존 일정 업데이트
              </button>
            </div>
          ) : (
            <p className="text-[11px] font-semibold text-slate-600">
              공유 원본 보호 모드가 활성화되어 기존 일정 업데이트만 허용됩니다.
            </p>
          )}

          {safeMode === 'update' ? (
            <div>
              <label className="field-label">대상 일정 ID 또는 링크</label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
                placeholder="https://.../api/schedules/<id> 또는 <id>"
                value={updateTarget}
                onChange={(e) => setUpdateTarget(e.target.value)}
                disabled={isUploading || isModeLockedToUpdate}
              />

              {recommendedTargetId && (
                <p className="mt-2 text-[11px] text-slate-500">
                  추천 대상: {defaultUpdateTargetName ? `${defaultUpdateTargetName} / ` : ''}
                  {recommendedTargetId}
                </p>
              )}

              {!safeTargetId && safeTargetInput && (
                <p className="mt-2 text-[11px] text-rose-600">ID를 인식하지 못했습니다. 링크 또는 ID를 다시 확인해주세요.</p>
              )}
            </div>
          ) : (
            defaultUpdateTargetId && (
              <p className="text-[11px] text-slate-500">
                현재 프로젝트가 공개 일정에서 가져온 데이터라면, 업데이트 모드로 덮어쓰는 것도 가능합니다.
              </p>
            )
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={isUploading}
          >
            취소
          </button>
          <button
            onClick={() =>
              onSubmit?.({
                title: safeTitle,
                mode: safeMode,
                folderId: safeFolderId,
                targetId: safeMode === 'update' ? safeTargetId : '',
                notificationRecipients: safeNotificationRecipients,
              })
            }
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            title={!canSubmit ? submitHint : undefined}
          >
            {safeMode === 'update' ? <Edit2 size={16} /> : <Upload size={16} />}
            {isUploading ? (safeMode === 'update' ? '업데이트 중...' : '업로드 중...') : safeMode === 'update' ? '업데이트' : '업로드'}
          </button>
        </div>
        {!isUploading && !canSubmit && !!submitHint && <p className="text-right text-[11px] text-amber-700">{submitHint}</p>}
      </div>
    </Modal>
  );
}

export default PublicUploadModal;
