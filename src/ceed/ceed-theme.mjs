import { getTimes } from 'suncalc';
export const THEME_KEY = 'ceed-appearance-v1';
export const THEME_EVENT = 'ceed:appearance';
export const MODES = ['auto', 'light', 'dark'];
export function londonSunTimes(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const date = Object.fromEntries(parts.map(p => [p.type, p.value]));
  // Noon UTC reliably selects London's calendar/solar day, including DST changes.
  return getTimes(new Date(`${date.year}-${date.month}-${date.day}T12:00:00Z`), 51.5074, -0.1278);
}
export function resolveTheme(mode = 'auto', now = new Date()) {
  if (mode === 'light' || mode === 'dark') return mode;
  const { sunrise, sunset } = londonSunTimes(now);
  return sunrise && sunset && now >= sunrise && now < sunset ? 'light' : 'dark';
}
export function themeDelay(now = new Date()) {
  const { sunrise, sunset } = londonSunTimes(now);
  const boundary = [sunrise, sunset].filter(date => date && date > now).sort((a, b) => a - b)[0];
  return boundary ? Math.max(50, Math.min(60000, boundary - now + 50)) : 60000;
}
let memoryMode = 'auto';
export function readMode() {
  if (typeof window === 'undefined') return 'auto';
  try { const value = localStorage.getItem(THEME_KEY); return MODES.includes(value) ? value : memoryMode; } catch { return memoryMode; }
}
export function saveMode(value) {
  memoryMode = MODES.includes(value) ? value : 'auto';
  try { localStorage.setItem(THEME_KEY, memoryMode); } catch { /* Appearance still works when browser storage is unavailable. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}
export function subscribeMode(callback) {
  const storage = event => { if (event.key === THEME_KEY || event.key === null) callback(); };
  window.addEventListener(THEME_EVENT, callback); window.addEventListener('storage', storage);
  return () => { window.removeEventListener(THEME_EVENT, callback); window.removeEventListener('storage', storage); };
}
export const serverMode = () => 'auto';
