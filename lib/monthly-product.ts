import { env } from 'cloudflare:workers';
import { offlineQuery } from '@/lib/offline-inventory';

type Row = Record<string, unknown>;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallback;
}

function number(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function source(accessToken: string, path: string) {
  void accessToken;
  const [table, params = ''] = path.split('?');
  return offlineQuery(table, params);
}

function currentMonth() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}

function monthTitle(month: string) {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    month: 'long',
    year: 'numeric',
  }).format(new Date(month + '-01T12:00:00Z'));
}

function publicationInstant(month: string) {
  const date = new Date(month + '-01T08:00:00.000Z');
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

export async function rebuildMonthlyProductHighlights(accessToken: string) {
  const [marketValue, onlineValue, productValue] = await Promise.all([
    source(
      accessToken,
      'sales?select=' +
        encodeURIComponent(
          'id,date,is_cancelled,items:sale_items(quantity,article_variant:article_variants!sale_items_article_variant_id_fkey(id,article:articles(id,name,product_id)))',
        ) +
        '&deleted_at=is.null',
    ),
    source(
      accessToken,
      'online_sales?select=id,date,quantity,article_name,product_id&deleted_at=is.null',
    ),
    source(accessToken, 'products?select=id,name&deleted_at=is.null'),
  ]);
  const productNames = new Map(
    rows(productValue).map((product) => [
      text(product.id),
      text(product.name, 'Unbenannter Artikel'),
    ]),
  );
  const byMonth = new Map<
    string,
    {
      total: number;
      transactions: Set<string>;
      products: Map<
        string,
        { name: string; quantity: number; productId?: string }
      >;
    }
  >();
  const add = (
    month: string,
    transaction: string,
    key: string,
    name: string,
    quantity: number,
    productId?: string,
  ) => {
    if (!month || month >= currentMonth() || quantity <= 0) return;
    const bucket = byMonth.get(month) || {
      total: 0,
      transactions: new Set<string>(),
      products: new Map(),
    };
    const product = bucket.products.get(key) || {
      name,
      quantity: 0,
      productId,
    };
    product.quantity += quantity;
    if (!product.name && name) product.name = name;
    if (!product.productId && productId) product.productId = productId;
    bucket.products.set(key, product);
    bucket.transactions.add(transaction);
    bucket.total += quantity;
    byMonth.set(month, bucket);
  };

  for (const sale of rows(marketValue)) {
    if (sale.is_cancelled === true) continue;
    const month = text(sale.date).slice(0, 7);
    for (const item of rows(sale.items)) {
      const variant = (item.article_variant || {}) as Row;
      const article = (variant.article || {}) as Row;
      const productId = text(article.product_id);
      const key = productId
        ? 'product:' + productId
        : 'article:' + text(article.id || variant.id);
      add(
        month,
        'market:' + text(sale.id),
        key,
        productNames.get(productId) ||
          text(article.name, 'Unbenannter Artikel'),
        number(item.quantity),
        productId || undefined,
      );
    }
  }
  for (const sale of rows(onlineValue)) {
    const name = text(sale.article_name, 'Unbenannter Artikel');
    const productId = text(sale.product_id);
    add(
      text(sale.date).slice(0, 7),
      'online:' + text(sale.id),
      productId
        ? 'product:' + productId
        : 'online-name:' + name.toLocaleLowerCase('de'),
      productNames.get(productId) || name,
      Math.max(0, number(sale.quantity, 1)),
      productId || undefined,
    );
  }

  const instant = new Date().toISOString();
  const highlights = [...byMonth.entries()].flatMap(([month, bucket]) => {
    const winner = [...bucket.products.entries()].sort(
      (a, b) =>
        b[1].quantity - a[1].quantity ||
        a[1].name.localeCompare(b[1].name, 'de'),
    )[0];
    if (!winner) return [];
    return [
      {
        month,
        productKey: winner[0],
        productName: winner[1].name,
        productId: winner[1].productId || null,
        productQuantity: winner[1].quantity,
        totalQuantity: bucket.total,
        transactionCount: bucket.transactions.size,
      },
    ];
  });

  for (const item of highlights) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO monthly_product_highlights
          (month, product_key, product_name, product_quantity, total_quantity,
           calculated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(month) DO UPDATE SET
           product_key=excluded.product_key,
           product_name=excluded.product_name,
           product_quantity=excluded.product_quantity,
           total_quantity=excluded.total_quantity,
           calculated_at=excluded.calculated_at,
           updated_at=excluded.updated_at`,
      ).bind(
        item.month,
        item.productKey,
        item.productName,
        item.productQuantity,
        item.totalQuantity,
        instant,
        instant,
        instant,
      ),
      env.DB.prepare(
        `INSERT INTO activity_events
          (id, kind, title, detail, source_url, occurred_at, payload_json)
         VALUES (?, 'model-of-month', ?, ?, NULL, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, detail=excluded.detail,
           payload_json=excluded.payload_json`,
      ).bind(
        'model-of-month-' + item.month,
        `Modell des Monats · ${monthTitle(item.month)}`,
        `${item.productName}: ${item.productQuantity} verkaufte Artikel von ${item.totalQuantity} insgesamt`,
        publicationInstant(item.month),
        JSON.stringify(item),
      ),
    ]);
  }
  return highlights.sort((a, b) => b.month.localeCompare(a.month));
}
