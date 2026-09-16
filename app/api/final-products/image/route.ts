import { env } from 'cloudflare:workers';

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  const asset = await env.DB.prepare(
    `SELECT object_key AS objectKey, content_type AS contentType
     FROM inventory_product_assets
     WHERE id = ? AND asset_kind = 'image'`,
  )
    .bind(id)
    .first<{ objectKey: string; contentType: string }>();
  if (!asset)
    return Response.json({ error: 'Bild nicht gefunden.' }, { status: 404 });
  const object = await env.FILES.get(asset.objectKey);
  if (!object)
    return Response.json({ error: 'Bilddatei fehlt.' }, { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': asset.contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
