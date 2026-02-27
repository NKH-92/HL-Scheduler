/**
 * Shared utility functions used across multiple components/modules.
 * Extracted to eliminate code duplication.
 */

export const isPlainObject = (value) =>
    value != null && typeof value === 'object' && !Array.isArray(value);

export const getDisplayVersion = () => {
    const raw = typeof __APP_VERSION__ !== 'undefined' ? String(__APP_VERSION__) : '';
    const parts = raw.split('.').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
    if (parts.length === 1) return parts[0];
    return '';
};

export const clampZoom = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 100;
    return Math.max(25, Math.min(300, Math.round(n)));
};

export const sanitizeFileName = (value, fallback) => {
    const base = String(value || fallback || '').trim() || String(fallback || 'file');
    return base.replace(/[\\/:*?"<>|]/g, '_');
};

export const escapeHtml = (value) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

export const buildFolderSelectOptions = (rows, uncategorizedId) => {
    const list = Array.isArray(rows) ? rows : [];

    const normalized = list
        .map((row) => {
            const id = String(row?.id || '').trim();
            if (!id) return null;
            const depth = Math.max(1, Number(row?.depth) || 1);
            const name = String(row?.name || '').trim() || id;
            const path = String(row?.path || '').trim() || name;
            const indent = '-- '.repeat(Math.max(0, depth - 1));
            return {
                id,
                depth,
                path,
                label: `${indent}${name}`,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.path.localeCompare(b.path, 'ko'));

    return [
        {
            id: uncategorizedId,
            depth: 0,
            path: '',
            label: '미분류',
        },
        ...normalized,
    ];
};

export const limitArray = (list, max) => (Array.isArray(list) ? list.slice(0, max) : []);
