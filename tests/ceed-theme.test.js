import { test } from 'node:test';
import assert from 'node:assert/strict';
import { londonSunTimes, resolveTheme, themeDelay } from '../src/ceed/ceed-theme.mjs';
test('London auto theme switches at actual sunrise and sunset, not a fixed hour', () => {
  const { sunrise, sunset } = londonSunTimes(new Date('2026-10-25T12:00:00Z'));
  assert.equal(resolveTheme('auto', new Date(sunrise.getTime() - 1)), 'dark');
  assert.equal(resolveTheme('auto', sunrise), 'light');
  assert.equal(resolveTheme('auto', new Date(sunset.getTime() - 1)), 'light');
  assert.equal(resolveTheme('auto', sunset), 'dark');
  assert.ok(themeDelay(new Date(sunset.getTime() - 1000)) < 2000);
});
test('London daylight changes seasonally and works through British Summer Time', () => {
  const summer = londonSunTimes(new Date('2026-06-21T12:00:00Z'));
  const winter = londonSunTimes(new Date('2026-12-21T12:00:00Z'));
  assert.ok(summer.sunset - summer.sunrise > winter.sunset - winter.sunrise);
  for (const date of ['2026-03-29T12:00:00Z', '2026-10-25T12:00:00Z', '2026-12-21T12:00:00Z']) assert.equal(resolveTheme('auto', new Date(date)), 'light');
  assert.equal(resolveTheme('auto', new Date('2026-10-25T23:59:59Z')), 'dark');
});
test('manual choices override daylight until Auto is selected again', () => {
  assert.equal(resolveTheme('light', new Date('2026-10-25T23:00:00Z')), 'light');
  assert.equal(resolveTheme('dark', new Date('2026-06-21T12:00:00Z')), 'dark');
  assert.equal(resolveTheme('auto', new Date('2026-06-21T12:00:00Z')), 'light');
});
