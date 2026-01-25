import { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_TASKS, normalizeTasks, normalizeVacations } from '../utils/data';
import { mergeRangePadding, sanitizeFitSettings, sanitizeZoomSettings } from '../utils/schedulerSettings';
import { readStorage, migrateLegacyStorage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';

export const useSchedulerStorage = () => {
  const [storageError, setStorageError] = useState(false);
  const storageErrorRef = useRef(false);

  const markStorageError = useCallback(() => {
    if (storageErrorRef.current) return;
    storageErrorRef.current = true;
    setStorageError(true);
  }, []);

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
    if (!saved) return mergeRangePadding(null);
    try {
      const parsed = JSON.parse(saved);
      return mergeRangePadding(parsed);
    } catch {
      return mergeRangePadding(null);
    }
  });
  const [fitSettings, setFitSettings] = useState(() => {
    const saved = readStorage(STORAGE_KEYS.fitSettings);
    if (!saved) return sanitizeFitSettings(null);
    try {
      const parsed = JSON.parse(saved);
      return sanitizeFitSettings(parsed);
    } catch {
      return sanitizeFitSettings(null);
    }
  });
  const [zoomSettings, setZoomSettings] = useState(() => {
    const saved = readStorage(STORAGE_KEYS.zoomSettings);
    if (!saved) return sanitizeZoomSettings(null);
    try {
      const parsed = JSON.parse(saved);
      return sanitizeZoomSettings(parsed);
    } catch {
      return sanitizeZoomSettings(null);
    }
  });

  const persistTimerRef = useRef(0);
  const persistSnapshotRef = useRef({
    tasks,
    vacations,
    projectName,
    rangePadding,
    fitSettings,
    zoomSettings,
  });

  useEffect(() => {
    migrateLegacyStorage();
  }, []);

  persistSnapshotRef.current = {
    tasks,
    vacations,
    projectName,
    rangePadding,
    fitSettings,
    zoomSettings,
  };

  const persistNow = useCallback(() => {
    const snapshot = persistSnapshotRef.current;
    if (!snapshot) return;
    try {
      localStorage.setItem(STORAGE_KEYS.tasks.current, JSON.stringify(snapshot.tasks));
      localStorage.setItem(STORAGE_KEYS.vacations.current, JSON.stringify(snapshot.vacations));
      localStorage.setItem(STORAGE_KEYS.name.current, snapshot.projectName);
      localStorage.setItem(STORAGE_KEYS.rangePadding.current, JSON.stringify(snapshot.rangePadding));
      localStorage.setItem(STORAGE_KEYS.fitSettings.current, JSON.stringify(snapshot.fitSettings));
      localStorage.setItem(STORAGE_KEYS.zoomSettings.current, JSON.stringify(snapshot.zoomSettings));
    } catch {
      markStorageError();
    }
  }, [markStorageError]);

  useEffect(() => {
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(persistNow, 400);

    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = 0;
      }
    };
  }, [tasks, vacations, projectName, rangePadding, fitSettings, zoomSettings, persistNow]);

  useEffect(() => {
    const handlePersist = () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = 0;
      }
      persistNow();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handlePersist();
    };

    window.addEventListener('beforeunload', handlePersist);
    window.addEventListener('pagehide', handlePersist);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handlePersist);
      window.removeEventListener('pagehide', handlePersist);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [persistNow]);

  return {
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
  };
};
