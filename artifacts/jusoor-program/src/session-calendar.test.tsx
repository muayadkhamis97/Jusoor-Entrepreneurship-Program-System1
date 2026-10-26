import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadArabicTranslations, translate } from './language';

await loadArabicTranslations();

const calendar = readFileSync(new URL('./session-calendar.tsx', import.meta.url), 'utf8');

test('session calendar controls have Arabic translations', () => {
  for (const label of [
    'Session calendar',
    'COHORT RHYTHM',
    'Previous month',
    'Next month',
    'Today',
    'session',
    'sessions',
    'No sessions',
    'Session scheduled',
    'Show all dates',
    'sessions in view',
  ]) {
    assert.notEqual(translate(label, 'ar'), label, `Missing Arabic translation: ${label}`);
  }
});

test('calendar dates, weekdays, and numerals follow the selected locale', () => {
  assert.match(calendar, /const \{ language \} = useAppLanguage\(\)/);
  assert.match(calendar, /language === 'ar' \? 'ar-JO' : 'en-GB'/);
  assert.match(calendar, /toLocaleDateString\(locale, \{ weekday: 'short' \}\)/);
  assert.match(calendar, /toLocaleDateString\(locale, \{ weekday: 'long', month: 'long', day: 'numeric' \}\)/);
  assert.match(calendar, /new Intl\.NumberFormat\(locale\)/);
  assert.doesNotMatch(calendar, /toLocaleDateString\('en'/);
});

test('calendar navigation and footer controls use translated labels', () => {
  assert.match(calendar, /aria-label=\{t\('Previous month'\)\}/);
  assert.match(calendar, /aria-label=\{t\('Next month'\)\}/);
  assert.match(calendar, /\{t\('Today'\)\}/);
  assert.match(calendar, /selectedDate \? t\('Show all dates'\)/);
  assert.match(calendar, /t\('Session scheduled'\)/);
});
