import { useCallback, useEffect, useState } from 'react';

const KEY_PREFIX = 'admin_pref_';

function readValue(storageKey, defaultValue) {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

export default function useAdminPreference(name, defaultValue) {
  const storageKey = `${KEY_PREFIX}${name}`;
  const [value, setValue] = useState(() => readValue(storageKey, defaultValue));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Ignore storage failures (private mode, quota, etc.)
    }
  }, [storageKey, value]);

  useEffect(() => {
    function onStorage(event) {
      if (event.key !== storageKey) return;
      setValue(readValue(storageKey, defaultValue));
    }

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey, defaultValue]);

  const updateValue = useCallback((next) => {
    setValue((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);

  return [value, updateValue];
}