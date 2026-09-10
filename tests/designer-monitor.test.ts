import assert from 'node:assert/strict';
import test from 'node:test';
import { makerWorldSignal } from '../lib/designer-monitor';

void test('MakerWorld-Profile werden über die öffentliche Daten-API geprüft', async () => {
  const requested: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : input;
    requested.push(url);
    if (url.includes('/search-service/search/user')) {
      return Response.json({
        hits: [{ uid: 1248888468, name: 'Collecticraft' }],
      });
    }
    return Response.json({
      hits: [
        { id: 20, title: 'Neues Modell', createTime: '2026-09-10' },
        { id: 10, title: 'Älteres Modell', createTime: '2026-09-09' },
      ],
    });
  }) as typeof fetch;

  const result = await makerWorldSignal(
    'https://makerworld.com/de/@Collecticraft',
    fetcher,
  );

  assert.equal(result.signal, '10\n20');
  assert.equal(result.headline, 'Neues Modell');
  assert.match(requested[0], /keyword=Collecticraft/);
  assert.match(
    requested[1],
    /publisheddesigns\/1248888468\?type=3D&offset=0&limit=50/,
  );
});

void test('MakerWorld meldet einen nicht vorhandenen exakten Profilnamen', async () => {
  const fetcher = (async () =>
    Response.json({ hits: [{ uid: 1, name: 'Collecticraft Fan' }] })) as typeof fetch;

  await assert.rejects(
    makerWorldSignal('https://makerworld.com/@Collecticraft', fetcher),
    /wurde nicht gefunden/,
  );
});
