function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`group relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
        active
          ? 'bg-white text-slate-900 shadow-[0_8px_16px_-12px_rgba(15,23,42,0.7)] ring-1 ring-slate-200'
          : 'text-slate-500 hover:text-slate-800 hover:bg-white/70'
      }`}
    >
      <span className={`transition-colors ${active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`}>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
      {active && <span className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-blue-600" />}
    </button>
  );
}

export default TabButton;
