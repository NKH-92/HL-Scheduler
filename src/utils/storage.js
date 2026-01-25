import { STORAGE_KEYS } from './storageKeys';

export const readStorage = (key) => {
  try {
    return localStorage.getItem(key.current) ?? localStorage.getItem(key.legacy);
  } catch {
    return null;
  }
};

export const migrateLegacyStorage = () => {
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
