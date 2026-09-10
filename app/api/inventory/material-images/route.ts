import { env } from 'cloudflare:workers';
import { getInventoryUser } from '@/lib/inventory-bridge';

type ImageRow = {
  id: string;
  relationId: string | null;
  objectKey: string;
  filename: string;
  contentType: string;
};

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maximumBytes = 20 * 1024 * 1024;

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-140) || 'materialbild';
}

async function findImage(id: string) {
  return env.DB.prepare(
    `SELECT id, relation_id AS relationId, object_key AS objectKey,
            filename, content_type AS contentType
     FROM business_documents
     WHERE id = ? AND relation_type = 'material' AND document_kind = 'image'`,
  )
    .bind(id)
    .first<ImageRow>();
}

export async function GET(request: Request) {
  const user = await getInventoryUser(request);
  if (!user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) return Response.json({ error: 'Bild-ID fehlt.' }, { status: 400 });
  const image = await findImage(id);
  if (!image)
    return Response.json({ error: 'Bild nicht gefunden.' }, { status: 404 });
  const object = await env.FILES.get(image.objectKey);
  if (!object)
    return Response.json({ error: 'Bilddatei fehlt.' }, { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': image.contentType,
      'Content-Disposition': `inline; filename="${safeFilename(image.filename)}"`,
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
  const value = form.get('materialId');
  const materialId = typeof value === 'string' ? value.trim() : '';
  if (!(file instanceof File) || !materialId)
    return Response.json(
      { error: 'Bild und Material fehlen.' },
      { status: 400 },
    );
  if (!imageTypes.has(file.type))
    return Response.json(
      { error: 'Erlaubt sind JPEG, PNG und WebP.' },
      { status: 415 },
    );
  if (file.size > maximumBytes)
    return Response.json(
      { error: 'Das Bild darf höchstens 20 MB groß sein.' },
      { status: 413 },
    );

  const id = 'mimg_' + crypto.randomUUID();
  const objectKey = `business-documents/materials/${materialId}/${id}/${safeFilename(file.name)}`;
  await env.FILES.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO business_documents
         (id, relation_type, relation_id, document_kind, title, object_key,
          filename, content_type, size_bytes, created_by, created_at, updated_at)
       VALUES (?, 'material', ?, 'image', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        materialId,
        file.name,
        objectKey,
        file.name,
        file.type,
        file.size,
        user.id || null,
        now,
        now,
      )
      .run();
  } catch (error) {
    await env.FILES.delete(objectKey);
    throw error;
  }
  return Response.json({ uploaded: true, id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getInventoryUser(request);
  if (!user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const body = (await request.json()) as { id?: string };
  if (!body.id)
    return Response.json({ error: 'Bild-ID fehlt.' }, { status: 400 });
  const image = await findImage(body.id);
  if (!image)
    return Response.json({ error: 'Bild nicht gefunden.' }, { status: 404 });
  await env.DB.prepare('DELETE FROM business_documents WHERE id = ?')
    .bind(image.id)
    .run();
  await env.FILES.delete(image.objectKey);
  return Response.json({ deleted: true });
}
