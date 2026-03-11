export const routeWorkerRequest = async ({
  request,
  env,
  url,
  method,
  pathname,
  adminSurfaceEnabled,
  decodePathSegment,
  textResponse,
  jsonResponse,
  errorResponse,
  handleCollabRequest,
  handleRegisterAuth,
  handleLoginAuth,
  handleAuthMe,
  handleAuthLogout,
  handleAdminListUsers,
  handleAdminApproveUser,
  handleAdminRejectUser,
  handleAdminResetPassword,
  handleListSchedules,
  handleGetSchedule,
  handleUpdateSchedule,
  handleDeleteSchedule,
  handleCreateSchedule,
  handlePatchScheduleFolder,
  handleListFoldersTree,
  handleCreateFolder,
  handlePatchFolderOrder,
  handleDeleteFolder,
  helpers,
}) => {
  if (method === 'GET' && pathname === '/healthz') {
    return jsonResponse({ ok: true });
  }

  if (method === 'GET' && pathname === '/') {
    return textResponse('HL Scheduler public schedules worker');
  }

  if (pathname.startsWith('/api/v2/')) {
    return handleCollabRequest({
      request,
      env,
      url,
      method,
      pathname,
      helpers,
    });
  }

  if (method === 'POST' && pathname === '/api/auth/register') {
    return handleRegisterAuth(request, env);
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    return handleLoginAuth(request, env);
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    return handleAuthMe(request, env);
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    return handleAuthLogout(request, env);
  }

  if (pathname.startsWith('/api/admin/') && !adminSurfaceEnabled) {
    return errorResponse('Not found.', { status: 404 });
  }

  if (method === 'GET' && pathname === '/api/admin/users') {
    return handleAdminListUsers(request, env);
  }

  const adminUserApproveMatch = /^\/api\/admin\/users\/([^/]+)\/approve$/.exec(pathname);
  if (method === 'POST' && adminUserApproveMatch) {
    const userId = decodePathSegment(adminUserApproveMatch[1]);
    if (!userId) return errorResponse('Invalid user id.', { status: 400 });
    return handleAdminApproveUser(request, env, userId);
  }

  const adminUserRejectMatch = /^\/api\/admin\/users\/([^/]+)\/reject$/.exec(pathname);
  if (method === 'POST' && adminUserRejectMatch) {
    const userId = decodePathSegment(adminUserRejectMatch[1]);
    if (!userId) return errorResponse('Invalid user id.', { status: 400 });
    return handleAdminRejectUser(request, env, userId);
  }

  const adminUserResetPasswordMatch = /^\/api\/admin\/users\/([^/]+)\/reset-password$/.exec(pathname);
  if (method === 'POST' && adminUserResetPasswordMatch) {
    const userId = decodePathSegment(adminUserResetPasswordMatch[1]);
    if (!userId) return errorResponse('Invalid user id.', { status: 400 });
    return handleAdminResetPassword(request, env, userId);
  }

  if (method === 'GET' && pathname === '/api/schedules') {
    return handleListSchedules(request, env);
  }

  const scheduleIdMatch = /^\/api\/schedules\/([^/]+)$/.exec(pathname);
  if (scheduleIdMatch) {
    const id = decodePathSegment(scheduleIdMatch[1]);
    if (!id) return errorResponse('Invalid schedule id.', { status: 400 });
    if (method === 'GET') return handleGetSchedule(request, env, id);
    if (method === 'PUT') return handleUpdateSchedule(request, env, id);
    if (method === 'DELETE') return handleDeleteSchedule(request, env, id);
  }

  if (method === 'POST' && pathname === '/api/schedules') {
    return handleCreateSchedule(request, env);
  }

  const scheduleFolderMatch = /^\/api\/schedules\/([^/]+)\/folder$/.exec(pathname);
  if (method === 'PATCH' && scheduleFolderMatch) {
    const id = decodePathSegment(scheduleFolderMatch[1]);
    if (!id) return errorResponse('Invalid schedule id.', { status: 400 });
    return handlePatchScheduleFolder(request, env, id);
  }

  if (method === 'GET' && pathname === '/api/folders/tree') {
    return handleListFoldersTree(env);
  }

  if (method === 'POST' && pathname === '/api/folders') {
    return handleCreateFolder(request, env);
  }

  const folderOrderMatch = /^\/api\/folders\/([^/]+)\/order$/.exec(pathname);
  if (method === 'PATCH' && folderOrderMatch) {
    const id = decodePathSegment(folderOrderMatch[1]);
    if (!id) return errorResponse('Invalid folder id.', { status: 400 });
    return handlePatchFolderOrder(request, env, id);
  }

  const folderIdMatch = /^\/api\/folders\/([^/]+)$/.exec(pathname);
  if (method === 'DELETE' && folderIdMatch) {
    const id = decodePathSegment(folderIdMatch[1]);
    if (!id) return errorResponse('Invalid folder id.', { status: 400 });
    return handleDeleteFolder(request, env, id);
  }

  return errorResponse('Not found.', { status: 404 });
};
