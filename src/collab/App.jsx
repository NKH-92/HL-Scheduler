import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import { createCollabWorkspace, importLegacySchedule, listCollabWorkspaces, resolveLegacyScheduleFromReference } from './api';
import { buildWorkspacePath, navigateTo } from './router';
import WorkspaceView from './WorkspaceView';

const ROLE_LABELS = {
  owner: '소유자',
  admin: '관리자',
  member: '멤버',
};

const formatRoleLabel = (role) => {
  const key = String(role || '').trim().toLowerCase();
  return ROLE_LABELS[key] || '멤버';
};

function InlineAuthPanel() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setIsBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(form);
      } else {
        await signUp(form);
        setMode('signin');
        setError('계정 요청이 접수되었습니다. 승인 후 로그인하세요.');
      }
    } catch (submitError) {
      setError(submitError?.message || '요청에 실패했습니다.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="glass-panel mx-auto max-w-lg p-6">
      <h2 className="text-2xl font-black text-slate-900">협업 공간 로그인</h2>
      <p className="mt-2 text-sm text-slate-500">협업 공간은 메인 스케줄러와 동일한 승인 계정을 사용합니다.</p>
      <form className="mt-5 space-y-3" onSubmit={submit}>
        <input
          type="email"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          placeholder="이메일"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
        />
        <input
          type="password"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          placeholder="비밀번호"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
        />
        {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={isBusy} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60">
            {isBusy ? '처리 중...' : mode === 'signin' ? '로그인' : '계정 요청'}
          </button>
          <button type="button" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => setMode((current) => (current === 'signin' ? 'signup' : 'signin'))}>
            {mode === 'signin' ? '접근 권한이 필요하신가요?' : '로그인으로 돌아가기'}
          </button>
        </div>
      </form>
    </section>
  );
}

function HomeScreen({ onOpenWorkspace }) {
  const { isLoading, isAuthenticated, authUser } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceForm, setWorkspaceForm] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const loadWorkspaces = useCallback(async () => {
    if (!isAuthenticated) {
      setWorkspaces([]);
      return;
    }
    const data = await listCollabWorkspaces();
    setWorkspaces(Array.isArray(data) ? data : []);
  }, [isAuthenticated]);

  useEffect(() => {
    setError('');
    void loadWorkspaces().catch((loadError) => {
      setWorkspaces([]);
      setError(loadError?.message || '워크스페이스를 불러오지 못했습니다.');
    });
  }, [loadWorkspaces]);

  const createWorkspaceHandler = async (event) => {
    event.preventDefault();
    setError('');
    setIsBusy(true);
    try {
      const response = await createCollabWorkspace(workspaceForm);
      const workspaceId = response?.workspace?.id || response?.snapshot?.workspace?.id;
      await loadWorkspaces();
      if (workspaceId) onOpenWorkspace(workspaceId);
    } catch (submitError) {
      setError(submitError?.message || '워크스페이스를 만들지 못했습니다.');
    } finally {
      setIsBusy(false);
    }
  };

  const importHandler = async () => {
    setError('');
    setIsBusy(true);
    try {
      const reference = window.prompt('공개 일정 URL 또는 ID');
      if (!reference) return;
      const legacy = await resolveLegacyScheduleFromReference(reference);
      const response = await importLegacySchedule({
        name: legacy.name,
        tasks: legacy.tasks,
        vacations: legacy.vacations,
        workspaceName: `${legacy.name} 워크스페이스`,
        boardName: legacy.name,
      });
      const workspaceId = response?.workspace?.id || response?.snapshot?.workspace?.id;
      if (workspaceId) onOpenWorkspace(workspaceId);
    } catch (submitError) {
      setError(submitError?.message || '가져오기에 실패했습니다.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 lg:px-8">
      <section className="glass-panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="border-b border-slate-200/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_45%),linear-gradient(135deg,#0f172a_0%,#1e293b_55%,#334155_100%)] p-8 text-white lg:border-b-0 lg:border-r">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-100">
              <Layout size={14} />
              협업 스케줄러
            </div>
            <h1 className="mt-6 max-w-2xl text-4xl font-black tracking-tight">칸반, 팀 플래너, 세부 간트를 한 워크스페이스에서 관리하세요.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-200">
              카드로 진행 상태를 한눈에 보고, 카드별 하위 작업 간트와 선행 관계, 휴무, 읽기 전용 공유 링크까지 함께 관리할 수 있습니다.
            </p>
          </div>
          <div className="p-8">
            {isLoading ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">계정 정보를 불러오는 중...</div>
            ) : isAuthenticated ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">{authUser?.email}</p>
                  <p className="text-xs text-slate-500">승인된 협업 사용자</p>
                </div>
                <form className="space-y-3" onSubmit={createWorkspaceHandler}>
                  <h2 className="text-lg font-black text-slate-900">워크스페이스 만들기</h2>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="워크스페이스 이름" value={workspaceForm.name} onChange={(event) => setWorkspaceForm((current) => ({ ...current, name: event.target.value }))} />
                  <textarea className="min-h-[96px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="설명" value={workspaceForm.description} onChange={(event) => setWorkspaceForm((current) => ({ ...current, description: event.target.value }))} />
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" disabled={isBusy} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700">
                      {isBusy ? '처리 중...' : '워크스페이스 만들기'}
                    </button>
                    <button type="button" disabled={isBusy} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => void importHandler()}>
                      현재 스케줄 가져오기
                    </button>
                  </div>
                </form>
                {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
              </div>
            ) : (
              <InlineAuthPanel />
            )}
          </div>
        </div>
      </section>

      <section className="glass-panel p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-900">내 워크스페이스</h2>
            <p className="text-sm text-slate-500">기존 협업 보드를 열거나 새로 시작하세요.</p>
          </div>
          <button
            type="button"
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void loadWorkspaces()}
            disabled={!isAuthenticated}
          >
            새로고침
          </button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((workspace) => (
            <button key={workspace.id} type="button" onClick={() => onOpenWorkspace(workspace.id)} className="interactive-card min-h-[160px] p-5 text-left">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{formatRoleLabel(workspace.role)}</span>
                <span className="text-xs text-slate-400">{workspace.updatedAt ? new Date(workspace.updatedAt).toLocaleString() : ''}</span>
              </div>
              <h3 className="mt-5 text-xl font-black text-slate-900">{workspace.name}</h3>
              <p className="mt-2 line-clamp-3 text-sm text-slate-600">{workspace.description || '설명 없음'}</p>
            </button>
          ))}
          {!workspaces.length ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-8 text-sm text-slate-500">
              {isAuthenticated ? '아직 워크스페이스가 없습니다.' : '로그인 후 워크스페이스가 표시됩니다.'}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default function CollabApp({ route }) {
  const openWorkspace = useCallback((workspaceId) => navigateTo(buildWorkspacePath(workspaceId)), []);

  if (route.type === 'collab-home') return <HomeScreen onOpenWorkspace={openWorkspace} />;
  if (route.type === 'collab-workspace') return <WorkspaceView workspaceId={route.workspaceId} readOnly={false} />;
  if (route.type === 'collab-share') return <WorkspaceView shareToken={route.token} readOnly />;
  return null;
}
