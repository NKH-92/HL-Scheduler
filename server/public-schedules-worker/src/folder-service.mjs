export const compareFoldersForOrder = (left, right) => {
  const sortGap = (Number(left?.sortOrder) || 0) - (Number(right?.sortOrder) || 0);
  if (sortGap !== 0) return sortGap;
  return String(left?.name || '').localeCompare(String(right?.name || ''), 'ko', { sensitivity: 'base' });
};

export const resolveFolderPath = async (db, folderId, { normalizeFolderId, parseD1Rows }) => {
  const safeFolderId = normalizeFolderId(folderId);
  if (!safeFolderId) return '';

  const result = await db
    .prepare(
      [
        'WITH RECURSIVE folder_path(id, name, parent_id, depth) AS (',
        'SELECT id, name, parent_id, 0 FROM folders WHERE id = ?',
        'UNION ALL',
        'SELECT f.id, f.name, f.parent_id, folder_path.depth + 1',
        'FROM folders f',
        'JOIN folder_path ON folder_path.parent_id = f.id',
        ')',
        'SELECT name, depth FROM folder_path ORDER BY depth DESC',
      ].join(' '),
    )
    .bind(safeFolderId)
    .all();

  return parseD1Rows(result)
    .map((row) => String(row?.name || '').trim())
    .filter(Boolean)
    .join(' / ');
};

export const ensureFolderExists = async (db, folderId) => {
  if (folderId == null) return true;
  const row = await db.prepare('SELECT id FROM folders WHERE id = ?').bind(folderId).first();
  return !!row;
};

export const listFoldersFlat = async (
  db,
  { normalizeFolderId, parseD1Rows, toSafeTimestamp },
) => {
  const result = await db
    .prepare(
      [
        'SELECT id, name, parent_id, depth, sort_order, created_at, updated_at',
        'FROM folders',
        'ORDER BY sort_order ASC, name COLLATE NOCASE ASC',
      ].join(' '),
    )
    .all();

  return parseD1Rows(result).map((row) => {
    const id = String(row?.id || '').trim();
    return {
      id,
      name: String(row?.name || '').trim() || id,
      parentId: normalizeFolderId(row?.parent_id ?? row?.parentId),
      depth: Math.max(1, Number(row?.depth) || 1),
      sortOrder: Number(row?.sort_order ?? row?.sortOrder) || 0,
      createdAt: toSafeTimestamp(row?.created_at ?? row?.createdAt),
      updatedAt: toSafeTimestamp(row?.updated_at ?? row?.updatedAt),
    };
  });
};

export const buildFolderContext = async (db, deps) => {
  const flatFolders = await listFoldersFlat(db, deps);
  const byId = new Map();
  const childrenByParent = new Map();

  flatFolders.forEach((folder) => {
    if (!folder.id) return;
    byId.set(folder.id, folder);
    const key = folder.parentId || '';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(folder.id);
  });

  childrenByParent.forEach((childIds, key) => {
    childIds.sort((leftId, rightId) => compareFoldersForOrder(byId.get(leftId), byId.get(rightId)));
    childrenByParent.set(key, childIds);
  });

  const pathCache = new Map();
  const resolvePath = (folderId, visited = new Set()) => {
    if (!folderId) return '';
    if (pathCache.has(folderId)) return pathCache.get(folderId);
    if (visited.has(folderId)) return '';

    visited.add(folderId);
    const folder = byId.get(folderId);
    if (!folder) return '';

    const parentPath = folder.parentId ? resolvePath(folder.parentId, visited) : '';
    const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
    pathCache.set(folderId, path);
    visited.delete(folderId);
    return path;
  };

  const pathById = new Map();
  flatFolders.forEach((folder) => {
    pathById.set(folder.id, resolvePath(folder.id));
  });

  const folders = [];
  const visitedFolderIds = new Set();
  const appendChildren = (parentId = '') => {
    const childIds = childrenByParent.get(parentId) || [];
    childIds.forEach((childId) => {
      if (!childId || visitedFolderIds.has(childId)) return;
      visitedFolderIds.add(childId);
      const folder = byId.get(childId);
      if (!folder) return;
      folders.push(folder);
      appendChildren(childId);
    });
  };
  appendChildren('');
  flatFolders.forEach((folder) => {
    if (!folder?.id || visitedFolderIds.has(folder.id)) return;
    visitedFolderIds.add(folder.id);
    folders.push(folder);
    appendChildren(folder.id);
  });

  return { folders, byId, childrenByParent, pathById };
};

export const listSiblingFolders = async (
  db,
  parentId,
  { normalizeFolderId, parseD1Rows, toSafeTimestamp },
) => {
  const result = await db
    .prepare(
      [
        'SELECT id, name, parent_id, depth, sort_order, created_at, updated_at',
        'FROM folders',
        'WHERE parent_id IS ?',
        'ORDER BY sort_order ASC, name COLLATE NOCASE ASC',
      ].join(' '),
    )
    .bind(parentId)
    .all();

  return parseD1Rows(result)
    .map((row) => {
      const id = String(row?.id || '').trim();
      if (!id) return null;
      return {
        id,
        name: String(row?.name || '').trim() || id,
        parentId: normalizeFolderId(row?.parent_id ?? row?.parentId),
        depth: Math.max(1, Number(row?.depth) || 1),
        sortOrder: Number(row?.sort_order ?? row?.sortOrder) || 0,
        createdAt: toSafeTimestamp(row?.created_at ?? row?.createdAt),
        updatedAt: toSafeTimestamp(row?.updated_at ?? row?.updatedAt),
      };
    })
    .filter(Boolean)
    .sort(compareFoldersForOrder);
};

export const resequenceSiblingFolders = async (db, siblings, timestamp) => {
  const statements = [];
  for (let index = 0; index < siblings.length; index += 1) {
    const folder = siblings[index];
    const nextSortOrder = index + 1;
    statements.push(
      db.prepare('UPDATE folders SET sort_order = ?, updated_at = ? WHERE id = ?').bind(nextSortOrder, timestamp, folder.id),
    );
  }
  if (statements.length > 0) await db.batch(statements);
};

export const collectDescendantFolderIds = (folderId, childrenByParent) => {
  const root = String(folderId || '').trim();
  if (!root) return [];
  const result = [];
  const queue = [root];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    result.push(current);

    const children = childrenByParent.get(current) || [];
    children.forEach((childId) => {
      if (!seen.has(childId)) queue.push(childId);
    });
  }

  return result;
};
