import {
  buildFolderContext,
  listSiblingFolders,
  resequenceSiblingFolders,
} from './folder-service.mjs';

export const createFolderDomain = ({
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME_LENGTH,
  buildFolderContextDeps,
  getSharedScheduleId,
  jsonResponse,
  errorResponse,
  nowMs,
  normalizeFolderId,
  normalizeFolderName,
  parseD1Rows,
  readJsonObjectBody,
  ensureAdminUser,
  ensureNotReadOnly,
  isAdminSurfaceEnabled,
  resolveFolderPath,
}) => {
  const handlePatchFolderOrder = async (request, env, folderId) => {
    if (!isAdminSurfaceEnabled(env)) return errorResponse('Not found.', { status: 404 });
    const readOnlyError = ensureNotReadOnly(env);
    if (readOnlyError) return readOnlyError;

    const auth = await ensureAdminUser(request, env);
    if (auth.error) return auth.error;

    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) return errorResponse(bodyResult.message, { status: 400 });

    const direction = String(bodyResult.payload.direction || '').trim().toLowerCase();
    if (direction !== 'up' && direction !== 'down') {
      return errorResponse("direction must be 'up' or 'down'.", { status: 400 });
    }

    const currentFolder = await env.DB
      .prepare('SELECT id, name, parent_id, sort_order FROM folders WHERE id = ? LIMIT 1')
      .bind(folderId)
      .first();
    if (!currentFolder) return errorResponse('Folder not found.', { status: 404 });

    const parentId = normalizeFolderId(currentFolder?.parent_id ?? currentFolder?.parentId);
    const siblings = await listSiblingFolders(env.DB, parentId, buildFolderContextDeps);
    const currentIndex = siblings.findIndex((folder) => folder.id === folderId);
    if (currentIndex < 0) return errorResponse('Folder not found.', { status: 404 });

    const targetIndex = currentIndex + (direction === 'up' ? -1 : 1);
    if (targetIndex < 0 || targetIndex >= siblings.length) {
      const path = await resolveFolderPath(env.DB, folderId);
      return jsonResponse({
        ok: true,
        moved: false,
        id: folderId,
        parentId,
        sortOrder: Number(siblings[currentIndex]?.sortOrder) || currentIndex + 1,
        path: path || currentFolder?.name || folderId,
      });
    }

    const reordered = [...siblings];
    const [movedFolder] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, movedFolder);

    const timestamp = nowMs();
    reordered.forEach((folder, index) => {
      folder.sortOrder = index + 1;
    });
    await resequenceSiblingFolders(env.DB, reordered, timestamp);

    const path = await resolveFolderPath(env.DB, folderId);
    return jsonResponse({
      ok: true,
      moved: true,
      id: folderId,
      parentId,
      sortOrder: targetIndex + 1,
      path: path || currentFolder?.name || folderId,
      updatedAt: timestamp,
    });
  };

  const handleListFoldersTree = async (env) => {
    const { DB } = env;
    const sharedScheduleId = getSharedScheduleId(env);
    const folderContext = await buildFolderContext(DB, buildFolderContextDeps);
    const directCountById = new Map();
    const visibleFolderIds = new Set();

    if (sharedScheduleId) {
      const sharedRow = await DB.prepare('SELECT folder_id FROM schedules WHERE id = ? LIMIT 1').bind(sharedScheduleId).first();
      const sharedFolderId = normalizeFolderId(sharedRow?.folder_id ?? sharedRow?.folderId);
      if (!sharedFolderId) return jsonResponse([]);

      let cursor = sharedFolderId;
      while (cursor && !visibleFolderIds.has(cursor)) {
        visibleFolderIds.add(cursor);
        cursor = folderContext.byId.get(cursor)?.parentId || '';
      }

      directCountById.set(sharedFolderId, 1);
    } else {
      const countsResult = await DB.prepare('SELECT folder_id, COUNT(*) AS count FROM schedules GROUP BY folder_id').all();
      parseD1Rows(countsResult).forEach((row) => {
        const folderId = normalizeFolderId(row?.folder_id ?? row?.folderId);
        if (folderId == null) return;
        directCountById.set(folderId, Number(row?.count || 0) || 0);
      });
    }

    const aggregateCache = new Map();
    const aggregateCount = (folderId) => {
      if (aggregateCache.has(folderId)) return aggregateCache.get(folderId);
      let count = Number(directCountById.get(folderId) || 0);
      const children = folderContext.childrenByParent.get(folderId) || [];
      children.forEach((childId) => {
        count += aggregateCount(childId);
      });
      aggregateCache.set(folderId, count);
      return count;
    };

    return jsonResponse(
      folderContext.folders
        .filter((folder) => !sharedScheduleId || visibleFolderIds.has(folder.id))
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          depth: folder.depth,
          sortOrder: folder.sortOrder,
          path: String(folderContext.pathById.get(folder.id) || folder.name),
          projectCount: aggregateCount(folder.id),
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        })),
    );
  };

  const handleCreateFolder = async (request, env) => {
    if (!isAdminSurfaceEnabled(env)) return errorResponse('Not found.', { status: 404 });
    const readOnlyError = ensureNotReadOnly(env);
    if (readOnlyError) return readOnlyError;

    const auth = await ensureAdminUser(request, env);
    if (auth.error) return auth.error;

    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) return errorResponse(bodyResult.message, { status: 400 });

    const payload = bodyResult.payload;
    const name = normalizeFolderName(payload.name);
    if (!name) return errorResponse('name is required.', { status: 400 });
    if (name.length > MAX_FOLDER_NAME_LENGTH) {
      return errorResponse(`Folder name is too long (max ${MAX_FOLDER_NAME_LENGTH}).`, { status: 400 });
    }

    const parentId = normalizeFolderId(payload.parentId);
    let depth = 1;
    if (parentId) {
      const parentRow = await env.DB.prepare('SELECT id, depth FROM folders WHERE id = ? LIMIT 1').bind(parentId).first();
      if (!parentRow) return errorResponse('parentId does not exist.', { status: 400 });
      depth = Math.max(1, Number(parentRow.depth) || 1) + 1;
    }

    if (depth > MAX_FOLDER_DEPTH) {
      return errorResponse(`Folder depth limit exceeded (max ${MAX_FOLDER_DEPTH}).`, { status: 400 });
    }

    const nextSortResult = await env.DB
      .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM folders WHERE parent_id IS ?')
      .bind(parentId)
      .first();

    const nextSortOrder = Number(nextSortResult?.max_sort_order ?? nextSortResult?.maxSortOrder ?? 0) + 1;
    const timestamp = nowMs();
    const id = crypto.randomUUID();

    try {
      const runResult = await env.DB
        .prepare(
          [
            'INSERT INTO folders (id, name, parent_id, depth, sort_order, created_at, updated_at)',
            'VALUES (?, ?, ?, ?, ?, ?, ?)',
          ].join(' '),
        )
        .bind(id, name, parentId, depth, nextSortOrder, timestamp, timestamp)
        .run();

      if (!runResult?.success) return errorResponse('Failed to create folder.', { status: 500 });
    } catch (error) {
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('unique')) {
        return errorResponse('Folder name already exists under the same parent.', { status: 409 });
      }
      return errorResponse('Failed to create folder.', { status: 500, details: message });
    }

    const folderContext = await buildFolderContext(env.DB, buildFolderContextDeps);
    return jsonResponse(
      {
        id,
        name,
        parentId,
        depth,
        sortOrder: nextSortOrder,
        path: String(folderContext.pathById.get(id) || name),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      { status: 201 },
    );
  };

  const handleDeleteFolder = async (request, env, folderId) => {
    if (!isAdminSurfaceEnabled(env)) return errorResponse('Not found.', { status: 404 });
    const readOnlyError = ensureNotReadOnly(env);
    if (readOnlyError) return readOnlyError;

    const auth = await ensureAdminUser(request, env);
    if (auth.error) return auth.error;

    const folder = await env.DB
      .prepare('SELECT id, name, parent_id, depth FROM folders WHERE id = ? LIMIT 1')
      .bind(folderId)
      .first();
    if (!folder) return errorResponse('Folder not found.', { status: 404 });

    const child = await env.DB.prepare('SELECT id FROM folders WHERE parent_id = ? LIMIT 1').bind(folderId).first();
    if (child) {
      return errorResponse('Folder has child folders. Delete children first.', { status: 409 });
    }

    const schedule = await env.DB.prepare('SELECT id FROM schedules WHERE folder_id = ? LIMIT 1').bind(folderId).first();
    if (schedule) {
      return errorResponse('Folder is not empty. Move schedules first.', { status: 409 });
    }

    const runResult = await env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(folderId).run();
    if (!runResult?.success) return errorResponse('Failed to delete folder.', { status: 500 });

    return jsonResponse({ ok: true, id: folderId });
  };

  return {
    handleCreateFolder,
    handleDeleteFolder,
    handleListFoldersTree,
    handlePatchFolderOrder,
  };
};
