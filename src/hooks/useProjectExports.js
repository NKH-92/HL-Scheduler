import { useCallback, useState } from 'react';
import {
  GANTT_EXPORT_LEFT_PANE_PX,
  REPORT_CHART_WIDTH_PX,
  REPORT_IMAGE_PIXEL_RATIO,
  REPORT_PAGE_WIDTH_PX,
} from '../utils/ganttLayout';
import { formatDate, toUtcMidnightMs } from '../utils/dates';
import { escapeHtml, sanitizeFileName } from '../utils/shared';

let imageExportLibsPromise = null;

const loadImageExportLibs = async () => {
  if (!imageExportLibsPromise) {
    imageExportLibsPromise = Promise.all([import('html-to-image'), import('html2canvas')])
      .then(([htmlToImageModule, html2canvasModule]) => {
        const html2canvasFn = html2canvasModule?.default ?? html2canvasModule;
        const libs = {
          getFontEmbedCSS: htmlToImageModule?.getFontEmbedCSS,
          toJpeg: htmlToImageModule?.toJpeg,
          toPng: htmlToImageModule?.toPng,
          html2canvas: html2canvasFn,
        };
        if (
          typeof libs.getFontEmbedCSS !== 'function' ||
          typeof libs.toJpeg !== 'function' ||
          typeof libs.toPng !== 'function' ||
          typeof libs.html2canvas !== 'function'
        ) {
          throw new Error('Image export dependencies are unavailable.');
        }
        return libs;
      })
      .catch((error) => {
        imageExportLibsPromise = null;
        throw error;
      });
  }

  return imageExportLibsPromise;
};

const waitForNextPaint = async () => {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
};

const captureElementImage = async ({
  elementId,
  scope = 'full',
  format = 'png',
  pixelRatio = 1,
  quality = 1,
  includeToday = true,
}) => {
  const element = document.getElementById(elementId);
  if (!element) throw new Error('Export target not found.');

  const { getFontEmbedCSS, toJpeg, toPng, html2canvas } = await loadImageExportLibs();
  await waitForNextPaint();

  const isFullExport = scope !== 'visible';
  const width = isFullExport ? element.scrollWidth || element.clientWidth : element.clientWidth;
  const height = isFullExport ? element.scrollHeight || element.clientHeight : element.clientHeight;
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  let safePixelRatio = Number(pixelRatio || 1);
  if (!Number.isFinite(safePixelRatio) || safePixelRatio <= 0) safePixelRatio = 1;
  safePixelRatio = Math.min(4, safePixelRatio);

  const maxCanvasSize = 16384;
  const maxBaseDim = Math.max(safeWidth, safeHeight);
  if (Number.isFinite(maxBaseDim) && maxBaseDim > 0) {
    const maxAllowedRatio = maxCanvasSize / maxBaseDim;
    if (Number.isFinite(maxAllowedRatio) && maxAllowedRatio > 0 && maxAllowedRatio < safePixelRatio) {
      safePixelRatio = maxAllowedRatio;
    }
  }

  const safeFormat = format === 'jpg' ? 'jpg' : 'png';
  const safeQuality = safeFormat === 'jpg' ? Math.max(0.5, Math.min(1, Number(quality) || 0.92)) : 1;
  const filter = (node) => includeToday || !(node instanceof HTMLElement) || node.dataset?.ganttToday !== 'true';

  let fontEmbedCSS;
  try {
    fontEmbedCSS = await getFontEmbedCSS(element, { cacheBust: true });
  } catch (error) {
    console.warn('Failed to embed fonts for export; using system fonts instead.', error);
    fontEmbedCSS = undefined;
  }

  const captureWithHtmlToImage = async () => {
    const baseOptions = {
      backgroundColor: '#ffffff',
      pixelRatio: safePixelRatio,
      cacheBust: true,
      filter,
      fontEmbedCSS,
      width: safeWidth,
      height: safeHeight,
    };

    return safeFormat === 'jpg'
      ? toJpeg(element, { ...baseOptions, quality: safeQuality })
      : toPng(element, baseOptions);
  };

  const captureWithHtml2Canvas = async () => {
    const canvas = await html2canvas(element, {
      scale: safePixelRatio,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: safeWidth,
      height: safeHeight,
      windowWidth: safeWidth,
      windowHeight: safeHeight,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: (candidate) => !includeToday && candidate?.dataset?.ganttToday === 'true',
      onclone: (clonedDoc) => {
        const style = clonedDoc.createElement('style');
        style.textContent = '* { animation: none !important; transition: none !important; }';
        clonedDoc.head.appendChild(style);

        if (!isFullExport) return;
        const clonedTarget = clonedDoc.getElementById(elementId);
        const wrapper = clonedTarget?.parentElement;
        if (!wrapper) return;
        wrapper.style.position = 'absolute';
        wrapper.style.left = '0px';
        wrapper.style.top = '0px';
      },
    });

    return canvas.toDataURL(safeFormat === 'jpg' ? 'image/jpeg' : 'image/png', safeQuality);
  };

  let dataUrl;
  try {
    dataUrl = await captureWithHtmlToImage();
  } catch (primaryError) {
    console.warn('html-to-image export failed; falling back to html2canvas.', primaryError);
    dataUrl = await captureWithHtml2Canvas();
  }

  return { dataUrl, width: safeWidth, height: safeHeight, format: safeFormat };
};

const downloadDataUrl = (dataUrl, fileName) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const toDurationDays = (start, end) => {
  const startMs = toUtcMidnightMs(start);
  const endMs = toUtcMidnightMs(end || start);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return '';
  return Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);
};

export default function useProjectExports({
  alertAsync,
  ganttViewMode,
  projectName,
  tasks,
  vacations,
  rangePadding,
  fitSettings,
  zoomSettings,
}) {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTasks, setReportTasks] = useState(null);
  const [reportGanttMode, setReportGanttMode] = useState('Week');
  const [isGenerating, setIsGenerating] = useState(false);

  const [isImageExportModalOpen, setIsImageExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('png');
  const [exportScope, setExportScope] = useState('full');
  const [exportScale, setExportScale] = useState(3);
  const [exportFileName, setExportFileName] = useState('');
  const [exportJpegQuality, setExportJpegQuality] = useState(0.92);
  const [exportShowToday, setExportShowToday] = useState(true);

  const reportSourceTasks = reportTasks ?? tasks;

  const openReportModal = useCallback(() => {
    setReportTasks(tasks);
    setIsReportModalOpen(true);
  }, [tasks]);

  const closeReportModal = useCallback(() => {
    setIsReportModalOpen(false);
    setReportTasks(null);
  }, []);

  const openImageExportModal = useCallback(() => {
    setExportFileName('');
    setExportScope('full');
    setExportFormat('png');
    setExportScale(3);
    setExportJpegQuality(0.92);
    setExportShowToday(true);
    setIsImageExportModalOpen(true);
  }, []);

  const closeImageExportModal = useCallback(() => {
    setIsImageExportModalOpen(false);
  }, []);

  const exportGanttImage = useCallback(async () => {
    try {
      const targetId = exportScope === 'visible' ? 'gantt-main' : 'gantt-image-export-target';
      const safeQuality = exportFormat === 'jpg' ? exportJpegQuality : 1;
      const { dataUrl, format } = await captureElementImage({
        elementId: targetId,
        scope: exportScope,
        format: exportFormat,
        pixelRatio: exportScale,
        quality: safeQuality,
        includeToday: exportShowToday,
      });

      const baseNameRaw = exportFileName || `${projectName || '프로젝트'}_간트_${ganttViewMode}_${formatDate(new Date())}`;
      const baseName = sanitizeFileName(baseNameRaw, 'gantt');
      downloadDataUrl(dataUrl, `${baseName}.${format}`);
      closeImageExportModal();
    } catch (error) {
      console.error(error);
      void alertAsync('간트 이미지를 내보내지 못했습니다.');
    }
  }, [
    alertAsync,
    closeImageExportModal,
    exportFileName,
    exportFormat,
    exportJpegQuality,
    exportScale,
    exportScope,
    exportShowToday,
    ganttViewMode,
    projectName,
  ]);

  const generateWordReport = useCallback(async () => {
    setIsGenerating(true);
    try {
      const { dataUrl, width, height } = await captureElementImage({
        elementId: 'gantt-report-preview',
        scope: 'full',
        format: 'png',
        pixelRatio: REPORT_IMAGE_PIXEL_RATIO,
        quality: 1,
        includeToday: true,
      });

      const reportImageWidthPx = Math.min(REPORT_PAGE_WIDTH_PX, width);
      const reportImageHeightPx = Math.max(1, Math.round((reportImageWidthPx / width) * height));
      const totalProgress = Math.round(
        reportSourceTasks.reduce((sum, task) => sum + (Number(task.progress) || 0), 0) / (reportSourceTasks.length || 1),
      );
      const completed = reportSourceTasks.filter((task) => Number(task.progress) === 100).length;
      const reportTitle = escapeHtml(projectName) || '제목 없는 프로젝트';

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
            <h1>${reportTitle} 진행 보고서</h1>
            <h2>1. 프로젝트 요약</h2>
            <div class="summary-box">
              <p class="stat"><strong>생성일</strong> ${formatDate(new Date())}</p>
              <p class="stat"><strong>전체 진행률</strong> ${totalProgress}%</p>
              <p class="stat"><strong>총 작업</strong> ${reportSourceTasks.length}건 (완료 ${completed}건)</p>
            </div>
            <h2>2. 작업 상세</h2>
            <table>
              <thead>
                <tr>
                  <th>구분</th>
                  <th>작업</th>
                  <th>부서</th>
                  <th>담당자</th>
                  <th>기간</th>
                  <th>선행작업</th>
                  <th>진행률</th>
                </tr>
              </thead>
              <tbody>
                ${reportSourceTasks
                  .map((task) => {
                    const category = escapeHtml(task.category);
                    const taskName = escapeHtml(task.taskName);
                    const department = escapeHtml(task.department);
                    const assignee = escapeHtml(task.assignee || '-');
                    const start = escapeHtml(task.start || '-');
                    const end = escapeHtml(task.end || task.start || '-');
                    const dependencies = escapeHtml(
                      Array.isArray(task.dependencies) ? task.dependencies.map((depId) => String(depId)).join(', ') : '-',
                    );
                    const progress = escapeHtml(`${task.progress}%`);
                    return `<tr><td>${category}</td><td>${taskName}</td><td>${department}</td><td>${assignee}</td><td>${start} ~ ${end}</td><td>${dependencies}</td><td>${progress}</td></tr>`;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
          <br clear="all" style="page-break-before:always;mso-break-type:section-break;">
          <div class="Section2">
            <h2>3. 일정 타임라인 (간트 - ${escapeHtml(reportGanttMode)} 보기)</h2>
            <div class="img-container" style="width:${reportImageWidthPx}px;margin:0 auto;">
              <img
                src="${dataUrl}"
                width="${reportImageWidthPx}"
                height="${reportImageHeightPx}"
                style="width:${reportImageWidthPx}px;height:${reportImageHeightPx}px;"
              />
            </div>
            <br /><br />
          </div>
        </body>
        </html>`;

      downloadBlob(
        new Blob(['\ufeff', reportHtml], { type: 'application/msword' }),
        `${sanitizeFileName(projectName, '프로젝트')}_보고서_${formatDate(new Date())}.doc`,
      );
      closeReportModal();
    } catch (error) {
      console.error(error);
      void alertAsync('보고서를 생성하지 못했습니다.');
    } finally {
      setIsGenerating(false);
    }
  }, [alertAsync, closeReportModal, projectName, reportGanttMode, reportSourceTasks]);

  const exportProjectXlsx = useCallback(
    async (taskList = tasks) => {
      try {
        const XLSX = await import('xlsx');
        const safeTasks = Array.isArray(taskList) ? taskList : [];
        const workbook = XLSX.utils.book_new();
        const today = formatDate(new Date());
        const safeProjectName = projectName || 'Project';

        const tasksSheet = XLSX.utils.aoa_to_sheet([
          ['Category', 'Task', 'Department', 'Assignee', 'Start', 'End', 'Duration(days)', 'Progress(%)', 'Dependencies', 'Memo'],
          ...safeTasks.map((task) => [
            task.category || '',
            task.taskName || '',
            task.department || '',
            task.assignee || '',
            task.start || '',
            task.end || task.start || '',
            toDurationDays(task.start, task.end),
            Number.isFinite(Number(task.progress)) ? Number(task.progress) : 0,
            Array.isArray(task.dependencies) ? task.dependencies.map((depId) => String(depId)).join(', ') : '',
            String(task.memo ?? ''),
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
          { wch: 24 },
          { wch: 40 },
        ];
        XLSX.utils.book_append_sheet(workbook, tasksSheet, 'Tasks');

        const vacationsSheet = XLSX.utils.aoa_to_sheet([
          ['Title', 'Start', 'End'],
          ...vacations.map((vacation) => [vacation.title || '', vacation.start || '', vacation.end || vacation.start || '']),
        ]);
        vacationsSheet['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(workbook, vacationsSheet, 'Vacations');

        const completed = safeTasks.filter((task) => Number(task.progress) === 100).length;
        const totalProgress =
          safeTasks.length === 0
            ? 0
            : Math.round(safeTasks.reduce((sum, task) => sum + (Number(task.progress) || 0), 0) / safeTasks.length);
        const summarySheet = XLSX.utils.aoa_to_sheet([
          ['Project', safeProjectName],
          ['Exported at', today],
          ['Task count', safeTasks.length],
          ['Completed tasks', completed],
          ['Average progress', `${totalProgress}%`],
          ['Vacation count', vacations.length],
        ]);
        summarySheet['!cols'] = [{ wch: 18 }, { wch: 32 }];
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

        XLSX.writeFile(workbook, `${sanitizeFileName(safeProjectName, 'project')}_${today}.xlsx`);
      } catch (error) {
        console.error(error);
        void alertAsync(error?.message || '엑셀 내보내기에 실패했습니다.');
      }
    },
    [alertAsync, projectName, tasks, vacations],
  );

  const saveProjectFile = useCallback(() => {
    const payload = { name: projectName, tasks, vacations, rangePadding, fitSettings, zoomSettings };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
      `${sanitizeFileName(projectName, 'HL-Scheduler')}_백업_${formatDate(new Date())}.json`,
    );
  }, [fitSettings, projectName, rangePadding, tasks, vacations, zoomSettings]);

  return {
    exportProjectXlsx,
    imageExportModalProps: {
      isOpen: isImageExportModalOpen,
      onClose: closeImageExportModal,
      exportFormat,
      setExportFormat,
      exportScope,
      setExportScope,
      exportScale,
      setExportScale,
      exportShowToday,
      setExportShowToday,
      exportFileName,
      setExportFileName,
      exportJpegQuality,
      setExportJpegQuality,
      exportGanttImage,
    },
    openImageExportModal,
    openReportModal,
    reportModalProps: {
      isOpen: isReportModalOpen,
      onClose: closeReportModal,
      tasks: reportSourceTasks,
      vacations,
      rangePadding,
      reportChartWidth: REPORT_CHART_WIDTH_PX,
      reportLeftPaneWidth: GANTT_EXPORT_LEFT_PANE_PX,
      reportGanttMode,
      setReportGanttMode,
      generateWordReport,
      isGenerating,
    },
    saveProjectFile,
  };
}
