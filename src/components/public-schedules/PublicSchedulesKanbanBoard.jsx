import PublicScheduleCard from './PublicScheduleCard';

export default function PublicSchedulesKanbanBoard({
  columns = [],
  isLoading = false,
  cardProps = {},
}) {
  if (!columns.length && !isLoading) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-6 text-center text-sm text-slate-400">
        조건에 맞는 프로젝트가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid h-full min-w-full auto-cols-[minmax(280px,1fr)] grid-flow-col gap-3 xl:auto-cols-[minmax(320px,1fr)]">
      {columns.map((column) => (
        <section
          key={`column-${column.id}`}
          className={`flex h-full min-h-[460px] min-w-0 flex-col rounded-[28px] border shadow-sm ${column.tone.shell}`}
        >
          <div className={`m-2.5 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${column.tone.header}`}>
            <h3 className="text-lg font-black">{column.label}</h3>
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-700">
              {column.itemCount}
            </span>
          </div>

          <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto px-2.5 pb-2.5">
            {column.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-center text-sm text-slate-400">
                {isLoading ? '프로젝트를 불러오는 중...' : '이 상태에 해당하는 프로젝트가 없습니다.'}
              </div>
            ) : (
              column.items.map((item, index) => (
                <PublicScheduleCard
                  key={String(item?.id || item?.name || `${column.id}-${index}`)}
                  item={item}
                  tone={column.tone}
                  {...cardProps}
                  isSelected={cardProps.selectedId && String(item?.id || '').trim() === cardProps.selectedId}
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
