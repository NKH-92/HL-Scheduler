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
      const department = String(row?.department || '').trim() || '미지정 부서';
      const position = String(row?.position || '').trim();
      if (!id || !name || !email || !isValidEmail(email)) return null;
      return {
        id,
        email,
        name,
        department,
        position,
        label: `${name} / ${department}${position ? ` / ${position}` : ''} / ${email}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const deptCompare = a.department.localeCompare(b.department, 'ko');
      if (deptCompare !== 0) return deptCompare;
      return a.name.localeCompare(b.name, 'ko');
    });

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
  const [editorEmailInput, setEditorEmailInput] = useState('');
  const [editorDepartmentFilter, setEditorDepartmentFilter] = useState('');

  const safeFolderOptions = useMemo(() => normalizeFolderOptions(folderOptions), [folderOptions]);
  const safeEmployeeOptions = useMemo(() => normalizeEmployeeOptions(employeeDirectory), [employeeDirectory]);
  const safeCurrentUserEmail = useMemo(() => String(currentUserEmail || '').trim().toLowerCase(), [currentUserEmail]);

  useEffect(() => {
    if (!isOpen) return;

    const lockedId = String(lockedTargetId || '').trim();
    const hasLockedTarget = lockModeToUpdate && !!lockedId;

    setTitle(defaultTitle || '');
    setMode(hasLockedTarget ? 'update' : defaultUpdateTargetId ? 'update' : 'create');
    setUpdateTarget(hasLockedTarget ? lockedId : defaultUpdateTargetId || '');
    setNotificationRecipientsInput(normalizeEmailList(defaultNotificationRecipients).join(', '));

    const requestedFolderId = String(defaultFolderId || '').trim() || PUBLIC_UNCATEGORIZED_FOLDER_ID;
    const isAllowed = safeFolderOptions.some((item) => item.id === requestedFolderId);
    setSelectedFolderId(isAllowed ? requestedFolderId : PUBLIC_UNCATEGORIZED_FOLDER_ID);
    setEditorEmailInput(safeCurrentUserEmail);
    setEditorDepartmentFilter('');
  }, [
    isOpen,
    defaultTitle,
    defaultUpdateTargetId,
    defaultNotificationRecipients,
    defaultFolderId,
    lockModeToUpdate,
    lockedTargetId,
    safeFolderOptions,
    safeCurrentUserEmail,
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
  const recipientTokens = useMemo(() => parseEmailList(notificationRecipientsInput), [notificationRecipientsInput]);
  const hasInvalidRecipient = useMemo(() => recipientTokens.some((email) => !isValidEmail(email)), [recipientTokens]);
  const recipientSet = useMemo(() => new Set(safeNotificationRecipients), [safeNotificationRecipients]);

  const safeEditorEmail = useMemo(() => String(editorEmailInput || '').trim().toLowerCase(), [editorEmailInput]);
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

  const departmentEmailMap = useMemo(() => {
    const map = new Map();
    safeEmployeeOptions.forEach((employee) => {
      const key = String(employee.department || '미지정 부서').trim() || '미지정 부서';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(employee.email);
    });
    return map;
  }, [safeEmployeeOptions]);

  const departmentOptions = useMemo(
    () => Array.from(departmentEmailMap.keys()).sort((a, b) => a.localeCompare(b, 'ko')),
    [departmentEmailMap],
  );

  const selectedEditorEmployee = useMemo(
    () => safeEmployeeOptions.find((employee) => employee.email === safeEditorEmail) || null,
    [safeEmployeeOptions, safeEditorEmail],
  );
  const effectiveEditorProfile = selectedEditorEmployee || safeCurrentUserProfile;

  const filteredEditorOptions = useMemo(() => {
    if (!editorDepartmentFilter) return safeEmployeeOptions;
    return safeEmployeeOptions.filter((employee) => employee.department === editorDepartmentFilter);
  }, [safeEmployeeOptions, editorDepartmentFilter]);

  const hasEditorMismatch = useMemo(
    () => !!safeEditorEmail && !!safeCurrentUserEmail && safeEditorEmail !== safeCurrentUserEmail,
    [safeEditorEmail, safeCurrentUserEmail],
  );

  const updateRecipientEmails = (nextEmails) => {
    const normalized = normalizeEmailList(nextEmails);
    setNotificationRecipientsInput(normalized.join(', '));
  };

  const toggleRecipientEmail = (email) => {
    const safeEmail = String(email || '').trim().toLowerCase();
    if (!safeEmail || !isValidEmail(safeEmail)) return;
    const nextEmails = recipientSet.has(safeEmail)
      ? safeNotificationRecipients.filter((item) => item !== safeEmail)
      : [...safeNotificationRecipients, safeEmail];
    updateRecipientEmails(nextEmails);
  };

  const toggleRecipientDepartment = (department) => {
    const safeDepartment = String(department || '').trim();
    if (!safeDepartment) return;
    const departmentEmails = normalizeEmailList(departmentEmailMap.get(safeDepartment) || []);
    if (departmentEmails.length === 0) return;

    const allSelected = departmentEmails.every((email) => recipientSet.has(email));
    const nextEmails = allSelected
      ? safeNotificationRecipients.filter((email) => !departmentEmails.includes(email))
      : [...safeNotificationRecipients, ...departmentEmails];

    updateRecipientEmails(nextEmails);
  };

  const missingTitle = !safeTitle;
  const missingFolder = !safeFolderId;
  const missingRecipients = safeMode === 'create' && safeNotificationRecipients.length === 0;
  const missingTargetId = safeMode === 'update' && !safeTargetId;

  const canSubmit =
    !isUploading &&
    !missingTitle &&
    !missingFolder &&
    !hasInvalidRecipient &&
    !hasEditorMismatch &&
    (safeMode === 'create' ? !missingRecipients : !missingTargetId);

  const submitHint = useMemo(() => {
    if (missingFolder) return '업로드 폴더를 선택해주세요.';
    if (hasEditorMismatch) return `현재 로그인 계정(${safeCurrentUserEmail})과 동일한 수정자를 선택해주세요.`;

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
  }, [
    safeMode,
    missingTitle,
    missingFolder,
    hasInvalidRecipient,
    missingRecipients,
    missingTargetId,
    hasEditorMismatch,
    safeCurrentUserEmail,
  ]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="공개 일정 업로드"
      panelClassName="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
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

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
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
          {hasInvalidRecipient && (
            <p className="mt-2 text-[11px] text-rose-600">유효하지 않은 메일 주소가 포함되어 있습니다.</p>
          )}
          {!hasInvalidRecipient && recipientTokens.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-500">알림 대상 {safeNotificationRecipients.length}명</p>
          )}

          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-semibold text-slate-600">사원주소록에서 팀/사원 토글 선택</p>
            {safeEmployeeOptions.length === 0 ? (
              <p className="mt-2 text-[11px] text-slate-500">주소록 데이터가 없어 수동 입력만 사용할 수 있습니다.</p>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {departmentOptions.map((department) => {
                    const departmentEmails = normalizeEmailList(departmentEmailMap.get(department) || []);
                    const selected =
                      departmentEmails.length > 0 && departmentEmails.every((email) => recipientSet.has(email));

                    return (
                      <button
                        key={`dept-recipient-${department}`}
                        type="button"
                        onClick={() => toggleRecipientDepartment(department)}
                        disabled={isUploading}
                        className={`rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
                          selected
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {department}
                      </button>
                    );
                  })}
                </div>

                <div className="custom-scrollbar mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="space-y-1">
                    {safeEmployeeOptions.map((employee) => {
                      const checked = recipientSet.has(employee.email);
                      return (
                        <label
                          key={employee.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs transition ${
                            checked ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-white'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="accent-blue-600"
                            checked={checked}
                            onChange={() => toggleRecipientEmail(employee.email)}
                            disabled={isUploading}
                          />
                          <span className="truncate">{employee.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div>
          <label className="field-label">{safeMode === 'create' ? '현재 등록자' : '현재 수정자'}</label>
          <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-700">
            {safeEditorEmail || '수정자 이메일을 불러오지 못했습니다.'}
          </div>
          {effectiveEditorProfile && (
            <p className="mt-2 text-[11px] text-slate-500">
              {`${effectiveEditorProfile.name || '-'} / ${effectiveEditorProfile.department || '-'} / ${effectiveEditorProfile.position || '-'}`}
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">서버 기록은 로그인 계정 기준으로 처리됩니다.</p>

          {safeEmployeeOptions.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-slate-600">사원주소록에서 수정자 선택</p>
                <button
                  type="button"
                  onClick={() => setEditorEmailInput(safeCurrentUserEmail)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  로그인 계정으로 되돌리기
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditorDepartmentFilter('')}
                  className={`rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
                    !editorDepartmentFilter
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  전체
                </button>
                {departmentOptions.map((department) => (
                  <button
                    key={`dept-editor-${department}`}
                    type="button"
                    onClick={() => setEditorDepartmentFilter(department)}
                    className={`rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
                      editorDepartmentFilter === department
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {department}
                  </button>
                ))}
              </div>

              <div className="custom-scrollbar mt-3 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                {filteredEditorOptions.length === 0 ? (
                  <p className="text-[11px] text-slate-500">해당 부서에 선택 가능한 사용자가 없습니다.</p>
                ) : (
                  <div className="space-y-1">
                    {filteredEditorOptions.map((employee) => {
                      const checked = safeEditorEmail === employee.email;
                      return (
                        <label
                          key={`editor-${employee.id}`}
                          className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs transition ${
                            checked ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="public-upload-editor"
                            className="accent-blue-600"
                            checked={checked}
                            onChange={() => setEditorEmailInput(employee.email)}
                            disabled={isUploading}
                          />
                          <span className="truncate">{employee.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {hasEditorMismatch && (
            <p className="mt-2 text-[11px] text-amber-700">
              선택한 수정자와 현재 로그인 계정이 다릅니다. 저장하려면 로그인 계정과 동일하게 선택하세요.
            </p>
          )}
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
                editorEmail: safeEditorEmail,
              })
            }
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            title={!canSubmit ? submitHint : undefined}
          >
            {safeMode === 'update' ? <Edit2 size={16} /> : <Upload size={16} />}
            {isUploading
              ? safeMode === 'update'
                ? '업데이트 중...'
                : '업로드 중...'
              : safeMode === 'update'
                ? '업데이트'
                : '업로드'}
          </button>
        </div>
        {!isUploading && !canSubmit && !!submitHint && <p className="text-right text-[11px] text-amber-700">{submitHint}</p>}
      </div>
    </Modal>
  );
}

export default PublicUploadModal;
