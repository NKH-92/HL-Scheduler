const trim = (value) => String(value ?? '').trim();

const sanitizeWorkspace = (workspace) => {
  if (!workspace || typeof workspace !== 'object') return null;
  return {
    id: trim(workspace.id),
    name: trim(workspace.name),
    description: trim(workspace.description),
    createdAt: Number(workspace.createdAt) || 0,
    updatedAt: Number(workspace.updatedAt) || 0,
  };
};

const sanitizeShareLink = (shareLink) => {
  if (!shareLink || typeof shareLink !== 'object') return null;
  return {
    id: trim(shareLink.id),
    workspaceId: trim(shareLink.workspaceId),
    boardId: trim(shareLink.boardId) || null,
    scope: trim(shareLink.scope) === 'board' ? 'board' : 'workspace',
    tokenHint: trim(shareLink.tokenHint),
    createdAt: Number(shareLink.createdAt) || 0,
    updatedAt: Number(shareLink.updatedAt) || 0,
  };
};

const sanitizeCards = (cards) =>
  (Array.isArray(cards) ? cards : []).map((card) => ({
    ...card,
    leadUserId: null,
    leadEmail: '',
    createdByUserId: null,
  }));

const sanitizeCardTasks = (cardTasks) =>
  (Array.isArray(cardTasks) ? cardTasks : []).map((task) => ({
    ...task,
    assigneeUserId: null,
    assigneeEmail: '',
    createdByUserId: null,
  }));

const sanitizeWorkspaceTimeOffEntries = (timeOffEntries) =>
  (Array.isArray(timeOffEntries) ? timeOffEntries : []).map((entry) => ({
    ...entry,
    memberUserId: null,
    memberName: '',
    memberEmail: '',
  }));

export const sanitizeShareSnapshot = (snapshot, shareLink) => {
  const safeShareLink = sanitizeShareLink(shareLink);
  const scope = safeShareLink?.scope || 'workspace';

  return {
    ...snapshot,
    workspace: sanitizeWorkspace(snapshot?.workspace),
    cards: sanitizeCards(snapshot?.cards),
    cardTasks: sanitizeCardTasks(snapshot?.cardTasks),
    timeOffEntries: scope === 'board' ? [] : sanitizeWorkspaceTimeOffEntries(snapshot?.timeOffEntries),
    members: [],
    shareLinks: [],
    share: safeShareLink,
  };
};
