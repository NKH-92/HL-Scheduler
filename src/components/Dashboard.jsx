import { useMemo } from 'react';
import { Activity, CheckSquare, Users } from './Icons';

function Dashboard({ tasks, projectName }) {
  const totalProgress = useMemo(
    () => (tasks.length === 0 ? 0 : Math.round(tasks.reduce((acc, curr) => acc + curr.progress, 0) / tasks.length)),
    [tasks],
  );

  const completed = useMemo(() => tasks.filter((t) => t.progress === 100).length, [tasks]);

  const deptStats = useMemo(() => {
    const stats = {};
    tasks.forEach((t) => {
      if (!stats[t.department]) stats[t.department] = { sum: 0, count: 0 };
      stats[t.department].sum += t.progress;
      stats[t.department].count += 1;
    });
    return Object.entries(stats).map(([dept, data]) => ({ name: dept, avg: Math.round(data.sum / data.count) }));
  }, [tasks]);

  const StatCard = ({ icon: Icon, colorClass, bgClass, label, value, subValue }) => (
    <div className="bg-white p-6 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-5 transition-transform hover:-translate-y-1 duration-300">
      <div className={`p-4 rounded-2xl ${bgClass} ${colorClass} shadow-inner`}>
        <Icon size={28} />
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-3xl font-extrabold text-slate-800 tracking-tight">
          {value}
          {subValue && <span className="text-sm text-slate-400 font-medium ml-2">{subValue}</span>}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Dashboard</h2>
        <p className="text-slate-500 mt-1">{projectName || '프로젝트'}의 실시간 진행 현황을 확인하세요.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={Activity} bgClass="bg-blue-50" colorClass="text-blue-600" label="Total Progress" value={`${totalProgress}%`} />
        <StatCard
          icon={CheckSquare}
          bgClass="bg-emerald-50"
          colorClass="text-emerald-600"
          label="Completed Tasks"
          value={completed}
          subValue={`/ ${tasks.length}`}
        />
        <StatCard
          icon={Users}
          bgClass="bg-violet-50"
          colorClass="text-violet-600"
          label="Active Departments"
          value={`${deptStats.length}`}
          subValue="Teams"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-6">부서별 진행률</h3>
          <div className="space-y-5">
            {deptStats.map((dept) => (
              <div key={dept.name} className="group">
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">
                    {dept.name}
                  </span>
                  <span className="font-bold text-slate-600">{dept.avg}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-1000 ease-out shadow-sm"
                    style={{ width: `${dept.avg}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 flex flex-col h-[400px]">
          <h3 className="text-lg font-bold text-slate-800 mb-6">최근 업무 현황</h3>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all group"
              >
                <div className="flex flex-col overflow-hidden">
                  <span className="font-bold text-slate-700 text-sm truncate group-hover:text-indigo-700">{task.taskName}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      {task.category}
                    </span>
                    <span className="text-xs text-slate-500">{task.assignee || '미배정'}</span>
                  </div>
                </div>
                <div
                  className={`text-sm font-bold px-3 py-1 rounded-full ${
                    task.progress === 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-indigo-600 border border-indigo-100'
                  }`}
                >
                  {task.progress}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
