import api from '../api/axios';

export default function resolveImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Keep browser-native URLs untouched.
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;

  const base = String(api.defaults.baseURL || '').replace(/\/+$/, '');
  if (!base) return raw.startsWith('/') ? raw : `/${raw}`;

  if (raw === base || raw.startsWith(`${base}/`)) return raw;
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}