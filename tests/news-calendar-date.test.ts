import assert from 'node:assert/strict';
import test from 'node:test';
import {
  newsActivityDate,
  newsActivityInstant,
  newsCalendarDate,
  newsCalendarInstant,
} from '../lib/news-calendar-date';

void test('News werden am Ereignisdatum statt am Recherchetag eingeordnet', () => {
  const entry = {
    ereignisDatum: '2026-09-09',
    veroeffentlichungsDatum: '2026-09-10',
    erfasstAm: '2026-09-12',
  };

  assert.equal(newsCalendarDate(entry), '2026-09-09');
  assert.equal(newsCalendarInstant(entry), '2026-09-09T12:00:00.000Z');
});

void test('Das Veröffentlichungsdatum dient als Rückfallwert', () => {
  assert.equal(
    newsCalendarDate({ veroeffentlichungsDatum: '2026-09-10T08:15:00Z' }),
    '2026-09-10',
  );
});

void test('Der Tagesfeed verwendet den Erfassungstag', () => {
  const entry = {
    ereignisDatum: '2026-09-10',
    veroeffentlichungsDatum: '2026-09-10',
    erfasstAm: '2026-09-13',
  };

  assert.equal(newsActivityDate(entry), '2026-09-13');
  assert.equal(newsActivityInstant(entry), '2026-09-13T12:00:00.000Z');
});

void test('Der Tagesfeed fällt bei alten Einträgen auf das Kalenderdatum zurück', () => {
  assert.equal(newsActivityDate({ ereignisDatum: '2026-09-09' }), '2026-09-09');
});
