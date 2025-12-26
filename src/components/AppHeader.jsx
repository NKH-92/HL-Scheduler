import { useRef } from 'react';
import TabButton from './TabButton';
import { BarChart2, CalendarIcon, CheckSquare, Info, Layout, Save, Upload } from './Icons';

function AppHeader({ activeTab, onTabChange, onSaveProject, onImportFile }) {
  const fileInputRef = useRef(null);

  return (
    <header className="sticky top-0 z-40 w-full transition-all duration-300">
      <div className="absolute inset-0 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-500/30">
            <Layout size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none">HL-Scheduler</h1>
            <span className="text-[10px] font-semibold text-indigo-500 tracking-wider">프로젝트 스케줄러</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center bg-slate-100/50 p-1 rounded-xl border border-slate-200/50">
          <TabButton
            active={activeTab === 'tasks'}
            onClick={() => onTabChange('tasks')}
            icon={<CheckSquare size={16} />}
            label="업무 관리"
          />
          <TabButton
            active={activeTab === 'schedule'}
            onClick={() => onTabChange('schedule')}
            icon={<CalendarIcon size={16} />}
            label="스케줄"
          />
          <TabButton
            active={activeTab === 'dashboard'}
            onClick={() => onTabChange('dashboard')}
            icon={<BarChart2 size={16} />}
            label="대시보드"
          />
          <TabButton
            active={activeTab === 'help'}
            onClick={() => onTabChange('help')}
            icon={<Info size={16} />}
            label="Help"
          />
        </nav>

        <div className="md:hidden">
          <label className="sr-only" htmlFor="mobile-tab-select">
            탭 선택
          </label>
          <select
            id="mobile-tab-select"
            value={activeTab}
            onChange={(e) => onTabChange(e.target.value)}
            className="bg-slate-100/50 border border-slate-200/50 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="tasks">업무 관리</option>
            <option value="schedule">스케줄</option>
            <option value="dashboard">대시보드</option>
            <option value="help">Help</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSaveProject}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="프로젝트 저장"
            type="button"
          >
            <Save size={20} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="불러오기"
            type="button"
          >
            <Upload size={20} />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={onImportFile}
            className="hidden"
            accept=".json"
          />
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
