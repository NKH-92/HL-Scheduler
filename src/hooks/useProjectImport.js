import { useCallback } from 'react';
import { normalizeVacations } from '../utils/data';
import { toUtcMidnightMs } from '../utils/dates';
import { resolveImportedProjectName, stripUtf8Bom } from '../utils/imports';
import { mergeRangePadding, sanitizeFitSettings, sanitizeZoomSettings } from '../utils/schedulerSettings';
import { isPlainObject, limitArray } from '../utils/shared';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_TASKS = 5000;
export const MAX_IMPORT_VACATIONS = 2000;

const IMPORT_CONFIRM_OPTIONS = {
  title: '가져오기 확인',
  confirmText: '가져오기',
  cancelText: '취소',
};

const buildImportLimitNotice = (taskCount, vacationCount) => {
  if (!taskCount && !vacationCount) return '';
  const parts = [];
  if (taskCount) parts.push(`Task ${taskCount}`);
  if (vacationCount) parts.push(`Vacation ${vacationCount}`);
  return `\n\n(Import limit: ${parts.join(', ')})`;
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
  if (taskCount) parts.push(`Task ${taskCount}`);
  if (vacationCount) parts.push(`Vacation ${vacationCount}`);
  return `\n\nAdjusted invalid end-date ranges automatically (${parts.join(', ')}).`;
};

const isImportableProjectData = (parsed) =>
  isPlainObject(parsed) && (Array.isArray(parsed.tasks) || Array.isArray(parsed.vacations));

export default function useProjectImport({
  alertAsync,
  applyTaskRules,
  confirmAsync,
  setFitSettings,
  setProjectName,
  setPublicOrigin,
  setRangePadding,
  setTasks,
  setVacations,
  setZoomSettings,
}) {
  const commitImportedData = useCallback(
    ({
      tasksRaw,
      projectName = '',
      vacationsRaw = [],
      rangePadding = null,
      fitSettings = null,
      zoomSettings = null,
      clearPublicOrigin = false,
    }) => {
      setTasks(applyTaskRules(tasksRaw));
      setProjectName(projectName);
      setVacations(normalizeVacations(vacationsRaw));
      setRangePadding(mergeRangePadding(rangePadding));
      setFitSettings(sanitizeFitSettings(fitSettings));
      setZoomSettings(sanitizeZoomSettings(zoomSettings));
      if (clearPublicOrigin) {
        setPublicOrigin?.(null);
      }
    },
    [
      setTasks,
      applyTaskRules,
      setProjectName,
      setVacations,
      setRangePadding,
      setFitSettings,
      setZoomSettings,
      setPublicOrigin,
    ],
  );

  const applyImportedTaskArray = useCallback(
    async (parsed, { sourceName } = {}, { clearPublicOrigin = false, fileImport = false, skipConfirm = false } = {}) => {
      const tasksRaw = limitArray(parsed, MAX_IMPORT_TASKS);
      const limitNotice = buildImportLimitNotice(Array.isArray(parsed) && parsed.length > MAX_IMPORT_TASKS ? MAX_IMPORT_TASKS : 0, 0);
      const invalidTasks = countInvalidRanges(
        tasksRaw,
        (task) => task?.start || task?.actStart || task?.planStart || '',
        (task) => task?.end || task?.actEnd || task?.planEnd || '',
      );
      const invalidNotice = buildInvalidRangeNotice(invalidTasks, 0) + limitNotice;
      const confirmed = skipConfirm
        ? true
        : await confirmAsync(
            fileImport
              ? `작업 배열 데이터를 현재 프로젝트로 가져올까요?${invalidNotice}`
              : `${sourceName ? `'${sourceName}'` : '선택한 일정'}을 가져올까요?${invalidNotice}\n\n현재 일정 데이터는 덮어쓰기 됩니다.`,
            IMPORT_CONFIRM_OPTIONS,
          );
      if (!confirmed) return false;

      commitImportedData({
        tasksRaw,
        projectName: fileImport ? '' : resolveImportedProjectName({ sourceName }),
        clearPublicOrigin,
      });
      return true;
    },
    [commitImportedData, confirmAsync],
  );

  const applyImportedProject = useCallback(
    async (parsed, { sourceName } = {}, { clearPublicOrigin = false, fileImport = false, skipConfirm = false } = {}) => {
      const tasksRaw = limitArray(parsed.tasks || [], MAX_IMPORT_TASKS);
      const vacationsRaw = limitArray(parsed.vacations || [], MAX_IMPORT_VACATIONS);
      const limitNotice = buildImportLimitNotice(
        Array.isArray(parsed.tasks) && parsed.tasks.length > MAX_IMPORT_TASKS ? MAX_IMPORT_TASKS : 0,
        Array.isArray(parsed.vacations) && parsed.vacations.length > MAX_IMPORT_VACATIONS ? MAX_IMPORT_VACATIONS : 0,
      );
      const invalidTasks = countInvalidRanges(
        tasksRaw,
        (task) => task?.start || task?.actStart || task?.planStart || '',
        (task) => task?.end || task?.actEnd || task?.planEnd || '',
      );
      const invalidVacations = countInvalidRanges(
        vacationsRaw,
        (vacation) => vacation?.start || vacation?.startDate || '',
        (vacation) => vacation?.end || vacation?.endDate || vacation?.start || vacation?.startDate || '',
      );
      const invalidNotice = buildInvalidRangeNotice(invalidTasks, invalidVacations) + limitNotice;
      const resolvedName = String(parsed.name || sourceName || '프로젝트').trim() || '프로젝트';
      const confirmed = skipConfirm
        ? true
        : await confirmAsync(
            fileImport
              ? `'${resolvedName}' 프로젝트를 가져올까요?${invalidNotice}`
              : `'${resolvedName}' 프로젝트를 가져올까요?${invalidNotice}\n\n현재 일정 데이터는 덮어쓰기 됩니다.`,
            IMPORT_CONFIRM_OPTIONS,
          );
      if (!confirmed) return false;

      commitImportedData({
        tasksRaw,
        projectName: fileImport
          ? typeof parsed.name === 'string'
            ? parsed.name
            : ''
          : resolveImportedProjectName({ parsedName: parsed.name, sourceName }),
        vacationsRaw,
        rangePadding: parsed.rangePadding,
        fitSettings: parsed.fitSettings,
        zoomSettings: parsed.zoomSettings,
        clearPublicOrigin,
      });
      return true;
    },
    [commitImportedData, confirmAsync],
  );

  const applyImportedData = useCallback(
    async (parsed, { sourceName } = {}, { skipConfirm = false } = {}) => {
      if (Array.isArray(parsed)) {
        return applyImportedTaskArray(parsed, { sourceName }, { skipConfirm });
      }

      if (isImportableProjectData(parsed)) {
        return applyImportedProject(parsed, { sourceName }, { skipConfirm });
      }

      throw new Error('지원하지 않는 데이터 형식입니다.');
    },
    [applyImportedProject, applyImportedTaskArray],
  );

  const handleFileImport = useCallback(
    (event) => {
      const input = event.target;
      const file = input.files?.[0];
      if (!file) return;

      if (file.size > MAX_IMPORT_BYTES) {
        void alertAsync(`파일이 너무 큽니다. 최대 ${Math.round(MAX_IMPORT_BYTES / (1024 * 1024))}MB까지 가져올 수 있습니다.`);
        input.value = null;
        return;
      }

      const reader = new FileReader();
      reader.onload = async (loadEvent) => {
        try {
          const rawText = stripUtf8Bom(String(loadEvent.target?.result || ''));
          const parsed = JSON.parse(rawText);

          if (Array.isArray(parsed)) {
            await applyImportedTaskArray(parsed, {}, { clearPublicOrigin: true, fileImport: true });
            return;
          }

          if (isImportableProjectData(parsed)) {
            await applyImportedProject(parsed, {}, { clearPublicOrigin: true, fileImport: true });
            return;
          }

          void alertAsync('지원하지 않는 파일 형식입니다.');
        } catch {
          void alertAsync('파일이 손상되었거나 JSON 형식이 올바르지 않습니다.');
        }
      };

      reader.readAsText(file);
      input.value = null;
    },
    [alertAsync, applyImportedProject, applyImportedTaskArray],
  );

  return {
    applyImportedData,
    handleFileImport,
  };
}
