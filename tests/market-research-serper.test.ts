import assert from 'node:assert/strict';
import test from 'node:test';
import { researchQuery } from '../lib/market-research';
import {
  scoreComparability,
  type PortfolioProduct,
} from '../lib/market-intelligence';

void test('Serper Shopping liefert sichtbare EUR-Preise ohne zusätzliche Shop-Abfrage', async (context) => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    requests += 1;
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    assert.ok(
      url === 'https://google.serper.dev/shopping' ||
        url === 'https://google.serper.dev/search',
    );
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('X-API-KEY'), 'test-key');
    return url.endsWith('/shopping')
      ? Response.json({
          shopping: [
            {
              title: 'Monstera Blatt Beutelclip 3D Druck',
              link: 'https://www.etsy.com/de/listing/123/monstera-clip',
              price: '3,90 €',
              source: 'Etsy',
            },
          ],
        })
      : Response.json({ organic: [] });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await researchQuery('Monstera Beutelclip', 8, {
    SERPER_API_KEY: 'test-key',
  });
  assert.equal(requests, 2);
  assert.equal(result.attempts[0].source, 'serper');
  assert.equal(result.candidates[0].visibleCustomerPriceCents, 390);
  assert.equal(result.candidates[0].currency, 'EUR');
});

void test('Serper-Snippets liefern Motiv und Setgröße für die Vergleichbarkeit', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.endsWith('/shopping')) return Response.json({ shopping: [] });
    return Response.json({
      organic: [
        {
          title: 'Halloween 3D Drucke - Etsy.de',
          link: 'https://www.etsy.com/de/market/halloween_geister',
          snippet:
            '3D gedruckte Halloween Geister – 3er Set mit LED Teelichthalter. 19,90 €.',
        },
      ],
    });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const result = await researchQuery('Geister Teelichthalter', 8, {
    SERPER_API_KEY: 'test-key',
  });
  const product: PortfolioProduct = {
    id: 'ghosts',
    name: '3er Geister Trio Teelichthalter',
    productType: 'Teelichthalter',
    category: 'Halloween',
    physicalOrDigital: 'physical',
    variants: [{ id: 'set', setSize: 3 }],
  };
  assert.equal(result.candidates[0].bundleSize, 3);
  assert.ok(scoreComparability(product, result.candidates[0]) >= 0.56);
});

void test('nur belegte 3D-Druck-Angebote gelten als physische Vergleichsartikel', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return url.endsWith('/shopping')
      ? Response.json({
          shopping: [
            {
              title: '3er Set Geister Teelichthalter 3D gedruckt aus PLA',
              link: 'https://shop.example/geister-set',
              price: '14,90 €',
            },
          ],
        })
      : Response.json({ organic: [] });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const result = await researchQuery('Geister Teelichthalter kaufen', 5, {
    SERPER_API_KEY: 'test-key',
  });
  assert.equal(result.candidates[0]?.physicalOrDigital, 'physical');
});

void test('andere physische Herstellungsarten werden nicht als 3D-Druck gewertet', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return url.endsWith('/shopping')
      ? Response.json({ shopping: [{ title: 'Keramik Geister Teelichthalter handgemacht', link: 'https://shop.example/keramik-geister', price: '79,00 €' }] })
      : Response.json({ organic: [] });
  };
  context.after(() => { globalThis.fetch = originalFetch; });
  const result = await researchQuery('Geister Teelichthalter', 5, { SERPER_API_KEY: 'test-key' });
  assert.equal(result.candidates[0]?.physicalOrDigital, 'unknown');
});

void test('Setgröße wird aus dem Titel erkannt', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return url.endsWith('/shopping')
      ? Response.json({ shopping: [{ title: '3er-Set Geister 3D Druck', link: 'https://shop.example/geister', price: '15,00 €' }] })
      : Response.json({ organic: [] });
  };
  context.after(() => { globalThis.fetch = originalFetch; });
  const result = await researchQuery('Geister 3D Druck', 5, { SERPER_API_KEY: 'test-key' });
  assert.equal(result.candidates[0]?.bundleSize, 3);
});

void test('digitale 3D-Dateien bleiben trotz 3D-Druck-Begriff ausgeschlossen', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return url.endsWith('/shopping')
      ? Response.json({ shopping: [{ title: '3D Print Ghost Set – Digital Files', link: 'https://etsy.example/ghost-files', price: '3,50 €' }] })
      : Response.json({ organic: [] });
  };
  context.after(() => { globalThis.fetch = originalFetch; });
  const result = await researchQuery('Geister 3D Druck', 5, { SERPER_API_KEY: 'test-key' });
  assert.equal(result.candidates[0]?.physicalOrDigital, 'digital');
});
