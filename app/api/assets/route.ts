import { env } from 'cloudflare:workers';
import { requireInventoryAdmin } from '@/lib/inventory-bridge';

const allowed = new Set(['image/jpeg', 'image/png']);

export async function POST(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const file = form.get('file');
    const productValue = form.get('productId'),
      viewValue = form.get('view');
    const productId = typeof productValue === 'string' ? productValue : '';
    const view = typeof viewValue === 'string' ? viewValue : 'unknown';
    if (!(file instanceof File) || !productId)
      return Response.json(
        { error: 'Datei und Produkt fehlen.' },
        { status: 400 },
      );
    if (!allowed.has(file.type))
      return Response.json(
        { error: 'Nur JPEG und PNG sind für Etsy-Exporte zugelassen.' },
        { status: 415 },
      );
    if (file.size > 20 * 1024 * 1024)
      return Response.json(
        { error: 'Die Datei ist größer als 20 MB.' },
        { status: 413 },
      );
    const assetId = 'ast_' + crypto.randomUUID();
    const safeName =
      file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120) || 'upload';
    const key = 'originals/' + productId + '/' + assetId + '/' + safeName;
    await env.FILES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    const instant = new Date().toISOString();
    await env.DB.prepare(
      'INSERT INTO original_assets (id, product_id, object_key, filename, content_type, view, quality_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        assetId,
        productId,
        key,
        file.name,
        file.type,
        view,
        'uploaded',
        instant,
        instant,
      )
      .run();
    return Response.json(
      {
        id: assetId,
        filename: file.name,
        view,
        url: '/api/assets?id=' + encodeURIComponent(assetId),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('asset upload failed', error);
    return Response.json(
      {
        error:
          'Das Bild konnte nicht gespeichert werden. Bitte erneut versuchen.',
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const assetId = new URL(request.url).searchParams.get('id');
  if (!assetId) return Response.json({ error: 'ID fehlt.' }, { status: 400 });
  const asset = await env.DB.prepare(
    'SELECT object_key, content_type, filename FROM original_assets WHERE id = ?',
  )
    .bind(assetId)
    .first<{ object_key: string; content_type: string; filename: string }>();
  if (!asset)
    return Response.json({ error: 'Bild nicht gefunden.' }, { status: 404 });
  const object = await env.FILES.get(asset.object_key);
  if (!object)
    return Response.json({ error: 'Bilddatei fehlt.' }, { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': asset.content_type,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
