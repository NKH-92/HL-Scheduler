import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { Users, XIcon } from '../Icons';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

const isValidEmail = (value) => EMAIL_PATTERN.test(String(value || '').trim().toLowerCase());

function AuthModal({ isOpen, isSubmitting = false, onClose, onLogin, onRegister }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage('');
    setPassword('');
    setConfirmPassword('');
  }, [isOpen, mode]);

  const safeEmail = useMemo(() => String(email || '').trim().toLowerCase(), [email]);
  const emailInvalid = !!safeEmail && !isValidEmail(safeEmail);
  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const confirmMismatch = mode === 'register' && confirmPassword.length > 0 && password !== confirmPassword;

  const canSubmit = useMemo(() => {
    if (isSubmitting) return false;
    if (!safeEmail || !isValidEmail(safeEmail)) return false;
    if (!password || password.length < MIN_PASSWORD_LENGTH) return false;
    if (mode === 'register' && password !== confirmPassword) return false;
    return true;
  }, [isSubmitting, safeEmail, password, mode, confirmPassword]);

  const handleSubmit = async () => {
    setErrorMessage('');
    try {
      if (mode === 'login') {
        await onLogin?.({ email: safeEmail, password });
      } else {
        await onRegister?.({ email: safeEmail, password });
      }
    } catch (error) {
      setErrorMessage(error?.message || '요청에 실패했습니다.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (isSubmitting) return;
        onClose?.();
      }}
      ariaLabel="로그인 또는 가입"
      panelClassName="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <Users size={14} /> Scheduler Account
          </div>
          <h3 className="mt-3 text-lg font-bold text-slate-900">{mode === 'login' ? '로그인' : '가입 요청'}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {mode === 'login' ? '승인된 계정으로 로그인하면 편집 기능이 활성화됩니다.' : '가입 요청 후 Admin 승인 완료 시 로그인할 수 있습니다.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (isSubmitting) return;
            onClose?.();
          }}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="닫기"
          disabled={isSubmitting}
        >
          <XIcon size={20} />
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            disabled={isSubmitting}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              mode === 'login'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:bg-white hover:text-slate-800'
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            disabled={isSubmitting}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              mode === 'register'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:bg-white hover:text-slate-800'
            }`}
          >
            가입 요청
          </button>
        </div>

        <div>
          <label className="field-label">이메일(ID)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@hanlim.com"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            disabled={isSubmitting}
          />
          {emailInvalid && <p className="mt-1 text-[11px] text-rose-600">유효한 이메일 형식이 아닙니다.</p>}
        </div>

        <div>
          <label className="field-label">비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`최소 ${MIN_PASSWORD_LENGTH}자`}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            disabled={isSubmitting}
          />
          {passwordTooShort && (
            <p className="mt-1 text-[11px] text-rose-600">비밀번호는 최소 {MIN_PASSWORD_LENGTH}자 이상이어야 합니다.</p>
          )}
        </div>

        {mode === 'register' && (
          <div>
            <label className="field-label">비밀번호 확인</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              disabled={isSubmitting}
            />
            {confirmMismatch && <p className="mt-1 text-[11px] text-rose-600">비밀번호가 일치하지 않습니다.</p>}
          </div>
        )}

        {errorMessage && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorMessage}</div>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              if (isSubmitting) return;
              onClose?.();
            }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (mode === 'login' ? '로그인 중...' : '요청 중...') : mode === 'login' ? '로그인' : '가입 요청'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default AuthModal;
