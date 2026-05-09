const SYSTEM_TIME_ZONE = import.meta.env.VITE_SYSTEM_TIMEZONE || 'Asia/Kolkata';
// Default to IST offset if not specified (needed for some backend alignment logic)
const SYSTEM_TIMEZONE_OFFSET_MINUTES = Number(import.meta.env.VITE_SYSTEM_TIMEZONE_OFFSET_MINUTES) || -330;

export function getSystemTimezoneOffsetMinutes() {
  return SYSTEM_TIMEZONE_OFFSET_MINUTES;
}

// Backward compatibility for components that haven't been renamed yet
export const getIndiaTimezoneOffsetMinutes = getSystemTimezoneOffsetMinutes;

export function formatDateTimeIndia(value, options = {}) {
  if (!value) return '—';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  // `dateStyle` / `timeStyle` cannot be combined with granular fields
  // like `year`, `month`, `hour`, etc. Build options accordingly.
  const hasStylePreset = options.dateStyle || options.timeStyle;
  const formatterOptions = hasStylePreset
    ? {
        timeZone: SYSTEM_TIME_ZONE,
        ...options,
      }
    : {
        timeZone: SYSTEM_TIME_ZONE,
        year: options.year || 'numeric',
        month: options.month || 'short',
        day: options.day || '2-digit',
        hour: options.hour || '2-digit',
        minute: options.minute || '2-digit',
        second: options.second || '2-digit',
        hour12: options.hour12 ?? true,
        ...options,
      };

  try {
    return new Intl.DateTimeFormat('en-IN', formatterOptions).format(date);
  } catch {
    // Never break rendering due to locale option mismatches.
    return date.toLocaleString('en-IN', { timeZone: SYSTEM_TIME_ZONE });
  }
}

export function formatDateIndia(value, options = {}) {
  if (!value) return '—';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: SYSTEM_TIME_ZONE,
    year: options.year || 'numeric',
    month: options.month || 'short',
    day: options.day || '2-digit',
    ...options,
  }).format(date);
}

export function formatTimeIndia(value, options = {}) {
  if (!value) return '—';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: SYSTEM_TIME_ZONE,
    hour: options.hour || '2-digit',
    minute: options.minute || '2-digit',
    second: options.second || '2-digit',
    hour12: options.hour12 ?? true,
    ...options,
  }).format(date);
}
