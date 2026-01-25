import { defaultFitSettings, defaultRangePadding, defaultZoomSettings } from './data';

const clampPaddingValue = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
};

export const mergeRangePadding = (value) => {
  const base = {
    Day: { ...defaultRangePadding.Day },
    Week: { ...defaultRangePadding.Week },
    Month: { ...defaultRangePadding.Month },
  };
  if (!value || typeof value !== 'object') return base;
  const dayValue = value.Day && typeof value.Day === 'object' ? value.Day : {};
  const weekValue = value.Week && typeof value.Week === 'object' ? value.Week : {};
  const monthValue = value.Month && typeof value.Month === 'object' ? value.Month : {};
  return {
    Day: {
      before: clampPaddingValue(dayValue.before, base.Day.before),
      after: clampPaddingValue(dayValue.after, base.Day.after),
    },
    Week: {
      before: clampPaddingValue(weekValue.before, base.Week.before),
      after: clampPaddingValue(weekValue.after, base.Week.after),
    },
    Month: {
      before: clampPaddingValue(monthValue.before, base.Month.before),
      after: clampPaddingValue(monthValue.after, base.Month.after),
    },
  };
};

export const sanitizeFitSettings = (value) => {
  const base = {
    Day: { ...defaultFitSettings.Day },
    Week: { ...defaultFitSettings.Week },
    Month: { ...defaultFitSettings.Month },
  };
  if (!value || typeof value !== 'object') return base;

  const normalize = (key) => {
    const raw = value[key];
    if (raw == null) return base[key];
    if (typeof raw === 'boolean') return { enabled: raw };
    if (typeof raw === 'object') return { enabled: !!raw.enabled };
    return base[key];
  };

  return {
    Day: normalize('Day'),
    Week: normalize('Week'),
    Month: normalize('Month'),
  };
};

export const sanitizeZoomSettings = (value) => {
  const base = { ...defaultZoomSettings };
  if (!value || typeof value !== 'object') return base;

  const clampZoom = (key) => {
    const n = Number(value[key]);
    if (!Number.isFinite(n)) return base[key];
    return Math.max(25, Math.min(300, Math.round(n)));
  };

  return {
    Day: clampZoom('Day'),
    Week: clampZoom('Week'),
    Month: clampZoom('Month'),
  };
};
