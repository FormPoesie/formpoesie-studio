type MigrationEnv = {
  DB: D1Database;
  FILES: R2Bucket;
  INVENTORY_SUPABASE_SERVICE_ROLE_KEY?: string;
};

type Row = Record<string, unknown>;

const sourceUrl = 'https://udxxqdycgfaordrrfibu.supabase.co';
const bucket = 'bilder';

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function objectPath(value: string) {
  if (!/^https:\/\//i.test(value))
    return value.replace(/^\/+/, '').replace(/^bilder\//, '');
  const url = new URL(value);
  const marker = `/${bucket}/`;
  const index = url.pathname.indexOf(marker);
  return index < 0
    ? ''
    : decodeURIComponent(url.pathname.slice(index + marker.length));
}

async function stableId(productId: string, path: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${productId}\0${path}`),
  );
  return (
    'ipa_migrated_' +
    [...new Uint8Array(digest)]
      .slice(0, 12)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  );
}

function extension(path: string, contentType: string) {
  const match = path.match(/\.([a-z0-9]{2,5})(?:$|\?)/i);
  if (match) return match[1].toLowerCase();
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}

async function snapshot(env: MigrationEnv, table: string) {
  const record = await env.DB.prepare(
    'SELECT rows_json FROM inventory_snapshots WHERE table_name = ?',
  )
    .bind(table)
    .first<{ rows_json: string }>();
  try {
    const parsed = JSON.parse(record?.rows_json || '[]');
    return Array.isArray(parsed) ? (parsed as Row[]) : [];
  } catch {
    return [];
  }
}

export async function migrateLegacyInventoryImages(
  env: MigrationEnv,
  limit = 50,
) {
  const serviceKey = env.INVENTORY_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { migrated: 0, remaining: 0, skipped: true };
  const [products, variants] = await Promise.all([
    snapshot(env, 'products'),
    snapshot(env, 'product_variants'),
  ]);
  const candidates = [
    ...products.map((row) => ({ row, field: 'image_uri', productId: text(row.id) })),
    ...variants.map((row) => ({
      row,
      field: 'image_url',
      productId: text(row.product_id || row.productId),
    })),
  ].filter(
    (item) =>
      item.productId &&
      text(item.row[item.field]) &&
      !text(item.row[item.field]).startsWith('/api/'),
  );
  let migrated = 0;
  for (const candidate of candidates.slice(0, limit)) {
    const path = objectPath(text(candidate.row[candidate.field]));
    if (!path) continue;
    const id = await stableId(candidate.productId, path);
    const existing = await env.DB.prepare(
      'SELECT id FROM inventory_product_assets WHERE id = ?',
    )
      .bind(id)
      .first<{ id: string }>();
    if (!existing) {
      const response = await fetch(
        `${sourceUrl}/storage/v1/object/authenticated/${bucket}/${path
          .split('/')
          .filter(Boolean)
          .map(encodeURIComponent)
          .join('/')}`,
        {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        },
      );
      if (!response.ok || !response.body) continue;
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const filename = `${id}.${extension(path, contentType)}`;
      const objectKey = `inventory-products/${candidate.productId}/image/${id}/${filename}`;
      const bytes = await response.arrayBuffer();
      await env.FILES.put(objectKey, bytes, { httpMetadata: { contentType } });
      const now = new Date().toISOString();
      const primaryCount = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM inventory_product_assets
         WHERE product_id = ? AND asset_kind = 'image' AND is_primary = 1`,
      )
        .bind(candidate.productId)
        .first<{ count: number }>();
      await env.DB.prepare(
        `INSERT OR IGNORE INTO inventory_product_assets
         (id, product_id, asset_kind, object_key, filename, content_type,
          size_bytes, is_primary, created_by, created_at, updated_at)
         VALUES (?, ?, 'image', ?, ?, ?, ?, ?, 'supabase-migration', ?, ?)`,
      )
        .bind(
          id,
          candidate.productId,
          objectKey,
          filename,
          contentType,
          bytes.byteLength,
          Number(primaryCount?.count || 0) === 0 ? 1 : 0,
          now,
          now,
        )
        .run();
    }
    candidate.row[candidate.field] =
      '/api/inventory/product-assets?id=' + encodeURIComponent(id);
    migrated += 1;
  }
  if (migrated) {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE inventory_snapshots SET rows_json = ?, updated_at = ?
         WHERE table_name = 'products'`,
      ).bind(JSON.stringify(products), now),
      env.DB.prepare(
        `UPDATE inventory_snapshots SET rows_json = ?, updated_at = ?
         WHERE table_name = 'product_variants'`,
      ).bind(JSON.stringify(variants), now),
    ]);
  }
  return { migrated, remaining: Math.max(0, candidates.length - migrated) };
}
