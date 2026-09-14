import assert from 'node:assert/strict';
import test from 'node:test';
import { requestUrl, sessionCookie } from '../lib/inventory-bridge';

function requestLike(url: string, headers: Record<string, string> = {}) {
  return { url, headers: new Headers(headers) } as Request;
}

void test('Sitzungscookie funktioniert auch mit relativer Worker-Request-URL', () => {
  const request = requestLike('/api/inventory/session', {
    host: 'formpoesie-masterbrain.formpoesie.workers.dev',
    'x-forwarded-proto': 'https',
  });

  const cookie = sessionCookie(request, 'fp_inventory_access', 'a.b-c_d', 3600);

  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /; Secure$/);
  assert.equal(
    requestUrl(request).href,
    'https://formpoesie-masterbrain.formpoesie.workers.dev/api/inventory/session',
  );
});

void test('lokale HTTP-Sitzung bleibt ohne Secure-Attribut testbar', () => {
  const request = requestLike('http://localhost:3000/api/inventory/session');
  assert.doesNotMatch(
    sessionCookie(request, 'fp_inventory_access', 'token', 3600),
    /; Secure$/,
  );
});
