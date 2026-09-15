import {
  getInventoryUser,
} from '@/lib/inventory-bridge';
import { env } from 'cloudflare:workers';
import { offlineMutate, offlineQuery } from '@/lib/offline-inventory';

const bucket = 'bilder';
const maximumBytes = 12 * 1024 * 1024;

function cleanObjectPath(value: string) {
  return value.replace(/^\/+/, '').replace(/^bilder\//, '');
}

export async function GET(request: Request) {
  const user = await getInventoryUser(request);
  if (!user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const rawPath = new URL(request.url).searchParams.get('path') || '';
  const path = cleanObjectPath(rawPath);
  if (!path || path.includes('..') || /^(?:https?:|file:)/i.test(path))
    return Response.json({ error: 'Bildpfad fehlt.' }, { status: 400 });
  const object = await env.FILES.get(`${bucket}/${path}`);
  if (!object) return Response.json({ error: 'Bilddatei fehlt.' }, { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ||
        (path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg'),
      'Cache-Control': 'private, max-age=86400',
    },
  });
}

export async function POST(request: Request) {
  const user = await getInventoryUser(request);
  if (!user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const form = await request.formData();
  const file = form.get('file');
  const rawProductId = form.get('productId');
  const productId = typeof rawProductId === 'string' ? rawProductId : '';
  const rawVariantId = form.get('variantId');
  const variantId = typeof rawVariantId === 'string' ? rawVariantId : '';
  if (!(file instanceof File) || !productId)
    return Response.json(
      { error: 'Bild und Artikel fehlen.' },
      { status: 400 },
    );
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    return Response.json(
      { error: 'Erlaubt sind JPEG, PNG und WebP.' },
      { status: 400 },
    );
  if (file.size > maximumBytes)
    return Response.json(
      { error: 'Das Bild darf höchstens 12 MB groß sein.' },
      { status: 400 },
    );

  const extension =
    file.type === 'image/png'
      ? 'png'
      : file.type === 'image/webp'
        ? 'webp'
        : 'jpg';
  const path = `produkte/${productId}/${crypto.randomUUID()}.${extension}`;
  await env.FILES.put(`${bucket}/${path}`, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const targetTable = variantId ? 'product_variants' : 'products';
  const targetField = variantId ? 'image_url' : 'image_uri';
  const targetId = variantId || productId;
  const previousRows = await offlineQuery(targetTable, `id=eq.${encodeURIComponent(targetId)}&limit=1`);
  const previousPath =
    typeof previousRows[0]?.[targetField] === 'string'
      ? String(previousRows[0][targetField])
      : '';
  await offlineMutate(`${targetTable}?id=eq.${encodeURIComponent(targetId)}`, 'PATCH', {
    [targetField]: path,
    ...(variantId ? {} : { updated_by: user.id || null }),
  });
  if (
    previousPath &&
    !/^https?:\/\//i.test(previousPath) &&
    previousPath !== path
  )
    await env.FILES.delete(`${bucket}/${cleanObjectPath(previousPath)}`).catch(() => null);
  return Response.json({ uploaded: true, path }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getInventoryUser(request);
  if (!user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    productId?: string | number;
    variantId?: string | number;
  };
  const productId = String(body.productId || '').trim();
  const variantId = String(body.variantId || '').trim();
  if (!productId)
    return Response.json({ error: 'Artikel-ID fehlt.' }, { status: 400 });
  const targetTable = variantId ? 'product_variants' : 'products';
  const targetField = variantId ? 'image_url' : 'image_uri';
  const targetId = variantId || productId;
  const currentRows = await offlineQuery(targetTable, `id=eq.${encodeURIComponent(targetId)}&limit=1`);
  const currentPath =
    typeof currentRows[0]?.[targetField] === 'string'
      ? String(currentRows[0][targetField])
      : '';
  if (!currentRows.length)
    return Response.json(
      { error: 'Artikelbild nicht gefunden.' },
      { status: 404 },
    );
  const updatedRows = await offlineMutate(`${targetTable}?id=eq.${encodeURIComponent(targetId)}`, 'PATCH', {
    [targetField]: null,
    ...(variantId ? {} : { updated_by: user.id || null }),
  });
  if (!updatedRows.length)
    return Response.json(
      { error: 'Das gespeicherte Artikelbild konnte nicht zugeordnet werden.' },
      { status: 404 },
    );
  if (currentPath && !/^https?:\/\//i.test(currentPath))
    await env.FILES.delete(`${bucket}/${cleanObjectPath(currentPath)}`).catch(() => null);
  return Response.json({ deleted: true });
}
