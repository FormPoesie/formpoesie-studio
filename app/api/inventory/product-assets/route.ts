import { env } from 'cloudflare:workers';
import { getInventoryUser } from '@/lib/inventory-bridge';

type AssetRow = {
  id: string;
  productId: string;
  assetKind: string;
  objectKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  isPrimary: boolean | number;
};

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const printExtensions = new Set(['stl', '3mf', 'obj', 'zip']);
const maximumImageBytes = 20 * 1024 * 1024;
const maximumPrintBytes = 100 * 1024 * 1024;

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-140) || 'datei';
}

function extension(value: string) {
  return value.split('.').pop()?.toLowerCase() || '';
}

async function findAsset(id: string) {
  return env.DB.prepare(
    `SELECT id, product_id AS productId, asset_kind AS assetKind,
            object_key AS objectKey, filename, content_type AS contentType,
            size_bytes AS sizeBytes, is_primary AS isPrimary
     FROM inventory_product_assets WHERE id = ?`,
  )
    .bind(id)
    .first<AssetRow>();
}

export async function GET(request: Request) {
  const user = await getInventoryUser(request);
  if (!user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const assetId = new URL(request.url).searchParams.get('id') || '';
  if (!assetId)
    return Response.json({ error: 'Datei-ID fehlt.' }, { status: 400 });
  const asset = await findAsset(assetId);
  if (!asset)
    return Response.json({ error: 'Datei nicht gefunden.' }, { status: 404 });
  const object = await env.FILES.get(asset.objectKey);
  if (!object)
    return Response.json(
      { error: 'Gespeicherte Datei fehlt.' },
      { status: 404 },
    );
  const disposition =
    asset.assetKind === 'image'
      ? 'inline'
      : `attachment; filename="${safeFilename(asset.filename)}"`;
  return new Response(object.body, {
    headers: {
      'Content-Type': asset.contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function POST(request: Request) {
  const user = await getInventoryUser(request);
  if (!user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const form = await request.formData();
  const file = form.get('file');
  const productIdValue = form.get('productId');
  const kindValue = form.get('kind');
  const primaryValue = form.get('isPrimary');
  const productId =
    typeof productIdValue === 'string' ? productIdValue.trim() : '';
  const kind = kindValue === 'print' ? 'print' : 'image';
  if (!(file instanceof File) || !productId)
    return Response.json(
      { error: 'Datei und Artikel fehlen.' },
      { status: 400 },
    );
  if (kind === 'image' && !imageTypes.has(file.type))
    return Response.json(
      { error: 'Erlaubt sind JPEG, PNG und WebP.' },
      { status: 415 },
    );
  if (kind === 'print' && !printExtensions.has(extension(file.name)))
    return Response.json(
      { error: 'Erlaubt sind STL, 3MF, OBJ und ZIP.' },
      { status: 415 },
    );
  const maximumBytes = kind === 'image' ? maximumImageBytes : maximumPrintBytes;
  if (file.size > maximumBytes)
    return Response.json(
      {
        error:
          kind === 'image'
            ? 'Das Bild darf höchstens 20 MB groß sein.'
            : 'Die Druckdatei darf höchstens 100 MB groß sein.',
      },
      { status: 413 },
    );

  const id = 'ipa_' + crypto.randomUUID();
  const objectKey = `inventory-products/${productId}/${kind}/${id}/${safeFilename(file.name)}`;
  await env.FILES.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
    },
  });
  const now = new Date().toISOString();
  try {
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM inventory_product_assets
       WHERE product_id = ? AND asset_kind = 'image'`,
    )
      .bind(productId)
      .first<{ count: number }>();
    const isPrimary =
      kind === 'image' &&
      (primaryValue === 'true' || Number(count?.count || 0) === 0);
    const inserts = [];
    if (isPrimary) {
      inserts.push(
        env.DB.prepare(
          `UPDATE inventory_product_assets SET is_primary = 0, updated_at = ?
           WHERE product_id = ? AND asset_kind = 'image'`,
        ).bind(now, productId),
      );
    }
    inserts.push(
      env.DB.prepare(
        `INSERT INTO inventory_product_assets
           (id, product_id, asset_kind, object_key, filename, content_type,
            size_bytes, is_primary, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        productId,
        kind,
        objectKey,
        file.name,
        file.type || 'application/octet-stream',
        file.size,
        isPrimary ? 1 : 0,
        user.id || null,
        now,
        now,
      ),
    );
    await env.DB.batch(inserts);
    return Response.json(
      {
        uploaded: true,
        asset: {
          id,
          productId,
          assetKind: kind,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          isPrimary,
          url: '/api/inventory/product-assets?id=' + encodeURIComponent(id),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    await env.FILES.delete(objectKey);
    throw error;
  }
}

export async function PATCH(request: Request) {
  const user = await getInventoryUser(request);
  if (!user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const body = (await request.json()) as { id?: string; isPrimary?: boolean };
  if (!body.id || body.isPrimary !== true)
    return Response.json({ error: 'Aktion fehlt.' }, { status: 400 });
  const asset = await findAsset(body.id);
  if (!asset || asset.assetKind !== 'image')
    return Response.json({ error: 'Bild nicht gefunden.' }, { status: 404 });
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE inventory_product_assets SET is_primary = 0, updated_at = ?
       WHERE product_id = ? AND asset_kind = 'image'`,
    ).bind(now, asset.productId),
    env.DB.prepare(
      `UPDATE inventory_product_assets SET is_primary = 1, updated_at = ?
       WHERE id = ?`,
    ).bind(now, asset.id),
  ]);
  return Response.json({ saved: true });
}

export async function DELETE(request: Request) {
  const user = await getInventoryUser(request);
  if (!user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const body = (await request.json()) as { id?: string };
  if (!body.id)
    return Response.json({ error: 'Datei-ID fehlt.' }, { status: 400 });
  const asset = await findAsset(body.id);
  if (!asset)
    return Response.json({ error: 'Datei nicht gefunden.' }, { status: 404 });
  await env.DB.prepare('DELETE FROM inventory_product_assets WHERE id = ?')
    .bind(asset.id)
    .run();
  await env.FILES.delete(asset.objectKey);
  if (asset.assetKind === 'image' && Boolean(asset.isPrimary)) {
    const next = await env.DB.prepare(
      `SELECT id FROM inventory_product_assets
       WHERE product_id = ? AND asset_kind = 'image'
       ORDER BY created_at ASC LIMIT 1`,
    )
      .bind(asset.productId)
      .first<{ id: string }>();
    if (next)
      await env.DB.prepare(
        'UPDATE inventory_product_assets SET is_primary = 1 WHERE id = ?',
      )
        .bind(next.id)
        .run();
  }
  return Response.json({ deleted: true });
}
