import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GanttChart from '../components/GanttChart';
import { Layout, Plus, RefreshCw, ShieldCheck, Trash2, Users } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import {
  buildRealtimeSocketUrl,
  createCollabBoard,
  createCollabCard,
  createCollabCardTask,
  createOrUpdateTimeOffEntry,
  createShareLink,
  deleteCollabCard,
  deleteCollabCardTask,
  deleteTimeOffEntry,
  getCollabWorkspaceSnapshot,
  getShareSnapshot,
  importLegacySchedule,
  resolveLegacyScheduleFromReference,
  updateCollabCard,
  updateCollabCardTask,
} from './api';

const todayYmd = () => new Date().toISOString().slice(0, 10);
const VIEW_MODE_LABELS = {
  Day: '일 (Day)',
  Week: '주 (Week)',
  Month: '월 (Month)',
};
const MOBILE_SECTION_LABELS = {
  board: '보드',
  team: '팀',
  detail: '상세',
};

const formatRange = (startDate, endDate) => {
  if (!startDate) return '날짜 없음';
  if (!endDate || endDate === startDate) return startDate;
  return `${startDate} - ${endDate}`;
};

const toGanttTasks = (tasks, cardsById) =>
  (Array.isArray(tasks) ? tasks : []).map((task) => ({
    id: task.id,
    taskName: task.title,
    assignee: task.assigneeName || task.assigneeEmail || '담당자 미지정',
    department: cardsById.get(task.cardId)?.title || '',
    start: task.startDate,
    end: task.endDate || task.startDate,
    progress: Number(task.progress) || 0,
    dependencies: Array.isArray(task.dependencyIds) ? task.dependencyIds : [],
  }));

function Banner({ tone = 'slate', children }) {
  const className =
    tone === 'error'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : tone === 'success'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-slate-50 text-slate-700 border-slate-200';
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${className}`}>{children}</div>;
}

function PresenceStrip({ viewers = [] }) {
  if (!viewers.length) return <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-500">현재 접속 중인 사용자가 없습니다</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {viewers.map((viewer) => (
        <span
          key={`${viewer.viewerId || viewer.viewerEmail || viewer.viewerName}`}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${viewer.readOnly ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}
        >
          {viewer.viewerName || viewer.viewerEmail || '참여자'}
        </span>
      ))}
    </div>
  );
}

function BoardColumn({ column, cards, selectedCardId, onSelect, onCreate, readOnly }) {
  return (
    <section className="flex min-h-[420px] min-w-[280px] flex-col rounded-[28px] border border-slate-200 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{column.name}</span>
          <p className="mt-2 text-xs text-slate-500">카드 {cards.length}개</p>
        </div>
        {!readOnly ? (
          <button type="button" className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700" onClick={() => onCreate(column.id)}>
            <Plus size={14} />
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            className={`rounded-[24px] border p-4 text-left transition ${selectedCardId === card.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold">{card.title}</h3>
              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${selectedCardId === card.id ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600'}`}>{card.progress}%</span>
            </div>
            <p className={`mt-2 line-clamp-2 text-xs ${selectedCardId === card.id ? 'text-slate-200' : 'text-slate-500'}`}>{card.description || '설명 없음'}</p>
            <div className={`mt-3 flex items-center justify-between text-[11px] ${selectedCardId === card.id ? 'text-slate-200' : 'text-slate-500'}`}>
              <span>{card.leadName || card.leadEmail || '담당자 미지정'}</span>
              <span>{formatRange(card.startDate, card.endDate)}</span>
            </div>
          </button>
        ))}
        {!cards.length ? <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">이 컬럼에는 카드가 없습니다.</div> : null}
      </div>
    </section>
  );
}

export default function WorkspaceView({ workspaceId = '', shareToken = '', readOnly = false }) {
  const { isAuthenticated } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('slate');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedCardId, setSelectedCardId] = useState('');
  const [mobileSection, setMobileSection] = useState('board');
  const [viewMode, setViewMode] = useState('Week');
  const [fitEnabled, setFitEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewers, setViewers] = useState([]);
  const refreshRef = useRef(null);

  const loadSnapshot = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const nextSnapshot = readOnly ? await getShareSnapshot(shareToken) : await getCollabWorkspaceSnapshot(workspaceId);
      setSnapshot(nextSnapshot);
    } catch (loadError) {
      setError(loadError?.message || 'Failed to load workspace.');
    } finally {
      setIsLoading(false);
    }
  }, [readOnly, shareToken, workspaceId]);

  refreshRef.current = loadSnapshot;

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const boards = Array.isArray(snapshot?.boards) ? snapshot.boards : [];
  const columns = Array.isArray(snapshot?.columns) ? snapshot.columns : [];
  const cards = Array.isArray(snapshot?.cards) ? snapshot.cards : [];
  const cardTasks = Array.isArray(snapshot?.cardTasks) ? snapshot.cardTasks : [];
  const timeOffEntries = Array.isArray(snapshot?.timeOffEntries) ? snapshot.timeOffEntries : [];

  useEffect(() => {
    if (!boards.length) return;
    setSelectedBoardId((current) => (current && boards.some((board) => board.id === current) ? current : boards[0].id));
  }, [boards]);

  const boardColumns = useMemo(
    () => columns.filter((column) => column.boardId === selectedBoardId).sort((left, right) => left.sortOrder - right.sortOrder),
    [columns, selectedBoardId],
  );
  const boardCards = useMemo(() => cards.filter((card) => card.boardId === selectedBoardId), [cards, selectedBoardId]);

  useEffect(() => {
    if (!boardCards.length) {
      setSelectedCardId('');
      return;
    }
    setSelectedCardId((current) => (current && boardCards.some((card) => card.id === current) ? current : boardCards[0].id));
  }, [boardCards]);

  const selectedCard = useMemo(() => boardCards.find((card) => card.id === selectedCardId) || null, [boardCards, selectedCardId]);
  const selectedTasks = useMemo(() => cardTasks.filter((task) => task.cardId === selectedCardId), [cardTasks, selectedCardId]);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  const detailTasks = useMemo(() => toGanttTasks(selectedTasks, cardsById), [selectedTasks, cardsById]);
  const plannerTasks = useMemo(
    () => toGanttTasks(cardTasks.filter((task) => cardsById.get(task.cardId)?.boardId === selectedBoardId), cardsById),
    [cardTasks, cardsById, selectedBoardId],
  );

  const runAction = useCallback(async (label, action) => {
    setMessage('');
    try {
      await action();
      setMessageTone('success');
      setMessage(`${label} 작업을 완료했습니다.`);
      await refreshRef.current?.();
    } catch (actionError) {
      setMessageTone('error');
      setMessage(actionError?.message || `${label} 작업에 실패했습니다.`);
      if (actionError?.status === 409) {
        await refreshRef.current?.();
      }
    }
  }, []);

  useEffect(() => {
    const socketUrl = buildRealtimeSocketUrl(readOnly ? { shareToken } : { workspaceId: snapshot?.workspace?.id });
    if (!socketUrl) return undefined;
    const socket = new WebSocket(socketUrl);
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'presence' || payload?.type === 'hello') {
          setViewers(Array.isArray(payload.viewers) ? payload.viewers : []);
          return;
        }
        if (payload?.type === 'event') {
          void refreshRef.current?.();
        }
      } catch {
        // ignore malformed realtime payloads
      }
    };
    const interval = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
    }, 20000);
    return () => {
      window.clearInterval(interval);
      socket.close();
    };
  }, [readOnly, shareToken, snapshot?.workspace?.id]);

  if (!readOnly && !isAuthenticated) {
    return <div className="p-8"><Banner tone="error">`/collab`에서 먼저 승인된 계정으로 로그인하세요.</Banner></div>;
  }
  if (isLoading) {
    return <div className="p-8 text-sm text-slate-500">워크스페이스를 불러오는 중...</div>;
  }
  if (error) {
    return <div className="p-8"><Banner tone="error">{error}</Banner></div>;
  }
  if (!snapshot) {
    return <div className="p-8 text-sm text-slate-500">워크스페이스를 찾을 수 없습니다.</div>;
  }

  const isBoardShare = readOnly && snapshot?.share?.scope === 'board';
  const mobileSections = isBoardShare ? ['board', 'detail'] : ['board', 'team', 'detail'];

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 lg:px-8">
      <section className="glass-panel overflow-hidden p-5 lg:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                <Layout size={14} />
                {readOnly ? '공유 보기' : '워크스페이스'}
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">{snapshot?.workspace?.name || '워크스페이스'}</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">{snapshot?.workspace?.description || '칸반 보드, 세부 간트, 팀 플래너를 한곳에서 실시간으로 함께 관리합니다.'}</p>
            </div>
            <div className="flex flex-col gap-3 xl:items-end">
              <PresenceStrip viewers={viewers} />
              <div className="flex flex-wrap gap-2">
                {!readOnly ? (
                  <>
                    <button
                      type="button"
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                      onClick={() =>
                        void runAction('보드 만들기', async () => {
                          const name = window.prompt('보드 이름');
                          if (!name) return;
                          await createCollabBoard({ workspaceId, name });
                        })
                      }
                    >
                      새 보드
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                      onClick={() =>
                        void runAction('보드 공유 링크 만들기', async () => {
                          const response = await createShareLink({ workspaceId: snapshot.workspace.id, scope: 'board', boardId: selectedBoardId });
                          if (response?.sharePath && navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(`${window.location.origin}${response.sharePath}`);
                          }
                        })
                      }
                    >
                      보드 공유
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                      onClick={() =>
                        void runAction('워크스페이스 공유 링크 만들기', async () => {
                          const response = await createShareLink({ workspaceId: snapshot.workspace.id, scope: 'workspace' });
                          if (response?.sharePath && navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(`${window.location.origin}${response.sharePath}`);
                          }
                        })
                      }
                    >
                      워크스페이스 공유
                    </button>
                  </>
                ) : null}
                <button type="button" title="새로고침" aria-label="새로고침" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={() => void loadSnapshot()}>
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
          </div>
          {message ? <Banner tone={messageTone}>{message}</Banner> : null}
          <div className="flex flex-wrap gap-2">
            {boards.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => setSelectedBoardId(board.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selectedBoardId === board.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
              >
                {board.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2 lg:hidden">
            {mobileSections.map((section) => (
              <button
                key={section}
                type="button"
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${mobileSection === section ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}
                onClick={() => setMobileSection(section)}
              >
                {MOBILE_SECTION_LABELS[section] || section}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className={`${mobileSection === 'board' ? 'block' : 'hidden'} glass-panel min-h-[520px] overflow-hidden p-4 lg:block`}>
          <div className="flex min-h-[480px] gap-4 overflow-x-auto pb-3">
            {boardColumns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                cards={boardCards.filter((card) => card.columnId === column.id)}
                selectedCardId={selectedCardId}
                onSelect={(cardId) => {
                  setSelectedCardId(cardId);
                  setMobileSection('detail');
                }}
                readOnly={readOnly}
                onCreate={(columnId) =>
                  void runAction('카드 만들기', async () => {
                    const title = window.prompt('카드 제목', '새 카드');
                    if (!title) return;
                    await createCollabCard({ workspaceId: snapshot.workspace.id, boardId: selectedBoardId, columnId, title });
                  })
                }
              />
            ))}
          </div>
        </section>

        <aside className={`${mobileSection === 'detail' ? 'block' : 'hidden'} glass-panel overflow-hidden p-5 lg:block`}>
          {selectedCard ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{selectedCard.title}</h2>
                  <p className="text-sm text-slate-500">{formatRange(selectedCard.startDate, selectedCard.endDate)}</p>
                </div>
                {!readOnly ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                      onClick={() =>
                        void runAction('카드 수정', async () => {
                          const title = window.prompt('카드 제목', selectedCard.title);
                          if (!title) return;
                          const description = window.prompt('카드 설명', selectedCard.description || '') ?? '';
                          await updateCollabCard(selectedCard.id, {
                            baseVersion: selectedCard.version,
                            title,
                            description,
                          });
                        })
                      }
                    >
                      수정
                    </button>
                    <button type="button" className="rounded-2xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700" onClick={() => void runAction('카드 삭제', async () => deleteCollabCard(selectedCard.id, { baseVersion: selectedCard.version }))}>
                      삭제
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-slate-900">세부 간트</h3>
                  <div className="flex items-center gap-2">
                    {['Day', 'Week', 'Month'].map((mode) => (
                      <button key={mode} type="button" className={`rounded-full px-3 py-1 text-xs font-semibold ${viewMode === mode ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`} onClick={() => setViewMode(mode)}>
                        {VIEW_MODE_LABELS[mode] || mode}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-3 flex items-center gap-3">
                  <button type="button" className={`rounded-full px-3 py-1 text-xs font-semibold ${fitEnabled ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`} onClick={() => setFitEnabled((current) => !current)}>
                    화면 맞춤 (Fit)
                  </button>
                  <input type="range" min="0.6" max="2.2" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
                </div>
                <div className="h-[340px] overflow-hidden rounded-3xl border border-slate-200 bg-white">
                  <GanttChart
                    tasks={detailTasks}
                    vacations={timeOffEntries.map((entry) => ({ id: entry.id, title: entry.title, start: entry.startDate, end: entry.endDate }))}
                    viewMode={viewMode}
                    rangePadding={{ before: 7, after: 14 }}
                    fitEnabled={fitEnabled}
                    zoom={zoom}
                    onTaskDateChange={
                      readOnly
                        ? undefined
                        : (taskId, startDate, endDate) => {
                            const task = selectedTasks.find((item) => item.id === taskId);
                            if (!task) return;
                            void runAction('작업 일정 이동', async () => {
                              await updateCollabCardTask(taskId, { baseVersion: task.version, startDate, endDate });
                            });
                          }
                    }
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900">하위 작업</h3>
                  {!readOnly ? (
                    <button
                      type="button"
                      className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                      onClick={() =>
                        void runAction('하위 작업 만들기', async () => {
                          const title = window.prompt('하위 작업 제목', '새 하위 작업');
                          if (!title) return;
                          await createCollabCardTask({
                            cardId: selectedCard.id,
                            title,
                            startDate: todayYmd(),
                            endDate: todayYmd(),
                            progress: 0,
                          });
                        })
                      }
                    >
                      하위 작업 추가
                    </button>
                  ) : null}
                </div>
                {selectedTasks.map((task) => (
                  <div key={task.id} className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{task.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {task.assigneeName || task.assigneeEmail || '담당자 미지정'} · {formatRange(task.startDate, task.endDate)}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{task.progress}%</span>
                    </div>
                    {!readOnly ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                          onClick={() =>
                            void runAction('하위 작업 수정', async () => {
                              const title = window.prompt('하위 작업 제목', task.title);
                              if (!title) return;
                              const assigneeName = window.prompt('담당자', task.assigneeName || '') ?? '';
                              const progress = window.prompt('진행률 0-100', String(task.progress)) ?? String(task.progress);
                              await updateCollabCardTask(task.id, {
                                baseVersion: task.version,
                                title,
                                assigneeName,
                                progress: Number(progress) || 0,
                              });
                            })
                          }
                        >
                          수정
                        </button>
                        <button type="button" className="rounded-2xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700" onClick={() => void runAction('하위 작업 삭제', async () => deleteCollabCardTask(task.id, { baseVersion: task.version }))}>
                          삭제
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm text-slate-500">카드를 선택하면 세부 간트와 하위 작업을 볼 수 있습니다.</div>
          )}
        </aside>
      </div>

      {!isBoardShare && (
        <section className={`${mobileSection === 'team' ? 'block' : 'hidden'} glass-panel overflow-hidden p-5 lg:block`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">팀 플래너</h2>
            <p className="text-sm text-slate-500">선택한 보드의 모든 하위 작업을 담당자 기준으로 한눈에 보여줍니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!readOnly ? (
              <>
                <button
                  type="button"
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  onClick={() =>
                    void runAction('휴무 추가', async () => {
                      const title = window.prompt('휴무 제목', '휴무');
                      if (!title) return;
                      const startDate = window.prompt('시작일 YYYY-MM-DD', todayYmd());
                      if (!startDate) return;
                      const endDate = window.prompt('종료일 YYYY-MM-DD', startDate) || startDate;
                      await createOrUpdateTimeOffEntry({ workspaceId: snapshot.workspace.id, title, startDate, endDate });
                    })
                  }
                >
                  휴무 추가
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  onClick={() =>
                    void runAction('기존 일정 가져오기', async () => {
                      const reference = window.prompt('공개 일정 URL 또는 ID');
                      if (!reference) return;
                      const legacy = await resolveLegacyScheduleFromReference(reference);
                      await importLegacySchedule({
                        workspaceId: snapshot.workspace.id,
                        name: legacy.name,
                        tasks: legacy.tasks,
                        vacations: legacy.vacations,
                        boardName: legacy.name,
                      });
                    })
                  }
                >
                  기존 일정 가져오기
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {timeOffEntries.map((entry) => (
            <div key={entry.id} className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
              <span>{entry.title}</span>
              <span>{formatRange(entry.startDate, entry.endDate)}</span>
              {!readOnly ? <button type="button" onClick={() => void runAction('휴무 삭제', async () => deleteTimeOffEntry(entry.id, { baseVersion: entry.version }))}><Trash2 size={12} /></button> : null}
            </div>
          ))}
        </div>

        <div className="mt-5 h-[420px] overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <GanttChart
            tasks={plannerTasks}
            vacations={timeOffEntries.map((entry) => ({ id: entry.id, title: entry.title, start: entry.startDate, end: entry.endDate }))}
            viewMode={viewMode}
            rangePadding={{ before: 7, after: 14 }}
            fitEnabled={fitEnabled}
            zoom={zoom}
          />
        </div>
        </section>
      )}
    </div>
  );
}
