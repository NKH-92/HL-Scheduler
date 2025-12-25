import { useEffect, useMemo, useRef, useState } from 'react';
import { getDaysDiff, getKoreanDay, getWeekNumber, toDate, toUtcMidnightMs } from '../utils/dates';

function GanttChart({ tasks, vacations = [], viewMode = 'Day', rangePadding = { before: 0, after: 0 }, fitEnabled = false, fitPages = 1, isExportMode = false, exportId = 'gantt-export-target' }) {
  const { minDate, maxDate, totalDays } = useMemo(() => {
    const getValidDate = (value) => {
      if (!value) return null;
      return toDate(value);
    };

    const validDates = [
      ...tasks.flatMap((t) => [getValidDate(t.start), getValidDate(t.end || t.start)].filter(Boolean)),
      ...vacations.flatMap((v) => [getValidDate(v.start), getValidDate(v.end || v.start)].filter(Boolean)),
    ];

    let min = null;
    let max = null;
    if (validDates.length === 0) {
      const now = new Date();
      min = new Date(now);
      min.setMonth(min.getMonth() - 1);
      max = new Date(now);
      max.setMonth(max.getMonth() + 1);
    } else {
      min = new Date(Math.min(...validDates));
      max = new Date(Math.max(...validDates));
    }

    if (viewMode === 'Week') {
      min.setDate(min.getDate() - min.getDay());
      max.setDate(max.getDate() + (6 - max.getDay()));
    } else if (viewMode === 'Month') {
      min.setDate(1);
      max = new Date(max.getFullYear(), max.getMonth() + 1, 0);
    }

    const before = Math.max(0, Number(rangePadding.before || 0));
    const after = Math.max(0, Number(rangePadding.after || 0));

    if (viewMode === 'Day') {
      min.setDate(min.getDate() - before);
      max.setDate(max.getDate() + after);
    } else if (viewMode === 'Week') {
      min.setDate(min.getDate() - before * 7);
      max.setDate(max.getDate() + after * 7);
    } else if (viewMode === 'Month') {
      min.setMonth(min.getMonth() - before);
      min.setDate(1);
      max = new Date(max.getFullYear(), max.getMonth() + after + 1, 0);
    }

    const diff = Math.max(0, getDaysDiff(min, max)) + 1;
    return { minDate: min, maxDate: max, totalDays: diff };
  }, [tasks, vacations, viewMode, rangePadding]);

  const viewportRef = useRef(null);
  const leftRowsRef = useRef(null);
  const scrollRafRef = useRef(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  const syncLeftScroll = () => {
    if (isExportMode) return;
    const viewport = viewportRef.current;
    const leftRows = leftRowsRef.current;
    if (!viewport || !leftRows) return;
    const y = viewport.scrollTop || 0;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      leftRows.style.transform = `translateY(-${y}px)`;
    });
  };

  useEffect(() => {
    if (isExportMode) return;
    if (!fitEnabled) return;
    const el = viewportRef.current;
    if (!el) return;

    const update = () => setViewportWidth(el.clientWidth || 0);
    update();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [isExportMode, fitEnabled, viewMode]);

  useEffect(() => {
    syncLeftScroll();
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [isExportMode, viewMode, tasks.length]);

  const config = {
    Day: { colWidth: 60 },
    Week: { colWidth: 24 },
    Month: { colWidth: 8 },
  };

  const baseColWidth = config[viewMode].colWidth;
  const pages = Math.max(1, Number(fitPages || 1));

  let colWidth = baseColWidth;
  if (!isExportMode && fitEnabled && viewportWidth > 0) {
    colWidth = viewportWidth / (Math.max(1, totalDays) * pages);
    colWidth = Math.min(baseColWidth, Math.max(1, colWidth));
  }

  const chartWidth = totalDays * colWidth;

  const renderDoubleHeader = () => {
    const topHeaders = [];
    const bottomHeaders = [];

    const topHeaderClass =
      'flex items-center justify-center border-r border-indigo-100 bg-indigo-50/50 text-xs font-bold text-indigo-900 h-9 backdrop-blur-sm leading-none';
    const bottomHeaderBase =
      'flex items-center justify-center border-r border-slate-100 text-[10px] h-8 font-medium leading-none';

    if (viewMode === 'Day') {
      let tempDate = new Date(minDate);
      for (let i = 0; i < totalDays;) {
        const currentYear = tempDate.getFullYear();
        const currentMonth = tempDate.getMonth();
        let daysInMonth = 0;
        let checkDate = new Date(tempDate);
        while (i + daysInMonth < totalDays && checkDate.getMonth() === currentMonth) {
          daysInMonth += 1;
          checkDate.setDate(checkDate.getDate() + 1);
        }
        topHeaders.push(
          <div
            key={`top-${i}`}
            className={topHeaderClass}
            style={{ width: `${daysInMonth * colWidth}px`, boxSizing: 'border-box' }}
          >
            {currentYear}년 {currentMonth + 1}월
          </div>,
        );
        i += daysInMonth;
        tempDate = new Date(checkDate);
      }
      let bottomDate = new Date(minDate);
      for (let i = 0; i < totalDays; i += 1) {
        const dayName = getKoreanDay(bottomDate);
        const isWeekend = dayName === '토' || dayName === '일';
        bottomHeaders.push(
          <div
            key={`bot-${i}`}
            className={`${
              isWeekend ? 'bg-slate-50/80 text-rose-500' : 'bg-white text-slate-500'
            } ${bottomHeaderBase} ${bottomDate.getDate() === 1 ? 'border-l border-l-indigo-300' : ''}`}
            style={{ width: `${colWidth}px`, boxSizing: 'border-box' }}
          >
            {bottomDate.getDate()} ({dayName})
          </div>,
        );
        bottomDate.setDate(bottomDate.getDate() + 1);
      }
    } else if (viewMode === 'Week') {
      let tempDate = new Date(minDate);
      for (let i = 0; i < totalDays;) {
        const currentYear = tempDate.getFullYear();
        const currentMonth = tempDate.getMonth();
        let daysInMonth = 0;
        let checkDate = new Date(tempDate);
        while (i + daysInMonth < totalDays && checkDate.getMonth() === currentMonth) {
          daysInMonth += 1;
          checkDate.setDate(checkDate.getDate() + 1);
        }
        topHeaders.push(
          <div
            key={`top-w-${i}`}
            className={topHeaderClass}
            style={{ width: `${daysInMonth * colWidth}px`, boxSizing: 'border-box' }}
          >
            {currentYear}년 {currentMonth + 1}월
          </div>,
        );
        i += daysInMonth;
        tempDate = new Date(checkDate);
      }
      let bottomDate = new Date(minDate);
      for (let i = 0; i < totalDays; i += 1) {
        const isMonday = bottomDate.getDay() === 1;
        const showLabel = isMonday || i === 0;
        const isWeekend = bottomDate.getDay() === 0 || bottomDate.getDay() === 6;
        bottomHeaders.push(
          <div
            key={`bot-w-${i}`}
            className={`relative ${isWeekend ? 'bg-slate-50/50' : 'bg-white'} ${bottomHeaderBase} ${
              bottomDate.getDate() === 1 ? 'border-l border-l-indigo-300' : ''
            }`}
            style={{ width: `${colWidth}px`, boxSizing: 'border-box' }}
          >
            {showLabel && (
              <span className="absolute whitespace-nowrap bg-white/80 backdrop-blur px-1.5 py-0.5 rounded-lg border border-slate-200 z-10 shadow-sm text-slate-700">
                {bottomDate.getMonth() + 1}/{bottomDate.getDate()} ({getWeekNumber(bottomDate)}주)
              </span>
            )}
          </div>,
        );
        bottomDate.setDate(bottomDate.getDate() + 1);
      }
    } else if (viewMode === 'Month') {
      let tempDate = new Date(minDate);
      for (let i = 0; i < totalDays;) {
        const currentYear = tempDate.getFullYear();
        let daysInYear = 0;
        let checkDate = new Date(tempDate);
        while (i + daysInYear < totalDays && checkDate.getFullYear() === currentYear) {
          daysInYear += 1;
          checkDate.setDate(checkDate.getDate() + 1);
        }
        topHeaders.push(
          <div
            key={`top-m-${i}`}
            className={`${topHeaderClass} text-indigo-900`}
            style={{ width: `${daysInYear * colWidth}px`, boxSizing: 'border-box' }}
          >
            {currentYear}년
          </div>,
        );
        i += daysInYear;
        tempDate = new Date(checkDate);
      }
      let bottomDate = new Date(minDate);
      for (let i = 0; i < totalDays;) {
        const currentMonth = bottomDate.getMonth();
        let daysInMonth = 0;
        let checkDate = new Date(bottomDate);
        while (i + daysInMonth < totalDays && checkDate.getMonth() === currentMonth) {
          daysInMonth += 1;
          checkDate.setDate(checkDate.getDate() + 1);
        }
        bottomHeaders.push(
          <div
            key={`bot-m-${i}`}
            className={`bg-white ${bottomHeaderBase} text-xs font-bold text-slate-600`}
            style={{ width: `${daysInMonth * colWidth}px`, boxSizing: 'border-box' }}
          >
            {currentMonth + 1}월
          </div>,
        );
        i += daysInMonth;
        bottomDate = new Date(checkDate);
      }
    }

    return (
      <div className="flex flex-col border-b border-indigo-100 bg-white/80 backdrop-blur-md shadow-sm">
        <div className="flex h-9">{topHeaders}</div>
        <div className="flex h-8">{bottomHeaders}</div>
      </div>
    );
  };

  const renderGridBackground = () => {
    const grids = [];
    let d = new Date(minDate);
    if (viewMode === 'Month') {
      for (let i = 0; i < totalDays; i += 1) {
        const isMonthStart = d.getDate() === 1;
        grids.push(
          <div
            key={i}
            className={`border-r border-r-slate-100 h-full bg-white ${isMonthStart ? 'border-l border-l-indigo-200' : ''}`}
            style={{ width: `${colWidth}px`, boxSizing: 'border-box' }}
          />,
        );
        d.setDate(d.getDate() + 1);
      }
    } else {
      for (let i = 0; i < totalDays; i += 1) {
        const dayName = getKoreanDay(d);
        const isWeekend = dayName === '토' || dayName === '일';
        const isMonthStart = d.getDate() === 1;
        grids.push(
          <div
            key={i}
            className={`border-r h-full ${isWeekend ? 'bg-slate-50/50' : 'bg-white'} ${isMonthStart ? 'border-l border-l-indigo-200' : 'border-slate-100'} border-r-slate-100`}
            style={{ width: `${colWidth}px`, boxSizing: 'border-box' }}
          />,
        );
        d.setDate(d.getDate() + 1);
      }
    }
    return grids;
  };

  const renderVacationOverlays = () => {
    const overlays = [];

    const toUtc = (value) => {
      const ms = toUtcMidnightMs(value);
      return Number.isFinite(ms) ? ms : null;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayUtc = toUtc(today);
    let todayOverlapIndex = 0;

    vacations.forEach((v) => {
      const s = v.start;
      const e = v.end || v.start;
      if (!s) return;
      const offset = getDaysDiff(minDate, s);
      const duration = getDaysDiff(s, e) + 1;
      if (Number.isNaN(offset) || Number.isNaN(duration) || duration <= 0) return;

      const startUtc = toUtc(s);
      const endUtc = toUtc(e);
      const minUtc = startUtc !== null && endUtc !== null ? Math.min(startUtc, endUtc) : null;
      const maxUtc = startUtc !== null && endUtc !== null ? Math.max(startUtc, endUtc) : null;
      const overlapsToday =
        todayUtc !== null && minUtc !== null && maxUtc !== null && todayUtc >= minUtc && todayUtc <= maxUtc;

      const labelTopPx = overlapsToday ? 24 + todayOverlapIndex * 18 : 4;
      if (overlapsToday) todayOverlapIndex += 1;

      const left = offset * colWidth;
      const width = duration * colWidth;
      overlays.push(
        <div
          key={v.id}
          className="absolute top-0 bottom-0 bg-rose-100/50 border border-rose-200 pointer-events-none"
          style={{ left: `${left}px`, width: `${width}px` }}
          title={`${v.title}: ${s} ~ ${e}`}
        >
          <div
            className="absolute left-1 text-[10px] font-bold text-rose-700 bg-white/70 border border-rose-200 rounded px-1 whitespace-nowrap"
            style={{ top: `${labelTopPx}px` }}
          >
            {v.title}
          </div>
        </div>,
      );
    });
    return overlays;
  };

  const renderTodayLine = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const min = new Date(minDate);
    const max = new Date(maxDate);
    min.setHours(0, 0, 0, 0);
    max.setHours(0, 0, 0, 0);
    if (today < min || today > max) return null;

    const offset = getDaysDiff(minDate, today);
    const left = (offset + 0.5) * colWidth;

    return (
      <div
        data-gantt-today="true"
        className="absolute top-0 bottom-0 z-20 pointer-events-none"
        style={{ left: `${left}px` }}
      >
            <div
              className="absolute top-0 bottom-0 border-l-2 border-rose-500"
              style={{ left: '-1px', borderStyle: 'dashed' }}
            />
        <div className="absolute top-2 left-0 -translate-x-1/2 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap leading-none">
          Today
        </div>
      </div>
    );
  };

  const headerEl = useMemo(
    () => renderDoubleHeader(),
    [viewMode, totalDays, colWidth, minDate.getTime()],
  );

  const gridBackgroundEl = useMemo(
    () => renderGridBackground(),
    [viewMode, totalDays, colWidth, minDate.getTime()],
  );

  const vacationOverlaysEl = useMemo(
    () => renderVacationOverlays(),
    [vacations, colWidth, minDate.getTime()],
  );

  const containerClass = isExportMode
    ? 'bg-white border border-slate-200 flex flex-col'
    : 'bg-white flex flex-col h-full';

  return (
    <div id={isExportMode ? exportId : 'gantt-main'} className={containerClass}>
      <div className={`flex flex-1 ${isExportMode ? 'overflow-visible' : 'overflow-hidden'}`}>
        <div
          className={`${isExportMode ? 'w-80' : 'w-64'} border-r border-indigo-100 bg-white flex flex-col z-10 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.05)]`}
        >
          <div className="h-[68px] border-b border-indigo-100 bg-white flex items-center px-5 font-bold text-xs text-slate-400 uppercase tracking-wider">
            Task &amp; Assignee
          </div>
          <div className={`${isExportMode ? 'overflow-visible h-auto' : 'overflow-hidden flex-1 relative'}`}>
            <div ref={leftRowsRef} style={isExportMode ? undefined : { willChange: 'transform' }}>
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`${isExportMode ? 'h-14 py-1' : 'h-14 items-center'} border-b border-slate-50 px-5 flex text-sm transition-colors ${isExportMode ? '' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex flex-col w-full overflow-hidden justify-center h-full">
                    <div className="flex justify-between items-center">
                      <span
                        className={`text-slate-700 font-semibold ${
                          isExportMode ? 'text-[12px] leading-snug whitespace-normal break-words' : 'truncate text-[13px]'
                        }`}
                      >
                        {task.taskName}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span
                        className={`text-[11px] text-slate-400 ${
                          isExportMode ? 'whitespace-normal break-words' : 'truncate max-w-[100px]'
                        }`}
                      >
                        {task.department}
                      </span>
                      {task.assignee && (
                        <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                          {task.assignee}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          ref={viewportRef}
          onScroll={syncLeftScroll}
          className={`${isExportMode ? 'relative overflow-visible' : 'flex-1 relative custom-scrollbar'} ${isExportMode ? '' : fitEnabled ? 'overflow-x-hidden overflow-y-auto' : 'overflow-auto'}`}
          style={isExportMode ? { width: `${chartWidth}px` } : undefined}
        >
          <div style={{ width: `${chartWidth}px`, minWidth: '100%' }}>
            <div className={isExportMode ? '' : 'gantt-header-sticky'}>{headerEl}</div>

            <div className="relative">
              <div className="absolute inset-0 flex pointer-events-none z-0">{gridBackgroundEl}</div>

              <div className="absolute inset-0 z-5 pointer-events-none">{vacationOverlaysEl}</div>

              {renderTodayLine()}

              <div className="z-10 relative">
                {tasks.map((task) => {
                  const s = task.start;
                  const e = task.end || task.start;
                  if (!s) {
                    return (
                      <div key={task.id} className="h-14 border-b border-slate-50 relative flex items-center">
                        <span className="text-xs text-slate-400 ml-2">일정 미지정</span>
                      </div>
                    );
                  }

                  const offsetDays = getDaysDiff(minDate, s);
                  const durationDays = getDaysDiff(s, e) + 1;

                  if (Number.isNaN(offsetDays) || Number.isNaN(durationDays) || durationDays <= 0) {
                    return (
                      <div key={task.id} className="h-14 border-b border-slate-50 relative flex items-center">
                        <span className="text-xs text-slate-400 ml-2">일정 오류</span>
                      </div>
                    );
                  }

                  const left = offsetDays * colWidth;
                  const width = durationDays * colWidth;

                  const todayDate = new Date();
                  const endDate = new Date(e);
                  todayDate.setHours(0, 0, 0, 0);
                  endDate.setHours(0, 0, 0, 0);

                  const isDelayed = todayDate > endDate && task.progress < 100;

                  let barClass =
                    'bg-gradient-to-r from-indigo-500 to-blue-500 shadow-md shadow-indigo-200 border border-indigo-400/20';

                  if (isDelayed) {
                    barClass =
                      'bg-gradient-to-r from-rose-500 to-orange-500 shadow-md shadow-rose-200 border border-rose-400/20';
                  } else if (task.progress === 100) {
                    barClass =
                      'bg-gradient-to-r from-emerald-400 to-teal-500 shadow-md shadow-emerald-200 border border-emerald-400/20';
                  }

                  return (
                    <div key={task.id} className="h-14 border-b border-slate-50 relative group flex items-center">
                      <div
                        className={`absolute h-7 rounded-full flex items-center transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${barClass}`}
                        style={{ left: `${left}px`, width: `${width}px` }}
                        title={`${task.taskName} (${task.progress}%) - ${s} ~ ${e}`}
                      >
                        <div className="absolute inset-0 rounded-full overflow-hidden">
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-white/20"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <span className="relative ml-3 text-[10px] font-bold text-white drop-shadow-md whitespace-nowrap leading-none pr-2">
                          {task.progress}% {isDelayed && '(지연)'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 bg-white/70 backdrop-blur-sm text-xs text-slate-600 flex flex-wrap gap-6 border-t border-slate-100 font-medium">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-indigo-50 border border-indigo-200 rounded relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-blue-500 opacity-80" />
          </div>
          진행중
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-emerald-50 border border-emerald-200 rounded relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-500 opacity-80" />
          </div>
          완료됨(100%)
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-rose-50 border border-rose-200 rounded relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-rose-500 to-orange-500 opacity-80" />
          </div>
          <span className="text-rose-600 font-bold">지연된 업무</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-4 bg-rose-500 border-l border-dashed" />
          오늘(Today)
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-rose-100/80 border border-rose-200 rounded" />
          휴가
        </div>
      </div>
    </div>
  );
}

export default GanttChart;
