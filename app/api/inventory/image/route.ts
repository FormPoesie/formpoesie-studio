import {
  INVENTORY_SUPABASE_URL,
  getInventoryUser,
  inventoryHeaders,
  readCookie,
} from '@/lib/inventory-bridge';

const bucket = 'bilder';
const maximumBytes = 12 * 1024 * 1024;

function encodeObjectPath(path: string) {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function cleanObjectPath(value: string) {
  return value.replace(/^\/+/, '').replace(/^bilder\//, '');
}

export async function GET(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  if (!accessToken)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const rawPath = new URL(request.url).searchParams.get('path') || '';
  if (/^https:\/\//i.test(rawPath)) {
    const url = new URL(rawPath);
    if (url.hostname !== new URL(INVENTORY_SUPABASE_URL).hostname)
      return Response.json(
        { error: 'Bildquelle ist nicht erlaubt.' },
        { status: 400 },
      );
    return Response.redirect(url.href, 302);
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
        apikey: inventoryHeaders(accessToken).apikey,
        Authorization: inventoryHeaders(accessToken).Authorization,
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

  const update = await fetch(
    `${INVENTORY_SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
    {
      method: 'PATCH',
      headers: {
        ...inventoryHeaders(accessToken),
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        image_uri: path,
        updated_by: user.id || null,
      }),
    },
  );
  if (!update.ok)
    return Response.json(
      { error: 'Bild wurde hochgeladen, aber nicht am Artikel hinterlegt.' },
      { status: 502 },
    );
  return Response.json({ uploaded: true, path }, { status: 201 });
}
