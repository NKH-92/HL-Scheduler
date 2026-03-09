export const stripUtf8Bom = (value) => String(value ?? '').replace(/^\uFEFF/, '');

export const resolveImportedProjectName = ({ parsedName = '', sourceName = '' } = {}) => {
  const safeParsedName = typeof parsedName === 'string' ? parsedName : '';
  if (safeParsedName) return safeParsedName;
  return String(sourceName || '');
};
