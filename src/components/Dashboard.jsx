import { useMemo } from 'react';
import { Activity, CheckSquare, Users } from './Icons';

function Dashboard({ tasks, projectName }) {
  const totalProgress = useMemo(
    () => (tasks.length === 0 ? 0 : Math.round(tasks.reduce((acc, curr) => acc + curr.progress, 0) / tasks.length)),
    [tasks],
  );

  const completed = useMemo(() => tasks.filter((t) => t.progress === 100).length, [tasks]);

  const deptStats = useMemo(() => {
    const normalizeDept = (value) => String(value ?? '').trim() || '미지정';
    const stats = {};
    tasks.forEach((t) => {
      const dept = normalizeDept(t.department);
      if (!stats[dept]) stats[dept] = { sum: 0, count: 0 };
      stats[dept].sum += t.progress;
      stats[dept].count += 1;
    });
    return Object.entries(stats)
      .map(([dept, data]) => ({ name: dept, avg: Math.round(data.sum / data.count) }))
      .sort((a, b) => b.avg - a.avg);
  }, [tasks]);

  const StatCard = ({ icon: Icon, tint, label, value, subValue }) => (
    <div className="glass-panel flex items-center gap-4 p-5">
      <div className={`rounded-2xl p-3 ${tint}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
          {value}
          {subValue && <span className="ml-2 text-sm font-semibold text-slate-400">{subValue}</span>}
        </p>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in space-y-5">
      <section className="glass-panel p-5">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">{projectName || '프로젝트'}의 전체 진행 현황을 빠르게 확인하세요.</p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard icon={Activity} tint="bg-blue-50 text-blue-600" label="Total Progress" value={`${totalProgress}%`} />
        <StatCard icon={CheckSquare} tint="bg-emerald-50 text-emerald-600" label="Completed" value={completed} subValue={`/ ${tasks.length}`} />
        <StatCard icon={Users} tint="bg-violet-50 text-violet-600" label="Departments" value={`${deptStats.length}`} subValue="teams" />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass-panel p-5">
          <h3 className="text-sm font-bold text-slate-800">부서별 평균 진척률</h3>
          <div className="mt-4 space-y-4">
            {deptStats.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">표시할 데이터가 없습니다.</div>
            ) : (
              deptStats.map((dept) => (
                <div key={dept.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700">{dept.name}</span>
                    <span className="font-bold text-slate-600">{dept.avg}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
                      style={{ width: `${dept.avg}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass-panel flex h-[420px] flex-col p-5">
          <h3 className="text-sm font-bold text-slate-800">작업 상태</h3>
          <div className="custom-scrollbar mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
            {tasks.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">등록된 작업이 없습니다.</div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 transition hover:border-blue-200"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{task.taskName || '이름 없음'}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                        {task.category || '미지정'}
                      </span>
                      <span>{task.assignee || '담당자 미지정'}</span>
                    </div>
                  </div>
                  <div
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      task.progress === 100
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border border-blue-200 bg-blue-50 text-blue-700'
                    }`}
                  >
                    {task.progress}%
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
