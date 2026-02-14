import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, RefreshCw, ShieldCheck, Trash2 } from './Icons';
import {
  approveAdminUser,
  listAdminUsers,
  rejectAdminUser,
  resetAdminUserPassword,
} from '../utils/publicSchedulesApi';
import { findEmployeeByEmail, getEmployeeDirectory } from '../utils/employeeDirectory';

const STATUS_OPTIONS = [
  { value: 'pending', label: '승인 대기' },
  { value: 'approved', label: '승인 완료' },
  { value: 'rejected', label: '거절' },
  { value: 'disabled', label: '비활성' },
  { value: '', label: '전체' },
];

const formatDateTime = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const date = new Date(n);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

function AdminUserManagement() {
  const [status, setStatus] = useState('pending');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutatingId, setIsMutatingId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const employeeDirectory = useMemo(() => getEmployeeDirectory(), []);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const rows = await listAdminUsers({ status, query, limit: 200, offset: 0 });
      setUsers(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setErrorMessage(error?.message || '사용자 목록을 불러오지 못했습니다.');
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [status, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers, query]);

  const statusLabelMap = useMemo(() => {
    const map = new Map();
    STATUS_OPTIONS.forEach((item) => {
      if (item.value) map.set(item.value, item.label);
    });
    return map;
  }, []);

  const runAction = async (userId, fn) => {
    const safeId = String(userId || '').trim();
    if (!safeId) return;
    setIsMutatingId(safeId);
    setErrorMessage('');
    try {
      await fn();
      await loadUsers();
    } catch (error) {
      setErrorMessage(error?.message || '요청 처리에 실패했습니다.');
    } finally {
      setIsMutatingId('');
    }
  };

  return (
    <section className="glass-panel mb-4 p-4 lg:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">사용자 승인 관리</h2>
          <p className="mt-1 text-xs text-slate-500">승인/거절/비밀번호 초기화를 admin 계정으로 처리합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadUsers()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="field-label">상태</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="field-label">검색</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이메일 검색"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      {errorMessage && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorMessage}</div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="bg-slate-100/95 text-slate-600">
            <tr>
              <th className="px-3 py-2">이메일</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">요청시각</th>
              <th className="px-3 py-2">승인시각</th>
              <th className="px-3 py-2">최근로그인</th>
              <th className="px-3 py-2 text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {isLoading ? '불러오는 중...' : '표시할 사용자가 없습니다.'}
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const id = String(user?.id || '').trim();
                const rowStatus = String(user?.status || '').trim().toLowerCase();
                const employee = findEmployeeByEmail(user?.email, employeeDirectory);
                const busy = isMutatingId === id;
                return (
                  <tr key={id || String(user?.email || '')}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{String(user?.email || '-')}</div>
                      {employee && (
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {`${employee.name || '-'} / ${employee.department || '-'} / ${employee.position || '-'}`}
                        </div>
                      )}
                      {user?.isAdmin && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                          <ShieldCheck size={12} /> admin
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{statusLabelMap.get(rowStatus) || rowStatus || '-'}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{formatDateTime(user?.requestedAt)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{formatDateTime(user?.approvedAt)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{formatDateTime(user?.lastLoginAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {rowStatus !== 'approved' && (
                          <button
                            type="button"
                            onClick={() => void runAction(id, () => approveAdminUser(id))}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <CheckSquare size={13} /> 승인
                          </button>
                        )}
                        {rowStatus !== 'rejected' && (
                          <button
                            type="button"
                            onClick={() => void runAction(id, () => rejectAdminUser(id))}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 size={13} /> 거절
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const temporaryPassword = window.prompt('임시 비밀번호를 입력하세요 (최소 8자):', '');
                            if (!temporaryPassword) return;
                            void runAction(id, () => resetAdminUserPassword(id, temporaryPassword));
                          }}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          비밀번호 초기화
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default AdminUserManagement;
