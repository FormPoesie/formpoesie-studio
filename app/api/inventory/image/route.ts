import {
  INVENTORY_SUPABASE_URL,
  getInventoryUser,
  inventoryHeaders,
  readCookie,
} from '@/lib/inventory-bridge';
import { env } from 'cloudflare:workers';

const bucket = 'bilder';
const maximumBytes = 12 * 1024 * 1024;

function encodeObjectPath(path: string) {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function cleanObjectPath(value: string) {
  return value.replace(/^\/+/, '').replace(/^bilder\//, '');
}

function inventoryWriteHeaders(accessToken: string) {
  const serviceKey = env.INVENTORY_SUPABASE_SERVICE_ROLE_KEY;
  const credential = serviceKey || accessToken;
  return {
    ...inventoryHeaders(credential),
    ...(serviceKey ? { apikey: serviceKey } : {}),
  };
}

export async function GET(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  if (!accessToken)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  let rawPath = new URL(request.url).searchParams.get('path') || '';
  if (/^https:\/\//i.test(rawPath)) {
    const url = new URL(rawPath);
    if (url.hostname !== new URL(INVENTORY_SUPABASE_URL).hostname)
      return Response.json(
        { error: 'Bildquelle ist nicht erlaubt.' },
        { status: 400 },
      );
    const marker = `/${bucket}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return Response.redirect(url.href, 302);
    // Alte signierte Supabase-Adressen laufen ab. Aus dem gespeicherten URL
    // wird deshalb immer der stabile Objektpfad extrahiert und neu signiert.
    rawPath = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  }
  const path = cleanObjectPath(rawPath);
  if (!path || path.includes('..'))
    return Response.json({ error: 'Bildpfad fehlt.' }, { status: 400 });
  const response = await fetch(
    `${INVENTORY_SUPABASE_URL}/storage/v1/object/sign/${bucket}/${encodeObjectPath(path)}`,
    {
      method: 'POST',
      headers: inventoryHeaders(accessToken),
      body: JSON.stringify({ expiresIn: 86400 }),
    },
  );
  const result = (await response.json().catch(() => null)) as {
    signedURL?: string;
    signedUrl?: string;
    message?: string;
  } | null;
  if (!response.ok)
    return Response.json(
      { error: result?.message || 'Bild konnte nicht geladen werden.' },
      { status: response.status },
    );
  const signedPath = result?.signedURL || result?.signedUrl;
  if (!signedPath)
    return Response.json(
      { error: 'Keine Bildadresse erhalten.' },
      { status: 502 },
    );
  return Response.redirect(
    signedPath.startsWith('http')
      ? signedPath
      : INVENTORY_SUPABASE_URL + '/storage/v1' + signedPath,
    302,
  );
}

export async function POST(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  const user = await getInventoryUser(request);
  if (!accessToken || !user)
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
  const upload = await fetch(
    `${INVENTORY_SUPABASE_URL}/storage/v1/object/${bucket}/${encodeObjectPath(path)}`,
    {
      method: 'POST',
      headers: {
        ...inventoryWriteHeaders(accessToken),
        'Content-Type': file.type,
        'x-upsert': 'false',
      },
      body: await file.arrayBuffer(),
    },
  );
  const uploadResult = (await upload.json().catch(() => null)) as {
    message?: string;
  } | null;
  if (!upload.ok)
    return Response.json(
      { error: uploadResult?.message || 'Bild-Upload fehlgeschlagen.' },
      { status: upload.status },
    );

  const targetTable = variantId ? 'product_variants' : 'products';
  const targetField = variantId ? 'image_url' : 'image_uri';
  const targetId = variantId || productId;
  const previousResponse = await fetch(
    `${INVENTORY_SUPABASE_URL}/rest/v1/${targetTable}?id=eq.${encodeURIComponent(targetId)}&select=${targetField}&limit=1`,
    { headers: inventoryHeaders(accessToken) },
  );
  const previousRows = (await previousResponse.json().catch(() => [])) as Array<
    Record<string, unknown>
  >;
  const previousPath =
    typeof previousRows[0]?.[targetField] === 'string'
      ? String(previousRows[0][targetField])
      : '';
  const update = await fetch(
    `${INVENTORY_SUPABASE_URL}/rest/v1/${targetTable}?id=eq.${encodeURIComponent(targetId)}`,
    {
      method: 'PATCH',
      headers: {
        ...inventoryWriteHeaders(accessToken),
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        [targetField]: path,
        ...(variantId ? {} : { updated_by: user.id || null }),
      }),
    },
  );
  if (!update.ok)
    return Response.json(
      { error: 'Bild wurde hochgeladen, aber nicht am Artikel hinterlegt.' },
      { status: 502 },
    );
  if (
    previousPath &&
    !/^https?:\/\//i.test(previousPath) &&
    previousPath !== path
  )
    await fetch(
      `${INVENTORY_SUPABASE_URL}/storage/v1/object/${bucket}/${encodeObjectPath(cleanObjectPath(previousPath))}`,
      {
        method: 'DELETE',
        headers: inventoryWriteHeaders(accessToken),
      },
    ).catch(() => null);
  return Response.json({ uploaded: true, path }, { status: 201 });
}

export async function DELETE(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  const user = await getInventoryUser(request);
  if (!accessToken || !user)
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
  const currentResponse = await fetch(
    `${INVENTORY_SUPABASE_URL}/rest/v1/${targetTable}?id=eq.${encodeURIComponent(targetId)}&select=${targetField}&limit=1`,
    { headers: inventoryHeaders(accessToken) },
  );
  const currentRows = (await currentResponse.json().catch(() => [])) as Array<
    Record<string, unknown>
  >;
  const currentPath =
    typeof currentRows[0]?.[targetField] === 'string'
      ? String(currentRows[0][targetField])
      : '';
  if (!currentResponse.ok || !currentRows.length)
    return Response.json(
      { error: 'Artikelbild nicht gefunden.' },
      { status: 404 },
    );
  const update = await fetch(
    `${INVENTORY_SUPABASE_URL}/rest/v1/${targetTable}?id=eq.${encodeURIComponent(targetId)}`,
    {
      method: 'PATCH',
      headers: {
        ...inventoryWriteHeaders(accessToken),
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        [targetField]: null,
        ...(variantId ? {} : { updated_by: user.id || null }),
      }),
    },
  );
  const updatedRows = (await update.json().catch(() => [])) as unknown;
  if (!update.ok)
    return Response.json(
      { error: 'Artikelbild nicht gelöscht.' },
      { status: 502 },
    );
  if (!Array.isArray(updatedRows) || updatedRows.length === 0)
    return Response.json(
      { error: 'Das gespeicherte Artikelbild konnte nicht zugeordnet werden.' },
      { status: 404 },
    );
  if (currentPath && !/^https?:\/\//i.test(currentPath))
    await fetch(
      `${INVENTORY_SUPABASE_URL}/storage/v1/object/${bucket}/${encodeObjectPath(cleanObjectPath(currentPath))}`,
      {
        method: 'DELETE',
        headers: inventoryWriteHeaders(accessToken),
      },
    ).catch(() => null);
  return Response.json({ deleted: true });
}
