const EMPTY_EMPLOYEE_DIRECTORY = Object.freeze([]);

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

export const getEmployeeDirectory = () => EMPTY_EMPLOYEE_DIRECTORY;

export const findEmployeeByEmail = (email, directory = EMPTY_EMPLOYEE_DIRECTORY) => {
  const target = normalizeEmail(email);
  if (!target) return null;

  const list = Array.isArray(directory) ? directory : [];
  return list.find((employee) => normalizeEmail(employee?.email) === target) || null;
};
