const trimTrailingSlash = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '/';
  const trimmed = normalized.replace(/\/+$/, '');
  return trimmed || '/';
};

export const buildCollabHomePath = () => '/collab';

export const buildWorkspacePath = (workspaceId) =>
  `/collab/w/${encodeURIComponent(String(workspaceId || '').trim())}`;

export const buildSharePath = (token) => `/share/${encodeURIComponent(String(token || '').trim())}`;

export const parseAppRoute = (pathname = '') => {
  const safePath = trimTrailingSlash(pathname);

  if (safePath === '/collab') {
    return { type: 'collab-home' };
  }

  if (safePath.startsWith('/collab/w/')) {
    const workspaceId = decodeURIComponent(safePath.slice('/collab/w/'.length));
    if (workspaceId) {
      return { type: 'collab-workspace', workspaceId };
    }
  }

  if (safePath.startsWith('/share/')) {
    const token = decodeURIComponent(safePath.slice('/share/'.length));
    if (token) {
      return { type: 'collab-share', token };
    }
  }

  return { type: 'legacy' };
};

export const navigateTo = (to, { replace = false } = {}) => {
  if (typeof window === 'undefined') return;
  const target = String(to || '').trim() || '/';
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === target) return;
  if (replace) {
    window.history.replaceState({}, '', target);
  } else {
    window.history.pushState({}, '', target);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
};
