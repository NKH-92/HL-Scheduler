import { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { toJpeg, toPng } from 'html-to-image';
import AppHeader from './components/AppHeader';
import Dashboard from './components/Dashboard';
import ScheduleView from './components/ScheduleView';
import TaskManagement from './components/TaskManagement';
import ImageExportModal from './components/modals/ImageExportModal';
import ReportModal from './components/modals/ReportModal';
import TaskEditModal from './components/modals/TaskEditModal';
import {
  INITIAL_TASKS,
  defaultFitSettings,
  defaultRangePadding,
  newTaskTemplate,
  normalizeTasks,
  normalizeVacations,
} from './utils/data';
import { formatDate, toUtcMidnightMs } from './utils/dates';

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

const STORAGE_KEYS = {
  name: { current: 'hlSchedulerName', legacy: 'proSchedulerName' },
  tasks: { current: 'hlSchedulerTasks', legacy: 'proSchedulerTasks' },
  vacations: { current: 'hlSchedulerVacations', legacy: 'proSchedulerVacations' },
  rangePadding: { current: 'hlSchedulerRangePadding', legacy: 'proSchedulerRangePadding' },
  fitSettings: { current: 'hlSchedulerFitSettings', legacy: 'proSchedulerFitSettings' },
};

const readStorage = (key) => {
  try {
    return localStorage.getItem(key.current) ?? localStorage.getItem(key.legacy);
  } catch {
    return null;
  }
};

const migrateLegacyStorage = () => {
  try {
    Object.values(STORAGE_KEYS).forEach((key) => {
      if (localStorage.getItem(key.current) != null) return;
      const legacyValue = localStorage.getItem(key.legacy);
      if (legacyValue == null) return;
      localStorage.setItem(key.current, legacyValue);
    });
  } catch {
    // ignore storage failures (private mode, disabled storage, etc.)
  }
};

function App() {
  const [activeTab, setActiveTab] = useState('tasks');

  const [projectName, setProjectName] = useState(() => readStorage(STORAGE_KEYS.name) || '');
  const [tasks, setTasks] = useState(() => {
    const saved = readStorage(STORAGE_KEYS.tasks);
    if (!saved) return INITIAL_TASKS;
    try {
      return normalizeTasks(JSON.parse(saved));
    } catch {
      return INITIAL_TASKS;
    }
  });
  const [vacations, setVacations] = useState(() => {
    const saved = readStorage(STORAGE_KEYS.vacations);
    if (!saved) return [];
    try {
      return normalizeVacations(JSON.parse(saved));
    } catch {
      return [];
    }
  });
  const [rangePadding, setRangePadding] = useState(() => {
    const saved = readStorage(STORAGE_KEYS.rangePadding);
    if (!saved) return defaultRangePadding;
    try {
      const parsed = JSON.parse(saved);
      return parsed || defaultRangePadding;
    } catch {
      return defaultRangePadding;
    }
  });
  const [fitSettings, setFitSettings] = useState(() => {
    const saved = readStorage(STORAGE_KEYS.fitSettings);
    if (!saved) return defaultFitSettings;
    try {
      const parsed = JSON.parse(saved);
      return { ...defaultFitSettings, ...(parsed || {}) };
    } catch {
      return defaultFitSettings;
    }
  });

  const persistTimerRef = useRef(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
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

  useEffect(() => {
    migrateLegacyStorage();
  }, []);

  useEffect(() => {
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEYS.tasks.current, JSON.stringify(tasks));
        localStorage.setItem(STORAGE_KEYS.vacations.current, JSON.stringify(vacations));
        localStorage.setItem(STORAGE_KEYS.name.current, projectName);
        localStorage.setItem(STORAGE_KEYS.rangePadding.current, JSON.stringify(rangePadding));
        localStorage.setItem(STORAGE_KEYS.fitSettings.current, JSON.stringify(fitSettings));
      } catch {
        // ignore storage failures
      }
    }, 400);

    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [tasks, vacations, projectName, rangePadding, fitSettings]);

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

    const rawProgress = Number(formData.progress);
    const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;
    const payload = { ...formData, progress, end: formData.end || formData.start || '' };

    if (editingTask) {
      setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? { ...payload, id: t.id } : t)));
    } else {
      setTasks((prev) => [...prev, { ...payload, id: Date.now() }]);
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
      id: Date.now(),
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

  const updateFit = (key, value) => {
    setFitSettings((prev) => {
      const current = prev[ganttViewMode] || { enabled: false, pages: 1 };
      if (key === 'pages') {
        const pages = Math.max(1, Math.min(20, Number(value || 1)));
        return { ...prev, [ganttViewMode]: { ...current, pages } };
      }
      if (key === 'enabled') {
        return { ...prev, [ganttViewMode]: { ...current, enabled: !!value } };
      }
      return prev;
    });
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
      let pixelRatio = Math.max(1, Math.min(4, Number(exportScale || 3)));

      const maxCanvasSize = 16384;
      const maxDim = Math.max(baseWidth * pixelRatio, baseHeight * pixelRatio);
      if (Number.isFinite(maxDim) && maxDim > maxCanvasSize) {
        const limitedRatio = maxCanvasSize / Math.max(1, Math.max(baseWidth, baseHeight));
        const nextRatio = Math.max(1, Math.floor(Math.min(pixelRatio, limitedRatio) * 100) / 100);
        if (nextRatio < pixelRatio) {
          console.warn('Export size too large; reducing pixelRatio', { from: pixelRatio, to: nextRatio });
          pixelRatio = nextRatio;
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
      try {
        const baseOptions = { backgroundColor: '#ffffff', pixelRatio, cacheBust: true, filter };
        const options = isFullExport ? { ...baseOptions, width: el.scrollWidth, height: el.scrollHeight } : baseOptions;
        dataUrl = exportFormat === 'jpg' ? await toJpeg(el, { ...options, quality }) : await toPng(el, options);
      } catch (primaryError) {
        console.warn('html-to-image export failed; falling back to html2canvas', primaryError);

        const baseOptions = {
          scale: pixelRatio,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: el.scrollWidth,
          height: el.scrollHeight,
          windowWidth: el.scrollWidth,
          windowHeight: el.scrollHeight,
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
        dataUrl = canvas.toDataURL(mime, quality);
      }

      const baseNameRaw =
        exportFileName || `${projectName || 'Project'}_Gantt_${ganttViewMode}_${formatDate(new Date())}`;
      const baseName = sanitizeFileName(baseNameRaw, 'gantt');

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${baseName}.${ext}`;
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
      const ganttElement = document.getElementById('gantt-export-target');
      if (!ganttElement) throw new Error('Chart not found');

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const width = ganttElement.scrollWidth;
      const height = ganttElement.scrollHeight;
      const canvas = await html2canvas(ganttElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          const style = clonedDoc.createElement('style');
          style.textContent = `
            * { animation: none !important; transition: none !important; }
          `;
          clonedDoc.head.appendChild(style);
        },
      });

      const imgData = canvas.toDataURL('image/png');
      const totalProgress = Math.round(tasks.reduce((acc, curr) => acc + curr.progress, 0) / (tasks.length || 1));
      const completed = tasks.filter((t) => t.progress === 100).length;
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
          </style>
        </head>
        <body>
          <h1>${reportTitle} 진행상황보고서</h1>
          <h2>1. 프로젝트 요약</h2>
          <div class="summary-box">
            <p class="stat"><strong>생성일</strong> ${formatDate(new Date())}</p>
            <p class="stat"><strong>전체 진행률</strong> ${totalProgress}%</p>
            <p class="stat"><strong>총 업무 수</strong> ${tasks.length}개(완료: ${completed}개)</p>
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
              ${tasks
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
          <h2>3. 일정 흐름 (Gantt Chart - ${escapeHtml(reportGanttMode)} View)</h2>
          <div class="img-container"><img src="${imgData}" /></div>
          <br /><br />
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
      setIsReportModalOpen(false);
    } catch (error) {
      console.error(error);
      alert('보고서 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const saveProjectFile = () => {
    const data = { name: projectName, tasks, vacations, rangePadding, fitSettings };
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
          if (window.confirm('현재 데이터를 덮어쓰시겠습니까?')) setTasks(normalizeTasks(parsed));
        } else if (parsed.tasks) {
          if (window.confirm(`'${parsed.name || '프로젝트'}' 프로젝트를 불러오시겠습니까?`)) {
            setTasks(normalizeTasks(parsed.tasks));
            setProjectName(parsed.name || '');
            setVacations(normalizeVacations(parsed.vacations || []));
            setRangePadding(parsed.rangePadding || defaultRangePadding);
            setFitSettings({ ...defaultFitSettings, ...(parsed.fitSettings || {}) });
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
              openReportModal={() => setIsReportModalOpen(true)}
            />
          </div>
        );
      case 'schedule':
        return (
          <ScheduleView
            projectName={projectName}
            tasks={tasks}
            filteredTasks={filteredTasks}
            vacations={vacations}
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
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-700">
      <AppHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSaveProject={saveProjectFile}
        onImportFile={handleFileImport}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-0">{renderContent()}</main>

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
        onClose={() => setIsReportModalOpen(false)}
        tasks={tasks}
        vacations={vacations}
        rangePadding={rangePadding}
        reportGanttMode={reportGanttMode}
        setReportGanttMode={setReportGanttMode}
        generateWordReport={generateWordReport}
        isGenerating={isGenerating}
      />

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
