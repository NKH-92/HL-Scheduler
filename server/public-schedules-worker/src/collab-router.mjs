export const routeCollabRequest = async ({
  request,
  env,
  helpers,
  url,
  method,
  pathname,
  handlers,
}) => {
  const {
    handleListWorkspaces,
    handleCreateWorkspace,
    handleGetWorkspaceSnapshot,
    handleCreateBoard,
    handleCreateBoardColumn,
    handleCreateCard,
    handleCreateTask,
    handleCreateTimeOff,
    handleCreateShareLink,
    handleImportLegacy,
    handleRealtimeRequest,
    handlePatchCard,
    handleDeleteCard,
    handlePatchTask,
    handleDeleteTask,
    handlePatchTimeOff,
    handleDeleteTimeOff,
    handleGetShareSnapshot,
  } = handlers;

  if (method === 'GET' && pathname === '/api/v2/workspaces') return handleListWorkspaces(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/workspaces') return handleCreateWorkspace(request, env, helpers);

  const workspaceSnapshotMatch = /^\/api\/v2\/workspaces\/([^/]+)\/snapshot$/.exec(pathname);
  if (method === 'GET' && workspaceSnapshotMatch) {
    return handleGetWorkspaceSnapshot(request, env, helpers, decodeURIComponent(workspaceSnapshotMatch[1]));
  }

  if (method === 'POST' && pathname === '/api/v2/boards') return handleCreateBoard(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/board-columns') return handleCreateBoardColumn(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/cards') return handleCreateCard(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/card-tasks') return handleCreateTask(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/time-off') return handleCreateTimeOff(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/share-links') return handleCreateShareLink(request, env, helpers);
  if (method === 'POST' && pathname === '/api/v2/import/legacy') return handleImportLegacy(request, env, helpers);
  if (method === 'GET' && pathname === '/api/v2/realtime') return handleRealtimeRequest(request, env, helpers, url);

  const cardMatch = /^\/api\/v2\/cards\/([^/]+)$/.exec(pathname);
  if (cardMatch) {
    const cardId = decodeURIComponent(cardMatch[1]);
    if (method === 'PATCH') return handlePatchCard(request, env, helpers, cardId);
    if (method === 'DELETE') return handleDeleteCard(request, env, helpers, cardId);
  }

  const taskMatch = /^\/api\/v2\/card-tasks\/([^/]+)$/.exec(pathname);
  if (taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    if (method === 'PATCH') return handlePatchTask(request, env, helpers, taskId);
    if (method === 'DELETE') return handleDeleteTask(request, env, helpers, taskId);
  }

  const timeOffMatch = /^\/api\/v2\/time-off\/([^/]+)$/.exec(pathname);
  if (timeOffMatch) {
    const entryId = decodeURIComponent(timeOffMatch[1]);
    if (method === 'PATCH') return handlePatchTimeOff(request, env, helpers, entryId);
    if (method === 'DELETE') return handleDeleteTimeOff(request, env, helpers, entryId);
  }

  const shareSnapshotMatch = /^\/api\/v2\/share-links\/([^/]+)\/snapshot$/.exec(pathname);
  if (method === 'GET' && shareSnapshotMatch) {
    return handleGetShareSnapshot(request, env, helpers, decodeURIComponent(shareSnapshotMatch[1]));
  }

  return helpers.errorResponse('Not found.', { status: 404 });
};
