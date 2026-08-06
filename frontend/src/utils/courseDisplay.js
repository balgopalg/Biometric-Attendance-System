export function formatCourseName(name, options = {}) {
  const baseName = String(name || '').trim();
  if (!baseName) return 'N/A';

  const status = String(options.status || '').trim().toLowerCase();
  const isInactive = options.isInactive === true || status === 'inactive';
  if (!isInactive) return baseName;

  if (/\(discontinued\)$/i.test(baseName)) return baseName;
  return `${baseName} (Discontinued)`;
}
