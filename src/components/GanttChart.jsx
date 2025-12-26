import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, getDaysDiff, getKoreanDay, getWeekNumber, toDate, toUtcMidnightMs } from '../utils/dates';

function GanttChart({
  tasks,
  vacations = [],
  viewMode = 'Day',
  rangePadding = { before: 0, after: 0 },
  fitEnabled = false,
  fitPages = 1,
  zoom = 1,
  isExportMode = false,
  exportId = 'gantt-export-target',
  onTaskDateChange,
}) {
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
      const getMondayIndex = (date) => (date.getDay() + 6) % 7; // Monday=0 ... Sunday=6
      min.setDate(min.getDate() - getMondayIndex(min));
      max.setDate(max.getDate() + (6 - getMondayIndex(max)));
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
  const leftPaneRef = useRef(null);
  const leftRowsRef = useRef(null);
  const todayOverlayRef = useRef(null);
  const scrollRafRef = useRef(0);
  const [viewportRect, setViewportRect] = useState({ width: 0, height: 0 });
  const [rowWindow, setRowWindow] = useState(() => ({
    start: 0,
    end: tasks.length > 80 ? Math.min(tasks.length, 50) : tasks.length,
  }));
  const [colWindow, setColWindow] = useState(() => ({
    start: 0,
    end: totalDays > 120 ? Math.min(totalDays, 200) : totalDays,
  }));
  const dragInfoRef = useRef(null);
  const dragCleanupRef = useRef(null);
  const [dragPreview, setDragPreview] = useState(null);

  const HEADER_HEIGHT_PX = 68;
  const ROW_HEIGHT_PX = 56;

  const isInteractive = !isExportMode && typeof onTaskDateChange === 'function';

  useEffect(() => {
    return () => {
      if (dragCleanupRef.current) dragCleanupRef.current();
    };
  }, []);

  const shiftDate = (date, deltaDays) => {
    const next = new Date(date);
    next.setDate(next.getDate() + deltaDays);
    next.setHours(0, 0, 0, 0);
    return next;
  };

  const startDrag = (event, task, mode) => {
    if (!isInteractive) return;
    if (event.button != null && event.button !== 0) return;
    if (!task?.start) return;

    const parsedStart = toDate(task.start);
    const parsedEnd = toDate(task.end || task.start) || parsedStart;
    if (!parsedStart || !parsedEnd) return;

    if (dragCleanupRef.current) dragCleanupRef.current();

    event.preventDefault();
    event.stopPropagation();

    let start = parsedStart;
    let end = parsedEnd;
    if (end < start) [start, end] = [end, start];

    const originStart = new Date(start);
    originStart.setHours(0, 0, 0, 0);
    const originEnd = new Date(end);
    originEnd.setHours(0, 0, 0, 0);

    const originStartYmd = formatDate(originStart);
    const originEndYmd = formatDate(originEnd);

    dragInfoRef.current = {
      taskId: task.id,
      mode,
      startX: event.clientX,
      colWidth: Math.max(1, Number(colWidth) || 1),
      originStart,
      originEnd,
      originStartYmd,
      originEndYmd,
      latestStartYmd: originStartYmd,
      latestEndYmd: originEndYmd,
    };

    setDragPreview({ taskId: task.id, start: originStartYmd, end: originEndYmd, mode });

    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    let finished = false;

    const handleMove = (moveEvent) => {
      const info = dragInfoRef.current;
      if (!info) return;

      const dx = moveEvent.clientX - info.startX;
      const deltaDays = Math.round(dx / info.colWidth);

      let nextStart = info.originStart;
      let nextEnd = info.originEnd;

      if (info.mode === 'move') {
        nextStart = shiftDate(info.originStart, deltaDays);
        nextEnd = shiftDate(info.originEnd, deltaDays);
      } else if (info.mode === 'resizeStart') {
        nextStart = shiftDate(info.originStart, deltaDays);
        nextEnd = info.originEnd;
        if (nextStart > nextEnd) nextStart = new Date(nextEnd);
      } else if (info.mode === 'resizeEnd') {
        nextStart = info.originStart;
        nextEnd = shiftDate(info.originEnd, deltaDays);
        if (nextEnd < nextStart) nextEnd = new Date(nextStart);
      }

      const nextStartYmd = formatDate(nextStart);
      const nextEndYmd = formatDate(nextEnd);

      if (nextStartYmd === info.latestStartYmd && nextEndYmd === info.latestEndYmd) return;

      info.latestStartYmd = nextStartYmd;
      info.latestEndYmd = nextEndYmd;

      setDragPreview((prev) => {
        if (
          prev &&
          prev.taskId === info.taskId &&
          prev.mode === info.mode &&
          prev.start === nextStartYmd &&
          prev.end === nextEndYmd
        ) {
          return prev;
        }
        return { taskId: info.taskId, mode: info.mode, start: nextStartYmd, end: nextEndYmd };
      });
    };

    const finishDrag = () => {
      if (finished) return;
      finished = true;

      const info = dragInfoRef.current;
      if (info && (info.latestStartYmd !== info.originStartYmd || info.latestEndYmd !== info.originEndYmd)) {
        onTaskDateChange(info.taskId, info.latestStartYmd, info.latestEndYmd);
      }

      if (dragCleanupRef.current) dragCleanupRef.current();
      dragCleanupRef.current = null;
      dragInfoRef.current = null;
      setDragPreview(null);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      document.body.style.userSelect = prevUserSelect;
    };

    dragCleanupRef.current = cleanup;

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
  };

  const syncLeftScroll = () => {
    if (isExportMode) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const leftRows = leftRowsRef.current;
    const todayOverlay = todayOverlayRef.current;
    const y = viewport.scrollTop || 0;
    const x = viewport.scrollLeft || 0;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      if (leftRows) leftRows.style.transform = `translateY(-${y}px)`;
      if (todayOverlay) todayOverlay.style.transform = `translateX(-${x}px)`;
      updateVirtualWindows(y, x, viewport.clientHeight || 0, viewport.clientWidth || 0);
    });
  };

  const updateVirtualWindows = (scrollTop, scrollLeft, clientHeight, clientWidth) => {
    if (isExportMode) return;

    const rowCount = tasks.length;
    const enableRowVirtualization = rowCount > 80 && clientHeight > 0;

    if (enableRowVirtualization) {
      const overscanRows = 8;
      const start = Math.max(0, Math.floor((scrollTop - HEADER_HEIGHT_PX) / ROW_HEIGHT_PX) - overscanRows);
      const end = Math.min(
        rowCount,
        Math.ceil((scrollTop + clientHeight - HEADER_HEIGHT_PX) / ROW_HEIGHT_PX) + overscanRows,
      );
      setRowWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    } else {
      setRowWindow((prev) => (prev.start === 0 && prev.end === rowCount ? prev : { start: 0, end: rowCount }));
    }

    const enableColVirtualization =
      !fitEnabled && totalDays > 120 && clientWidth > 0 && Number.isFinite(colWidth) && colWidth > 0;

    if (enableColVirtualization) {
      const overscanCols = Math.ceil(800 / colWidth);
      const start = Math.max(0, Math.floor(scrollLeft / colWidth) - overscanCols);
      const end = Math.min(totalDays, Math.ceil((scrollLeft + clientWidth) / colWidth) + overscanCols);
      setColWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    } else {
      setColWindow((prev) => (prev.start === 0 && prev.end === totalDays ? prev : { start: 0, end: totalDays }));
    }
  };

  useEffect(() => {
    if (isExportMode) return;
    const el = viewportRef.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth || 0;
      const height = el.clientHeight || 0;
      setViewportRect((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    update();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [isExportMode]);

  useEffect(() => {
    syncLeftScroll();
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [
    isExportMode,
    fitEnabled,
    fitPages,
    viewMode,
    tasks.length,
    totalDays,
    viewportRect.width,
    viewportRect.height,
  ]);

  useEffect(() => {
    if (isExportMode) return;
    const leftPane = leftPaneRef.current;
    if (!leftPane) return;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const handleWheel = (event) => {
      if (event.ctrlKey) return;
      const viewport = viewportRef.current;
      if (!viewport) return;

      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      let rawDeltaX = event.deltaX;
      let rawDeltaY = event.deltaY;
      if (event.shiftKey && rawDeltaX === 0) {
        rawDeltaX = rawDeltaY;
        rawDeltaY = 0;
      }
      const deltaY = rawDeltaY * scale;
      const deltaX = rawDeltaX * scale;

      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);

      const nextTop = clamp(viewport.scrollTop + deltaY, 0, maxScrollTop);
      const nextLeft = fitEnabled ? viewport.scrollLeft : clamp(viewport.scrollLeft + deltaX, 0, maxScrollLeft);

      if (nextTop === viewport.scrollTop && nextLeft === viewport.scrollLeft) return;

      event.preventDefault();
      viewport.scrollTop = nextTop;
      if (!fitEnabled) viewport.scrollLeft = nextLeft;
    };

    leftPane.addEventListener('wheel', handleWheel, { passive: false });
    return () => leftPane.removeEventListener('wheel', handleWheel);
  }, [isExportMode, fitEnabled]);

  const config = {
    Day: { colWidth: 60 },
    Week: { colWidth: 24 },
    Month: { colWidth: 8 },
  };

  const rawZoom = Number(zoom);
  const zoomFactor = Number.isFinite(rawZoom) ? rawZoom : 1;
  const clampedZoom = Math.max(0.25, Math.min(4, zoomFactor));

  const baseColWidth = config[viewMode].colWidth;
  const maxColWidth = baseColWidth * clampedZoom;
  const pages = Math.max(1, Number(fitPages || 1));

  let colWidth = maxColWidth;
  if (!isExportMode && fitEnabled && viewportRect.width > 0) {
    colWidth = viewportRect.width / (Math.max(1, totalDays) * pages);
    colWidth = Math.min(maxColWidth, Math.max(1, colWidth));
  }

  const chartWidth = totalDays * colWidth;

  const rowCount = tasks.length;
  const enableRowVirtualization = !isExportMode && rowCount > 80;
  const rowStart = enableRowVirtualization ? Math.max(0, Math.min(rowCount, rowWindow.start)) : 0;
  const rowEnd = enableRowVirtualization ? Math.max(rowStart, Math.min(rowCount, rowWindow.end)) : rowCount;
  const visibleTasks = enableRowVirtualization ? tasks.slice(rowStart, rowEnd) : tasks;
  const rowTopSpacerPx = enableRowVirtualization ? rowStart * ROW_HEIGHT_PX : 0;
  const rowBottomSpacerPx = enableRowVirtualization ? (rowCount - rowEnd) * ROW_HEIGHT_PX : 0;

  const enableColVirtualization =
    !isExportMode && !fitEnabled && totalDays > 120 && Number.isFinite(colWidth) && colWidth > 0;
  const colStart = enableColVirtualization ? Math.max(0, Math.min(totalDays, colWindow.start)) : 0;
  const colEnd = enableColVirtualization ? Math.max(colStart, Math.min(totalDays, colWindow.end)) : totalDays;

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
      bottomDate.setDate(bottomDate.getDate() + colStart);
      if (colStart > 0) {
        bottomHeaders.push(
          <div
            key="bot-spacer-left"
            className="shrink-0"
            style={{ width: `${colStart * colWidth}px`, boxSizing: 'border-box' }}
          />,
        );
      }
      for (let i = colStart; i < colEnd; i += 1) {
        const dayName = getKoreanDay(bottomDate);
        const isWeekend = dayName === '토' || dayName === '일';
        bottomHeaders.push(
          <div
            key={`bot-${i}`}
            className={`${
              isWeekend ? 'bg-slate-100/80 text-rose-600' : 'bg-white text-slate-500'
            } ${bottomHeaderBase} ${bottomDate.getDate() === 1 ? 'border-l border-l-indigo-300' : ''}`}
            style={{ width: `${colWidth}px`, boxSizing: 'border-box' }}
          >
            {bottomDate.getDate()} ({dayName})
          </div>,
        );
        bottomDate.setDate(bottomDate.getDate() + 1);
      }
      if (colEnd < totalDays) {
        bottomHeaders.push(
          <div
            key="bot-spacer-right"
            className="shrink-0"
            style={{ width: `${(totalDays - colEnd) * colWidth}px`, boxSizing: 'border-box' }}
          />,
        );
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
      bottomDate.setDate(bottomDate.getDate() + colStart);
      if (colStart > 0) {
        bottomHeaders.push(
          <div
            key="bot-w-spacer-left"
            className="shrink-0"
            style={{ width: `${colStart * colWidth}px`, boxSizing: 'border-box' }}
          />,
        );
      }
      for (let i = colStart; i < colEnd; i += 1) {
        const isMonday = bottomDate.getDay() === 1;
        const showLabel = isMonday;
        const isWeekend = bottomDate.getDay() === 0 || bottomDate.getDay() === 6;
        bottomHeaders.push(
          <div
            key={`bot-w-${i}`}
            className={`relative ${isWeekend ? 'bg-slate-100/70' : 'bg-white'} ${bottomHeaderBase} ${
              bottomDate.getDate() === 1 ? 'border-l border-l-indigo-300' : ''
            }`}
            style={{ width: `${colWidth}px`, boxSizing: 'border-box' }}
          >
            {showLabel && (
              <span className="absolute left-1 top-1/2 -translate-y-1/2 whitespace-nowrap bg-white/90 backdrop-blur px-1.5 py-0.5 rounded-lg border border-slate-200 z-10 shadow-sm text-slate-700">
                {bottomDate.getMonth() + 1}/{bottomDate.getDate()} ({getWeekNumber(bottomDate)}주)
              </span>
            )}
          </div>,
        );
        bottomDate.setDate(bottomDate.getDate() + 1);
      }
      if (colEnd < totalDays) {
        bottomHeaders.push(
          <div
            key="bot-w-spacer-right"
            className="shrink-0"
            style={{ width: `${(totalDays - colEnd) * colWidth}px`, boxSizing: 'border-box' }}
          />,
        );
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
    d.setDate(d.getDate() + colStart);

    if (colStart > 0) {
      grids.push(
        <div
          key="grid-spacer-left"
          className="shrink-0 h-full"
          style={{ width: `${colStart * colWidth}px`, boxSizing: 'border-box' }}
        />,
      );
    }

    if (viewMode === 'Month') {
      for (let i = colStart; i < colEnd; i += 1) {
        const isMonthStart = d.getDate() === 1;
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        grids.push(
          <div
            key={i}
            className={`border-r border-r-slate-100 h-full ${isWeekend ? 'bg-slate-100/60' : 'bg-white'} ${isMonthStart ? 'border-l border-l-indigo-200' : ''}`}
            style={{ width: `${colWidth}px`, boxSizing: 'border-box' }}
          />,
        );
        d.setDate(d.getDate() + 1);
      }
    } else {
      for (let i = colStart; i < colEnd; i += 1) {
        const dayName = getKoreanDay(d);
        const isWeekend = dayName === '토' || dayName === '일';
        const isMonthStart = d.getDate() === 1;
        grids.push(
          <div
            key={i}
            className={`border-r h-full ${isWeekend ? 'bg-slate-100/60' : 'bg-white'} ${isMonthStart ? 'border-l border-l-indigo-200' : 'border-slate-100'} border-r-slate-100`}
            style={{ width: `${colWidth}px`, boxSizing: 'border-box' }}
          />,
        );
        d.setDate(d.getDate() + 1);
      }
    }

    if (colEnd < totalDays) {
      grids.push(
        <div
          key="grid-spacer-right"
          className="shrink-0 h-full"
          style={{ width: `${(totalDays - colEnd) * colWidth}px`, boxSizing: 'border-box' }}
        />,
      );
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

  const renderTodayOverlay = () => {
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
        ref={todayOverlayRef}
        data-gantt-today="true"
        className="absolute top-0 bottom-0 z-30 pointer-events-none"
        style={{ left: `${left}px` }}
      >
        <div
          className="absolute border-l-2 border-rose-500"
          style={{ top: `${HEADER_HEIGHT_PX}px`, bottom: 0, left: '-1px', borderStyle: 'dashed' }}
        />
        <div
          className="absolute left-0 -translate-x-1/2 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap leading-none"
          style={{ top: `${HEADER_HEIGHT_PX + 8}px` }}
        >
          Today
        </div>
      </div>
    );
  };

  const headerEl = useMemo(
    () => renderDoubleHeader(),
    [viewMode, totalDays, colWidth, minDate.getTime(), colStart, colEnd],
  );

  const gridBackgroundEl = useMemo(
    () => renderGridBackground(),
    [viewMode, totalDays, colWidth, minDate.getTime(), colStart, colEnd],
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
          ref={leftPaneRef}
          className={`${isExportMode ? 'w-80' : 'w-64'} border-r border-indigo-100 bg-white flex flex-col z-10 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.05)]`}
        >
          <div className="h-[68px] border-b border-indigo-100 bg-white flex items-center px-5 font-bold text-xs text-slate-400 uppercase tracking-wider">
            Task &amp; Assignee
          </div>
          <div className={`${isExportMode ? 'overflow-visible h-auto' : 'overflow-hidden flex-1 relative'}`}>
            <div ref={leftRowsRef} style={isExportMode ? undefined : { willChange: 'transform' }}>
              {rowTopSpacerPx > 0 && <div style={{ height: `${rowTopSpacerPx}px` }} />}
              {visibleTasks.map((task) => (
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
              {rowBottomSpacerPx > 0 && <div style={{ height: `${rowBottomSpacerPx}px` }} />}
            </div>
          </div>
        </div>

        <div
          className={isExportMode ? 'relative overflow-visible' : 'flex-1 relative overflow-hidden'}
          style={isExportMode ? { width: `${chartWidth}px` } : undefined}
        >
          {renderTodayOverlay()}
          <div
            ref={viewportRef}
            onScroll={syncLeftScroll}
            className={`${isExportMode ? 'relative overflow-visible' : 'h-full w-full custom-scrollbar'} ${isExportMode ? '' : fitEnabled ? 'overflow-x-hidden overflow-y-auto' : 'overflow-auto'}`}
          >
            <div style={{ width: `${chartWidth}px`, minWidth: '100%' }}>
              <div className={isExportMode ? '' : 'gantt-header-sticky'}>{headerEl}</div>

              <div className="relative">
                <div className="absolute inset-0 flex pointer-events-none z-0">{gridBackgroundEl}</div>

                <div className="absolute inset-0 z-5 pointer-events-none">{vacationOverlaysEl}</div>

                <div className="z-10 relative">
                  {rowTopSpacerPx > 0 && <div style={{ height: `${rowTopSpacerPx}px` }} />}
                  {visibleTasks.map((task) => {
                  const preview = dragPreview && dragPreview.taskId === task.id ? dragPreview : null;
                  const s = preview ? preview.start : task.start;
                  const e = preview ? preview.end : task.end || task.start;
                  const isDraggingThis = !!preview;
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
                        onPointerDown={isInteractive ? (e) => startDrag(e, task, 'move') : undefined}
                        className={`absolute h-7 rounded-full flex items-center transition-all duration-300 hover:scale-[1.02] hover:shadow-lg touch-none ${
                          isInteractive ? (isDraggingThis ? 'cursor-grabbing ring-2 ring-indigo-200' : 'cursor-grab') : ''
                        } ${barClass}`}
                        style={{ left: `${left}px`, width: `${width}px` }}
                        title={`${task.taskName} (${task.progress}%) - ${s} ~ ${e}`}
                      >
                        {isInteractive && (
                          <>
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 rounded-l-full cursor-ew-resize hover:bg-white/20"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                startDrag(e, task, 'resizeStart');
                              }}
                            />
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 rounded-r-full cursor-ew-resize hover:bg-white/20"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                startDrag(e, task, 'resizeEnd');
                              }}
                            />
                          </>
                        )}
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
                  {rowBottomSpacerPx > 0 && <div style={{ height: `${rowBottomSpacerPx}px` }} />}
                </div>
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
