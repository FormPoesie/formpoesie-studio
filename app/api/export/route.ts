import { env } from 'cloudflare:workers';
import { strToU8, zipSync } from 'fflate';
import { requireInventoryAdmin } from '@/lib/inventory-bridge';

export async function GET(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const productId = new URL(request.url).searchParams.get('id');
  if (!productId)
    return Response.json({ error: 'Produkt-ID fehlt.' }, { status: 400 });
  const product = await env.DB.prepare('SELECT * FROM products WHERE id = ?')
    .bind(productId)
    .first<Record<string, unknown>>();
  if (!product)
    return Response.json({ error: 'Produkt nicht gefunden.' }, { status: 404 });
  const variant = await env.DB.prepare(
    'SELECT * FROM variants WHERE product_id = ? ORDER BY created_at LIMIT 1',
  )
    .bind(productId)
    .first<Record<string, unknown>>();
  const draft = await env.DB.prepare(
    'SELECT * FROM listing_drafts WHERE product_id = ? ORDER BY updated_at DESC LIMIT 1',
  )
    .bind(productId)
    .first<Record<string, unknown>>();
  const contents = draft
    ? (
        await env.DB.prepare(
          'SELECT * FROM locale_contents WHERE draft_id = ? ORDER BY locale',
        )
          .bind(draft.id)
          .all()
      ).results
    : [];
  const plan = await env.DB.prepare(
    'SELECT roles_json FROM image_plans WHERE product_id = ? ORDER BY updated_at DESC LIMIT 1',
  )
    .bind(productId)
    .first<{ roles_json: string }>();
  const pricing = await env.DB.prepare(
    'SELECT * FROM pricing_scenarios WHERE product_id = ? ORDER BY updated_at DESC LIMIT 1',
  )
    .bind(productId)
    .first<Record<string, unknown>>();
  const assets = (
    await env.DB.prepare(
      'SELECT id, filename, object_key, content_type, view FROM original_assets WHERE product_id = ? ORDER BY created_at',
    )
      .bind(productId)
      .all<Record<string, unknown>>()
  ).results;
  const manifest = {
    exportedAt: new Date().toISOString(),
    product,
    variant,
    listing: contents.map((row: Record<string, unknown>) => ({
      ...row,
      titles_json: JSON.parse(String(row.titles_json)),
      tags_json: JSON.parse(String(row.tags_json)),
    })),
    imagePlan: plan ? JSON.parse(plan.roles_json) : [],
    pricing,
    originals: assets.map(
      ({ object_key: _hidden, ...asset }: Record<string, unknown>) => asset,
    ),
    etsyTransfer: {
      shop: '3DFormPoesie',
      status: 'not_connected',
      note: 'Lokaler Entwurf. Keine Veröffentlichung und keine externen Änderungen.',
    },
  };
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'README.txt': strToU8(
      'FormPoesie Listing Engine Export\n\nEnthält bestätigte Fakten, DE/EN-Listingtexte, Bildplan, Preisrechnung und Originalfotos. Prüfe offene Fakten vor der Übertragung zu Etsy.',
    ),
  };
  for (const asset of assets) {
    const object = await env.FILES.get(String(asset.object_key));
    if (object)
      files[
        'originale/' + String(asset.filename).replace(/[^a-zA-Z0-9._-]/g, '-')
      ] = new Uint8Array(await object.arrayBuffer());
  }
  const zip = zipSync(files, { level: 0 });
  const exportId = 'exp_' + crypto.randomUUID(),
    objectKey = 'exports/' + productId + '/' + exportId + '.zip';
  await env.FILES.put(objectKey, zip, {
    httpMetadata: { contentType: 'application/zip' },
  });
  const instant = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO export_records (id, product_id, format, object_key, manifest_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      exportId,
      productId,
      'application/zip',
      objectKey,
      JSON.stringify(manifest),
      instant,
      instant,
    )
    .run();
  const filename =
    'formpoesie-' +
    String(product.model_name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') +
    '-listing.zip';
  return new Response(zip.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
    },
  });
}
