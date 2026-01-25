import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { getFontEmbedCSS, toJpeg, toPng } from 'html-to-image';
import AppHeader from './components/AppHeader';
import Dashboard from './components/Dashboard';
import Help from './components/Help';
import ScheduleView from './components/ScheduleView';
import TaskManagement from './components/TaskManagement';
import GanttChart from './components/GanttChart';
import ImageExportModal from './components/modals/ImageExportModal';
import ReportModal from './components/modals/ReportModal';
import TaskEditModal from './components/modals/TaskEditModal';
import { generateId, newTaskTemplate, normalizeTasks, normalizeVacations } from './utils/data';
import { formatDate, toUtcMidnightMs } from './utils/dates';
import { useSchedulerStorage } from './hooks/useSchedulerStorage';
import {
  GANTT_EXPORT_LEFT_PANE_PX,
  REPORT_CHART_WIDTH_PX,
  REPORT_IMAGE_PIXEL_RATIO,
  REPORT_PAGE_WIDTH_PX,
} from './utils/ganttLayout';
import { mergeRangePadding, sanitizeFitSettings, sanitizeZoomSettings } from './utils/schedulerSettings';
import { readStorage } from './utils/storage';
import { STORAGE_KEYS } from './utils/storageKeys';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const sanitizeFileName = (value, fallback) => {
  const base = String(value || fallback || '').trim() || String(fallback || 'file');
  return base.replace(/[\\/:*?"<>|]/g, '_');
};

const countInvalidRanges = (items, getStart, getEnd) => {
  if (!Array.isArray(items)) return 0;
  let count = 0;
  items.forEach((item) => {
    const start = getStart(item);
    if (!start) return;
    const end = getEnd(item) || start;
    const startMs = toUtcMidnightMs(start);
    const endMs = toUtcMidnightMs(end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) count += 1;
  });
  return count;
};

const buildInvalidRangeNotice = (taskCount, vacationCount) => {
  if (!taskCount && !vacationCount) return '';
  const parts = [];
  if (taskCount) parts.push(`업무 ${taskCount}건`);
  if (vacationCount) parts.push(`휴가 ${vacationCount}건`);
  return `\n\n종료일이 시작일보다 빠른 ${parts.join(', ')}은(는) 자동으로 교정됩니다.`;
};

const clampAppZoomFactor = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(0.5, Math.min(2.5, Math.round(n * 100) / 100));
};

function App() {
  const [activeTab, setActiveTab] = useState('tasks');
  const {
    projectName,
    setProjectName,
    tasks,
    setTasks,
    vacations,
    setVacations,
    rangePadding,
    setRangePadding,
    fitSettings,
    setFitSettings,
    zoomSettings,
    setZoomSettings,
    storageError,
  } = useSchedulerStorage();

  const [appZoomFactor, setAppZoomFactor] = useState(() => {
    const saved = readStorage(STORAGE_KEYS.appZoom);
    if (saved == null) return 1;
    return clampAppZoomFactor(saved);
  });

  const appZoomRef = useRef(appZoomFactor);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTasks, setReportTasks] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [ganttViewMode, setGanttViewMode] = useState('Day');
  const [filterText, setFilterText] = useState('');
  const [isVacationPanelOpen, setIsVacationPanelOpen] = useState(true);
  const [vacForm, setVacForm] = useState(() => {
    const today = formatDate(new Date());
    return { title: '', start: today, end: today };
  });
  const [formData, setFormData] = useState(newTaskTemplate());
  const [reportGanttMode, setReportGanttMode] = useState('Week');
  const [isGenerating, setIsGenerating] = useState(false);

  const [isImageExportModalOpen, setIsImageExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('png');
  const [exportScope, setExportScope] = useState('full');
  const [exportScale, setExportScale] = useState(3);
  const [exportFileName, setExportFileName] = useState('');
  const [exportJpegQuality, setExportJpegQuality] = useState(0.92);
  const [exportShowToday, setExportShowToday] = useState(true);

  const filteredTasks = useMemo(() => {
    if (!filterText.trim()) return tasks;
    const lower = filterText.toLowerCase();
    return tasks.filter(
      (t) =>
        (t.taskName && t.taskName.toLowerCase().includes(lower)) ||
        (t.department && t.department.toLowerCase().includes(lower)) ||
        (t.assignee && t.assignee.toLowerCase().includes(lower)),
    );
  }, [tasks, filterText]);

  const reportSourceTasks = reportTasks ?? tasks;

  useEffect(() => {
    appZoomRef.current = appZoomFactor;
  }, [appZoomFactor]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.appZoom.current, String(appZoomFactor));
    } catch {
      // ignore storage failures
    }
  }, [appZoomFactor]);

  useEffect(() => {
    const hlSchedulerApi = globalThis.hlScheduler;
    if (!hlSchedulerApi || typeof hlSchedulerApi.setZoomFactor !== 'function') return;
    hlSchedulerApi.setZoomFactor(clampAppZoomFactor(appZoomFactor)).catch((error) => {
      console.warn('Failed to apply app zoom factor', error);
    });
  }, [appZoomFactor]);

  const hlSchedulerApi = globalThis.hlScheduler;
  const isDesktopApp = !!hlSchedulerApi && typeof hlSchedulerApi.setZoomFactor === 'function';

  const setNextAppZoom = (next) => {
    setAppZoomFactor(clampAppZoomFactor(next));
  };

  const zoomInApp = () => setNextAppZoom(appZoomRef.current + 0.1);
  const zoomOutApp = () => setNextAppZoom(appZoomRef.current - 0.1);
  const resetAppZoom = () => setNextAppZoom(1);

  const openReportModal = useCallback(() => {
    setReportTasks(tasks);
    setIsReportModalOpen(true);
  }, [tasks]);

  const closeReportModal = useCallback(() => {
    setIsReportModalOpen(false);
    setReportTasks(null);
  }, []);

  const openModal = (task = null) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        category: task.category || '',
        taskName: task.taskName || '',
        department: task.department || '',
        assignee: task.assignee || '',
        start: task.start || '',
        end: task.end || task.start || '',
        progress: Number(task.progress || 0),
        memo: task.memo || '',
      });
    } else {
      setEditingTask(null);
      setFormData(newTaskTemplate());
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!String(formData.category || '').trim() || !String(formData.taskName || '').trim()) {
      alert('필수 입력(구분/업무명)이 누락되었습니다.');
      return;
    }

    const startMs = toUtcMidnightMs(formData.start);
    const endMs = toUtcMidnightMs(formData.end || formData.start);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      alert('종료일이 시작일보다 빠릅니다.');
      return;
    }

    const rawProgress = Number(formData.progress);
    const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;
    const payload = { ...formData, progress, end: formData.end || formData.start || '', memo: String(formData.memo ?? '') };

    if (editingTask) {
      setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? { ...payload, id: t.id } : t)));
    } else {
      setTasks((prev) => [...prev, { ...payload, id: generateId() }]);
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const moveTask = (id, direction) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const nextIdx = Math.min(prev.length - 1, Math.max(0, idx + direction));
      if (nextIdx === idx) return prev;
      const arr = [...prev];
      const [item] = arr.splice(idx, 1);
      arr.splice(nextIdx, 0, item);
      return arr;
    });
  };

  const moveTaskToIndex = (id, toIndex) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const nextIdx = Math.min(prev.length - 1, Math.max(0, Number(toIndex) - 1));
      if (nextIdx === idx) return prev;
      const arr = [...prev];
      const [item] = arr.splice(idx, 1);
      arr.splice(nextIdx, 0, item);
      return arr;
    });
  };

  const sortTasksByStart = (direction = 'asc') => {
    setTasks((prev) => {
      const parse = (d) => {
        if (!d) return null;
        const ms = toUtcMidnightMs(d);
        return Number.isFinite(ms) ? ms : null;
      };

      return [...prev].sort((a, b) => {
        const ta = parse(a.start);
        const tb = parse(b.start);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return direction === 'desc' ? tb - ta : ta - tb;
      });
    });
  };

  const updateTaskDates = (taskId, start, end) => {
    const nextStart = String(start || '').trim();
    if (!nextStart) return;
    const nextEnd = String(end || '').trim() || nextStart;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        if (t.start === nextStart && (t.end || t.start) === nextEnd) return t;
        return { ...t, start: nextStart, end: nextEnd };
      }),
    );
  };

  const updateTaskMemo = (taskId, memo) => {
    const nextMemo = String(memo ?? '');
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        if (String(t.memo ?? '') === nextMemo) return t;
        return { ...t, memo: nextMemo };
      }),
    );
  };

  const addVacation = () => {
    if (!vacForm.start) {
      alert('휴가 시작일이 누락되었습니다.');
      return;
    }

    const start = vacForm.start;
    const end = vacForm.end || start;
    const startMs = toUtcMidnightMs(start);
    const endMs = toUtcMidnightMs(end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      alert('종료일이 시작일보다 빠릅니다.');
      return;
    }

    const payload = {
      id: generateId(),
      title: (vacForm.title || '휴가').trim() || '휴가',
      start,
      end,
    };
    setVacations((prev) => [...prev, payload]);
    const today = formatDate(new Date());
    setVacForm({ title: '', start: today, end: today });
  };

  const deleteVacation = (id) => {
    if (!window.confirm('휴가 일정을 삭제하시겠습니까?')) return;
    setVacations((prev) => prev.filter((v) => v.id !== id));
  };

  const updatePadding = (key, value) => {
    const v = Math.max(0, Number(value || 0));
    setRangePadding((prev) => ({ ...prev, [ganttViewMode]: { ...(prev[ganttViewMode] || {}), [key]: v } }));
  };

  const updateFit = (enabled) => {
    setFitSettings((prev) => {
      const current = prev[ganttViewMode] || { enabled: false };
      return { ...prev, [ganttViewMode]: { ...current, enabled: !!enabled } };
    });
  };

  const updateZoom = (value) => {
    const next = Math.round(Number(value));
    if (!Number.isFinite(next)) return;
    const clamped = Math.max(25, Math.min(300, next));
    setZoomSettings((prev) => ({ ...prev, [ganttViewMode]: clamped }));
  };

  const openImageExportModal = () => {
    setExportFileName('');
    setExportScope('full');
    setExportFormat('png');
    setExportScale(3);
    setExportJpegQuality(0.92);
    setExportShowToday(true);
    setIsImageExportModalOpen(true);
  };

  const exportGanttImage = async () => {
    try {
      const targetId = exportScope === 'visible' ? 'gantt-main' : 'gantt-image-export-target';
      const el = document.getElementById(targetId);
      if (!el) throw new Error('Export target not found');

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const isFullExport = exportScope !== 'visible';
      const baseWidth = isFullExport ? el.scrollWidth : el.clientWidth;
      const baseHeight = isFullExport ? el.scrollHeight : el.clientHeight;
      let pixelRatio = Number(exportScale || 3);
      if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) pixelRatio = 1;
      pixelRatio = Math.min(4, pixelRatio);

      const maxCanvasSize = 16384;
      const maxBaseDim = Math.max(baseWidth, baseHeight);
      if (Number.isFinite(maxBaseDim) && maxBaseDim > 0) {
        const maxAllowedRatio = maxCanvasSize / maxBaseDim;
        if (Number.isFinite(maxAllowedRatio) && maxAllowedRatio > 0 && maxAllowedRatio < pixelRatio) {
          console.warn('Export size too large; reducing pixelRatio', { from: pixelRatio, to: maxAllowedRatio });
          pixelRatio = maxAllowedRatio;
        }
      }
      const ext = exportFormat === 'jpg' ? 'jpg' : 'png';
      const parsedQuality = Number(exportJpegQuality);
      const quality =
        exportFormat === 'jpg'
          ? Math.max(0.5, Math.min(1, Number.isFinite(parsedQuality) ? parsedQuality : 0.92))
          : 1;

      const filter = (node) => {
        if (exportShowToday) return true;
        return !(node instanceof HTMLElement) || node.dataset?.ganttToday !== 'true';
      };

      let dataUrl;
      let fontEmbedCSS;
      try {
        fontEmbedCSS = await getFontEmbedCSS(el, { cacheBust: true });
      } catch (error) {
        console.warn('Failed to embed fonts for export; falling back to system fonts', error);
        fontEmbedCSS = undefined;
      }

      const captureWithHtmlToImage = async () => {
        const baseOptions = { backgroundColor: '#ffffff', pixelRatio, cacheBust: true, filter, fontEmbedCSS };
        const options = isFullExport
          ? { ...baseOptions, width: el.scrollWidth, height: el.scrollHeight }
          : { ...baseOptions, width: el.clientWidth, height: el.clientHeight };
        return exportFormat === 'jpg' ? toJpeg(el, { ...options, quality }) : toPng(el, options);
      };

      const captureWithHtml2Canvas = async () => {
        const baseOptions = {
          scale: pixelRatio,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: isFullExport ? el.scrollWidth : el.clientWidth,
          height: isFullExport ? el.scrollHeight : el.clientHeight,
          windowWidth: isFullExport ? el.scrollWidth : el.clientWidth,
          windowHeight: isFullExport ? el.scrollHeight : el.clientHeight,
          ignoreElements: (element) => !exportShowToday && element?.dataset?.ganttToday === 'true',
          onclone: (clonedDoc) => {
            const style = clonedDoc.createElement('style');
            style.textContent = `
              * { animation: none !important; transition: none !important; }
            `;
            clonedDoc.head.appendChild(style);

            if (!isFullExport) return;
            const clonedTarget = clonedDoc.getElementById(targetId);
            if (!clonedTarget) return;
            const wrapper = clonedTarget.parentElement;
            if (!wrapper) return;
            wrapper.style.position = 'absolute';
            wrapper.style.left = '0px';
            wrapper.style.top = '0px';
          },
        };

        const options = isFullExport ? { ...baseOptions, scrollX: 0, scrollY: 0 } : baseOptions;
        const canvas = await html2canvas(el, options);
        const mime = exportFormat === 'jpg' ? 'image/jpeg' : 'image/png';
        return canvas.toDataURL(mime, quality);
      };

      try {
        dataUrl = await captureWithHtmlToImage();
      } catch (primaryError) {
        console.warn('html-to-image export failed; falling back to html2canvas', primaryError);
        dataUrl = await captureWithHtml2Canvas();
      }

      const baseNameRaw =
        exportFileName || `${projectName || 'Project'}_Gantt_${ganttViewMode}_${formatDate(new Date())}`;
      const baseName = sanitizeFileName(baseNameRaw, 'gantt');
      const downloadName = `${baseName}.${ext}`;

      const schedulerApi = globalThis.hlScheduler;
      if (schedulerApi && typeof schedulerApi.saveImage === 'function') {
        const result = await schedulerApi.saveImage({ dataUrl, defaultFileName: downloadName, ext });
        if (result && result.canceled) return;
        setIsImageExportModalOpen(false);
        return;
      }

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsImageExportModalOpen(false);
    } catch (error) {
      console.error(error);
      alert('이미지 내보내기 중 오류가 발생했습니다.');
    }
  };

  const generateWordReport = async () => {
    setIsGenerating(true);
    try {
      const targetId = 'gantt-report-export-target';
      const ganttElement = document.getElementById(targetId);
      if (!ganttElement) throw new Error('Chart not found');

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const reportMaxWidthPx = REPORT_PAGE_WIDTH_PX;
      const isFullExport = true;
      const baseWidth = ganttElement.scrollWidth || 0;
      const baseHeight = ganttElement.scrollHeight || 0;
      const safeWidth = Math.max(1, baseWidth);
      const safeHeight = Math.max(1, baseHeight);

      const maxCanvasSize = 16384;
      const maxBaseDim = Math.max(safeWidth, safeHeight);
      let pixelRatio = REPORT_IMAGE_PIXEL_RATIO;
      if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) pixelRatio = 1;
      pixelRatio = Math.min(4, pixelRatio);
      if (Number.isFinite(maxBaseDim) && maxBaseDim > 0 && maxBaseDim * pixelRatio > maxCanvasSize) {
        const nextRatio = maxCanvasSize / maxBaseDim;
        if (Number.isFinite(nextRatio) && nextRatio > 0 && nextRatio < pixelRatio) {
          console.warn('Report chart too large; reducing pixelRatio', { from: pixelRatio, to: nextRatio });
          pixelRatio = nextRatio;
        }
      }

      const showToday = true;
      const filter = (node) => {
        if (showToday) return true;
        return !(node instanceof HTMLElement) || node.dataset?.ganttToday !== 'true';
      };

      let imgData;
      let fontEmbedCSS;
      try {
        fontEmbedCSS = await getFontEmbedCSS(ganttElement, { cacheBust: true });
      } catch (error) {
        console.warn('Failed to embed fonts for report; falling back to system fonts', error);
        fontEmbedCSS = undefined;
      }

      const captureWithHtmlToImage = async () => {
        const baseOptions = { backgroundColor: '#ffffff', pixelRatio, cacheBust: true, filter, fontEmbedCSS };
        const options = { ...baseOptions, width: safeWidth, height: safeHeight };
        return toPng(ganttElement, options);
      };

      const captureWithHtml2Canvas = async () => {
        const baseOptions = {
          scale: pixelRatio,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: safeWidth,
          height: safeHeight,
          windowWidth: safeWidth,
          windowHeight: safeHeight,
          ignoreElements: (element) => !showToday && element?.dataset?.ganttToday === 'true',
          onclone: (clonedDoc) => {
            const style = clonedDoc.createElement('style');
            style.textContent = `
              * { animation: none !important; transition: none !important; }
            `;
            clonedDoc.head.appendChild(style);

            if (!isFullExport) return;
            const clonedTarget = clonedDoc.getElementById(targetId);
            if (!clonedTarget) return;
            const wrapper = clonedTarget.parentElement;
            if (!wrapper) return;
            wrapper.style.position = 'absolute';
            wrapper.style.left = '0px';
            wrapper.style.top = '0px';
          },
        };

        const options = isFullExport ? { ...baseOptions, scrollX: 0, scrollY: 0 } : baseOptions;
        const canvas = await html2canvas(ganttElement, options);
        return canvas.toDataURL('image/png');
      };

      try {
        imgData = await captureWithHtmlToImage();
      } catch (primaryError) {
        console.warn('html-to-image report capture failed; falling back to html2canvas', primaryError);
        imgData = await captureWithHtml2Canvas();
      }

      const reportImageWidthPx = Math.min(reportMaxWidthPx, safeWidth);
      const reportImageHeightPx = Math.max(1, Math.round((reportImageWidthPx / safeWidth) * safeHeight));
      const totalProgress = Math.round(
        reportSourceTasks.reduce((acc, curr) => acc + curr.progress, 0) / (reportSourceTasks.length || 1),
      );
      const completed = reportSourceTasks.filter((t) => t.progress === 100).length;
      const reportTitle = escapeHtml(projectName) || '무제 프로젝트';

      const reportHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8" />
          <title>${reportTitle} 보고서</title>
          <style>
            body{font-family:'Malgun Gothic',sans-serif}
            h1{font-size:24pt;color:#1e3a8a;text-align:center;margin-bottom:20px}
            h2{font-size:16pt;color:#334155;border-bottom:2px solid #334155;padding-bottom:5px;margin-top:30px}
            table{border-collapse:collapse;width:100%;margin-top:10px;font-size:10pt}
            th,td{border:1px solid #64748b;padding:8px;text-align:center}
            th{background-color:#f1f5f9;font-weight:bold}
            .summary-box{border:1px solid #cbd5e1;padding:15px;background-color:#f8fafc;margin-bottom:20px}
            .stat{font-size:11pt;margin-bottom:5px}
            .img-container{text-align:center;margin-top:20px}
            img{max-width:100%;height:auto;border:1px solid #cbd5e1}
            @page Section1{size:8.27in 11.69in;margin:0.7in;mso-page-orientation:portrait}
            @page Section2{size:11.69in 8.27in;margin:0.6in;mso-page-orientation:landscape}
            div.Section1{page:Section1}
            div.Section2{page:Section2}
          </style>
        </head>
        <body>
          <div class="Section1">
          <h1>${reportTitle} 진행상황보고서</h1>
          <h2>1. 프로젝트 요약</h2>
          <div class="summary-box">
            <p class="stat"><strong>생성일</strong> ${formatDate(new Date())}</p>
            <p class="stat"><strong>전체 진행률</strong> ${totalProgress}%</p>
            <p class="stat"><strong>총 업무 수</strong> ${reportSourceTasks.length}개(완료: ${completed}개)</p>
          </div>
          <h2>2. 상세 업무 현황</h2>
          <table>
            <thead>
              <tr>
                <th>구분</th>
                <th>업무명</th>
                <th>부서</th>
                <th>담당자</th>
                <th>기간</th>
                <th>진행률</th>
              </tr>
            </thead>
            <tbody>
              ${reportSourceTasks
                .map((t) => {
                  const category = escapeHtml(t.category);
                  const taskName = escapeHtml(t.taskName);
                  const department = escapeHtml(t.department);
                  const assignee = escapeHtml(t.assignee || '-');
                  const start = escapeHtml(t.start || '-');
                  const end = escapeHtml(t.end || t.start || '-');
                  const progress = escapeHtml(`${t.progress}%`);
                  return `<tr><td>${category}</td><td>${taskName}</td><td>${department}</td><td>${assignee}</td><td>${start} ~ ${end}</td><td>${progress}</td></tr>`;
                })
                .join('')}
            </tbody>
          </table>
          </div>
          <br clear="all" style="page-break-before:always;mso-break-type:section-break;">
          <div class="Section2">
          <h2>3. 일정 흐름 (Gantt Chart - ${escapeHtml(reportGanttMode)} View)</h2>
          <div class="img-container" style="width:${reportImageWidthPx}px;margin:0 auto;">
            <img
              src="${imgData}"
              width="${reportImageWidthPx}"
              height="${reportImageHeightPx}"
              style="width:${reportImageWidthPx}px;height:${reportImageHeightPx}px;"
            />
          </div>
          <br /><br />
          </div>
        </body>
        </html>`;

      const blob = new Blob(['\ufeff', reportHtml], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizeFileName(projectName, 'Project')}_Report_${formatDate(new Date())}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      closeReportModal();
    } catch (error) {
      console.error(error);
      alert('보고서 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const exportProjectXlsx = async (taskList = tasks) => {
    try {
      const xlsxModule = await import('xlsx');
      const XLSX = xlsxModule.default ?? xlsxModule;
      if (!XLSX?.utils?.book_new) throw new Error('xlsx module not available');

      const safeTasks = Array.isArray(taskList) ? taskList : tasks;

      const toDurationDays = (start, end) => {
        const s = toUtcMidnightMs(start);
        const e = toUtcMidnightMs(end || start);
        if (!Number.isFinite(s) || !Number.isFinite(e)) return '';
        return Math.max(1, Math.round((e - s) / 86400000) + 1);
      };

      const wb = XLSX.utils.book_new();
      const today = formatDate(new Date());
      const safeProjectName = projectName || 'Project';

      const tasksSheet = XLSX.utils.aoa_to_sheet([
        ['Category', 'Task Name', 'Department', 'Assignee', 'Start', 'End', 'Duration(days)', 'Progress(%)', 'Memo'],
        ...safeTasks.map((t) => [
          t.category || '',
          t.taskName || '',
          t.department || '',
          t.assignee || '',
          t.start || '',
          t.end || t.start || '',
          toDurationDays(t.start, t.end),
          Number.isFinite(Number(t.progress)) ? Number(t.progress) : 0,
          String(t.memo ?? ''),
        ]),
      ]);

      tasksSheet['!cols'] = [
        { wch: 14 },
        { wch: 28 },
        { wch: 16 },
        { wch: 14 },
        { wch: 12 },
        { wch: 12 },
        { wch: 14 },
        { wch: 12 },
        { wch: 40 },
      ];

      XLSX.utils.book_append_sheet(wb, tasksSheet, 'Tasks');

      const vacationsSheet = XLSX.utils.aoa_to_sheet([
        ['Title', 'Start', 'End'],
        ...vacations.map((v) => [v.title || '', v.start || '', v.end || v.start || '']),
      ]);

      vacationsSheet['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, vacationsSheet, 'Vacations');

      const completed = safeTasks.filter((t) => t.progress === 100).length;
      const totalProgress =
        safeTasks.length === 0
          ? 0
          : Math.round(safeTasks.reduce((acc, curr) => acc + curr.progress, 0) / safeTasks.length);

      const summarySheet = XLSX.utils.aoa_to_sheet([
        ['Project Name', safeProjectName],
        ['Exported At', today],
        ['Total Tasks', safeTasks.length],
        ['Completed Tasks', completed],
        ['Total Progress(%)', totalProgress],
        ['Vacations', vacations.length],
      ]);
      summarySheet['!cols'] = [{ wch: 18 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

      const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizeFileName(safeProjectName, 'HL-Scheduler')}_Export_${today}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('엑셀(XLSX) 내보내기 중 오류가 발생했습니다.');
    }
  };

  const saveProjectFile = () => {
    const data = { name: projectName, tasks, vacations, rangePadding, fitSettings, zoomSettings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const node = document.createElement('a');
    node.href = url;
    node.download = `${sanitizeFileName(projectName, 'HL-Scheduler')}_Backup_${formatDate(new Date())}.json`;
    document.body.appendChild(node);
    node.click();
    document.body.removeChild(node);
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileReader = new FileReader();
    fileReader.readAsText(e.target.files[0], 'UTF-8');
    fileReader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (Array.isArray(parsed)) {
          const invalidTasks = countInvalidRanges(
            parsed,
            (t) => t?.start || t?.actStart || t?.planStart || '',
            (t) => t?.end || t?.actEnd || t?.planEnd || '',
          );
          const invalidNotice = buildInvalidRangeNotice(invalidTasks, 0);
          if (window.confirm(`현재 데이터를 덮어쓰시겠습니까?${invalidNotice}`)) {
            setTasks(normalizeTasks(parsed));
          }
        } else if (parsed.tasks) {
          const invalidTasks = countInvalidRanges(
            parsed.tasks,
            (t) => t?.start || t?.actStart || t?.planStart || '',
            (t) => t?.end || t?.actEnd || t?.planEnd || '',
          );
          const invalidVacations = countInvalidRanges(
            parsed.vacations,
            (v) => v?.start || v?.startDate || '',
            (v) => v?.end || v?.endDate || v?.start || v?.startDate || '',
          );
          const invalidNotice = buildInvalidRangeNotice(invalidTasks, invalidVacations);
          if (window.confirm(`'${parsed.name || '프로젝트'}' 프로젝트를 불러오시겠습니까?${invalidNotice}`)) {
            setTasks(normalizeTasks(parsed.tasks));
            setProjectName(parsed.name || '');
            setVacations(normalizeVacations(parsed.vacations || []));
            setRangePadding(mergeRangePadding(parsed.rangePadding));
            setFitSettings(sanitizeFitSettings(parsed.fitSettings));
            setZoomSettings(sanitizeZoomSettings(parsed.zoomSettings));
          }
        } else {
          alert('파일 형식 오류');
        }
      } catch {
        alert('파일 오류');
      }
    };
    e.target.value = null;
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'tasks':
        return (
          <div className="animate-fade-in">
            <TaskManagement
              tasks={tasks}
              openModal={openModal}
              handleDelete={handleDelete}
              moveTask={moveTask}
              moveTaskToIndex={moveTaskToIndex}
              sortTasksByStart={sortTasksByStart}
              projectName={projectName}
              setProjectName={setProjectName}
              openReportModal={openReportModal}
              onExportXlsx={exportProjectXlsx}
              updateTaskMemo={updateTaskMemo}
            />
          </div>
        );
      case 'schedule':
        return (
          <ScheduleView
            projectName={projectName}
            filteredTasks={filteredTasks}
            vacations={vacations}
            onTaskDateChange={updateTaskDates}
            vacForm={vacForm}
            setVacForm={setVacForm}
            addVacation={addVacation}
            deleteVacation={deleteVacation}
            isVacationPanelOpen={isVacationPanelOpen}
            setIsVacationPanelOpen={setIsVacationPanelOpen}
            filterText={filterText}
            setFilterText={setFilterText}
            ganttViewMode={ganttViewMode}
            setGanttViewMode={setGanttViewMode}
            rangePadding={rangePadding}
            updatePadding={updatePadding}
            fitSettings={fitSettings}
            updateFit={updateFit}
            zoomSettings={zoomSettings}
            updateZoom={updateZoom}
            openImageExportModal={openImageExportModal}
            isImageExportModalOpen={isImageExportModalOpen}
            exportScope={exportScope}
          />
        );
      case 'dashboard':
        return (
          <div className="animate-fade-in">
            <Dashboard tasks={tasks} projectName={projectName} />
          </div>
        );
      case 'help':
        return <Help />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50 text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-700">
      <AppHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSaveProject={saveProjectFile}
        onImportFile={handleFileImport}
        showAppZoomControls={isDesktopApp}
        appZoomPercent={Math.round(appZoomFactor * 100)}
        onZoomIn={zoomInApp}
        onZoomOut={zoomOutApp}
        onZoomReset={resetAppZoom}
      />

      <main className="flex-1 min-h-0 w-full px-4 sm:px-6 lg:px-8 py-6 relative z-0 flex flex-col">
        {storageError && (
          <div
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            role="alert"
          >
            저장소 접근이 차단되어 변경사항이 저장되지 않습니다. 브라우저/앱 설정에서 저장소 허용 여부를
            확인하세요.
          </div>
        )}
        {renderContent()}
      </main>

      <TaskEditModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingTask={editingTask}
        formData={formData}
        setFormData={setFormData}
        onSave={handleSave}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={closeReportModal}
        tasks={reportSourceTasks}
        vacations={vacations}
        rangePadding={rangePadding}
        reportChartWidth={REPORT_CHART_WIDTH_PX}
        reportLeftPaneWidth={GANTT_EXPORT_LEFT_PANE_PX}
        reportGanttMode={reportGanttMode}
        setReportGanttMode={setReportGanttMode}
        generateWordReport={generateWordReport}
        isGenerating={isGenerating}
      />

      {isReportModalOpen && (
        <div style={{ position: 'fixed', left: '-9999px', top: '0px', pointerEvents: 'none' }}>
          <GanttChart
            tasks={reportSourceTasks}
            vacations={vacations}
            viewMode={reportGanttMode}
            rangePadding={rangePadding[reportGanttMode] || { before: 0, after: 0 }}
            fitEnabled
            isExportMode
            exportId="gantt-report-export-target"
            exportViewportWidth={REPORT_CHART_WIDTH_PX}
            exportLeftPaneWidth={GANTT_EXPORT_LEFT_PANE_PX}
          />
        </div>
      )}

      <ImageExportModal
        isOpen={isImageExportModalOpen}
        onClose={() => setIsImageExportModalOpen(false)}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        exportScope={exportScope}
        setExportScope={setExportScope}
        exportScale={exportScale}
        setExportScale={setExportScale}
        exportShowToday={exportShowToday}
        setExportShowToday={setExportShowToday}
        exportFileName={exportFileName}
        setExportFileName={setExportFileName}
        exportJpegQuality={exportJpegQuality}
        setExportJpegQuality={setExportJpegQuality}
        exportGanttImage={exportGanttImage}
      />
    </div>
  );
}

export default App;
