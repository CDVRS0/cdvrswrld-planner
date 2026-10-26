'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { readMode, saveMode, subscribeMode, serverMode, resolveTheme, themeDelay } from './ceed-theme.mjs';
export function CeedAppearance() {
  const mode = useSyncExternalStore(subscribeMode, readMode, serverMode);
  useEffect(() => {
    let timer;
    const apply = () => {
      clearTimeout(timer);
      const now = new Date(), theme = resolveTheme(mode, now);
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.appearance = mode;
      document.documentElement.style.colorScheme = theme;
      if (mode === 'auto') timer = setTimeout(apply, themeDelay(now));
    };
    const visible = () => { if (document.visibilityState === 'visible') apply(); };
    apply(); window.addEventListener('focus', apply); document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); window.removeEventListener('focus', apply); document.removeEventListener('visibilitychange', visible); };
  }, [mode]);
  return null;
}
export function ThemeControl() {
  const mode = useSyncExternalStore(subscribeMode, readMode, serverMode);
  return <label className="ceed-theme-control" title="Auto follows London sunrise and sunset. Manual choices stay until you return to Auto."><span aria-hidden="true" className="ceed-theme-dot" /><span className="ceed-sr-only">Appearance</span><select aria-label="Appearance" value={mode} onChange={e => saveMode(e.target.value)}><option value="auto">Auto · London</option><option value="light">Light</option><option value="dark">Dark</option></select></label>;
}
