export const resolvePostAuthNavigation = ({ user, appRole, adminAppUrl, publicAppUrl }) => {
  const isAdminUser = !!user?.isAdmin;
  const isAdminApp = String(appRole || '').trim().toLowerCase() === 'admin';
  const nextAdminAppUrl = String(adminAppUrl || '').trim();
  const nextPublicAppUrl = String(publicAppUrl || '').trim();

  if (isAdminUser && !isAdminApp && nextAdminAppUrl) {
    return { action: 'redirect', url: nextAdminAppUrl };
  }

  if (!isAdminUser && isAdminApp && nextPublicAppUrl) {
    return { action: 'redirect', url: nextPublicAppUrl };
  }

  return {
    action: 'stay',
    activeMainTab: isAdminUser ? 'edit' : 'browse',
    activeEditorTab: 'tasks',
  };
};
