import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { runMarketIntelligence } from '../lib/market-intelligence-runner';

class TestStatement {
  values: unknown[] = [];
  constructor(
    private database: DatabaseSync,
    private sql: string,
  ) {}
  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }
  async run() {
    const result = this.database
      .prepare(this.sql)
      .run(...(this.values as SQLInputValue[]));
    return { success: true, meta: { changes: Number(result.changes) } };
  }
  async first<T>() {
    return (
      (this.database
        .prepare(this.sql)
        .get(...(this.values as SQLInputValue[])) as T) || null
    );
  }
  async all<T>() {
    return {
      success: true,
      results: this.database
        .prepare(this.sql)
        .all(...(this.values as SQLInputValue[])) as T[],
      meta: {},
    };
  }
}

function d1(database: DatabaseSync) {
  return {
    prepare(sql: string) {
      return new TestStatement(database, sql);
    },
    async batch(statements: TestStatement[]) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  } as unknown as D1Database;
}

function database() {
  const value = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    value.exec(
      readFileSync(`drizzle/${name}`, 'utf8').replaceAll(
        '--> statement-breakpoint',
        '',
      ),
    );
  }
  return value;
}

void test('weekly change stores snapshots and recalculates every variant for all channels without touching active prices', async (context) => {
  const sqlite = database();
  const env = {
    DB: d1(sqlite),
    INVENTORY_SUPABASE_SERVICE_ROLE_KEY: 'test-service-token',
    MARKET_SEARCH_ENDPOINT: 'https://search.test/search',
  };
  let marketPrice = 40;
  let catalogAvailable = true;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (
      url.hostname.endsWith('supabase.co') &&
      url.pathname.includes('/products')
    )
      return Response.json(
        catalogAvailable
          ? [
              {
                id: 'product-1',
                name: 'Nachtwächter Büste',
                category: 'Kunstbüste',
                updated_at: '2026-09-01T00:00:00.000Z',
                default_price_cents: 5900,
                variants: [
                  {
                    id: 'variant-small',
                    name: 'Klein',
                    height_mm: 180,
                    price_cents: 5900,
                    production_cost_cents: 1400,
                    material: { name: 'PLA' },
                  },
                  {
                    id: 'variant-large',
                    name: 'Groß',
                    height_mm: 260,
                    price_cents: 7900,
                    production_cost_cents: 2200,
                    material: { name: 'PLA' },
                  },
                ],
              },
            ]
          : [],
      );
    if (url.hostname.endsWith('supabase.co')) return Response.json([]);
    if (url.hostname === 'search.test')
      return Response.json({
        results: [
          {
            title: 'Nachtwächter Kunstbüste aus PLA',
            url: 'https://shop.test/listing/1',
          },
        ],
      });
    if (url.hostname === 'shop.test' && url.pathname === '/robots.txt')
      return new Response('User-agent: *\nAllow: /');
    if (url.hostname === 'shop.test')
      return new Response(
        `<script type="application/ld+json">${JSON.stringify({
          '@type': 'Product',
          name: 'Nachtwächter Kunstbüste aus PLA handgemacht',
          material: 'PLA',
          description: 'Physisches handgemachtes Produkt mit Versand.',
          offers: {
            '@type': 'Offer',
            price: marketPrice,
            priceCurrency: 'EUR',
            seller: { name: 'Vergleichsshop' },
          },
        })}</script>`,
        { headers: { 'Content-Type': 'text/html' } },
      );
    return new Response('not found', { status: 404 });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
    sqlite.close();
  });

  const baseline = await runMarketIntelligence(env, {
    now: new Date('2026-09-07T04:05:00.000Z'),
  });
  assert.equal(baseline.status, 'SUCCESS');
  assert.equal(
    sqlite
      .prepare(
        'SELECT trend_state FROM market_snapshots ORDER BY timestamp LIMIT 1',
      )
      .get()?.trend_state,
    'BASELINE',
  );

  sqlite.exec(`
    INSERT INTO etsy_workflows
      (id,inventory_product_id,product_snapshot_json,current_state,status,revision,created_at,updated_at)
    VALUES
      ('etsy-test','product-1','{}','VARIANT_PRICING','IN_PROGRESS',1,'2026-09-07','2026-09-07');
    INSERT INTO etsy_workflow_steps
      (id,workflow_id,state,status,result_json,user_edits_json,created_at,updated_at)
    VALUES
      ('step-price','etsy-test','VARIANT_PRICING','APPROVED','{}','{}','2026-09-07','2026-09-07'),
      ('step-keyword','etsy-test','KEYWORD_RESEARCH','APPROVED','{}','{}','2026-09-07','2026-09-07'),
      ('step-title','etsy-test','TITLE','APPROVED','{}','{}','2026-09-07','2026-09-07'),
      ('step-description','etsy-test','DESCRIPTION','APPROVED','{}','{}','2026-09-07','2026-09-07');
  `);

  marketPrice = 70;
  const update = await runMarketIntelligence(env, {
    now: new Date('2026-09-14T04:05:00.000Z'),
  });
  assert.equal(update.changes, 1);
  assert.equal(update.pricingImpacts, 10);
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS count FROM pricing_impacts WHERE status='REVIEW_REQUIRED'",
      )
      .get()?.count,
    10,
  );
  assert.deepEqual(
    sqlite
      .prepare('SELECT DISTINCT channel FROM pricing_impacts ORDER BY channel')
      .all()
      .map((row) => row.channel),
    ['direct', 'ebay', 'etsy', 'market', 'vinted'],
  );
  assert.equal(
    sqlite
      .prepare(
        'SELECT MAX(active_price_snapshot_cents) AS price FROM pricing_recommendations',
      )
      .get()?.price,
    7900,
  );
  assert.equal(
    sqlite
      .prepare("SELECT status FROM etsy_workflow_steps WHERE id='step-price'")
      .get()?.status,
    'NEEDS_REVIEW',
  );
  assert.equal(
    sqlite
      .prepare("SELECT status FROM etsy_workflow_steps WHERE id='step-keyword'")
      .get()?.status,
    'STALE_KEYWORDS',
  );
  assert.equal(
    sqlite
      .prepare("SELECT status FROM etsy_workflow_steps WHERE id='step-title'")
      .get()?.status,
    'NEEDS_REVIEW',
  );

  const snapshotCount = sqlite
    .prepare('SELECT COUNT(*) AS count FROM market_snapshots')
    .get()?.count;
  catalogAvailable = false;
  await assert.rejects(() => runMarketIntelligence(env), /keine Produkte/);
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) AS count FROM market_snapshots').get()
      ?.count,
    snapshotCount,
  );
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS count FROM market_research_runs WHERE status='RESEARCH_FAILED'",
      )
      .get()?.count,
    1,
  );
});
