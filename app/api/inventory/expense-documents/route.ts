import { env } from 'cloudflare:workers';
import { requireInventoryManager } from '@/lib/inventory-bridge';

type DocumentRow = {
  id: string;
  relationId: string | null;
  objectKey: string;
  filename: string;
  contentType: string;
};

const maximumBytes = 25 * 1024 * 1024;
const allowedExtensions = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-140) || 'beleg';
}

function extension(value: string) {
  return value.split('.').pop()?.toLowerCase() || '';
}

async function findDocument(id: string) {
  return env.DB.prepare(
    `SELECT id, relation_id AS relationId, object_key AS objectKey,
            filename, content_type AS contentType
     FROM business_documents
     WHERE id = ? AND relation_type = 'expense'`,
  )
    .bind(id)
    .first<DocumentRow>();
}

export async function GET(request: Request) {
  const denied = await requireInventoryManager(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id)
    return Response.json({ error: 'Dokument-ID fehlt.' }, { status: 400 });
  const document = await findDocument(id);
  if (!document)
    return Response.json({ error: 'Beleg nicht gefunden.' }, { status: 404 });
  const object = await env.FILES.get(document.objectKey);
  if (!object)
    return Response.json({ error: 'Belegdatei fehlt.' }, { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': document.contentType,
      'Content-Disposition': `attachment; filename="${safeFilename(document.filename)}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function POST(request: Request) {
  const denied = await requireInventoryManager(request);
  if (denied) return denied;
  const form = await request.formData();
  const file = form.get('file');
  const expenseValue = form.get('expenseId');
  const expenseId = typeof expenseValue === 'string' ? expenseValue.trim() : '';
  if (!(file instanceof File) || !expenseId)
    return Response.json(
      { error: 'Beleg und Ausgabe fehlen.' },
      { status: 400 },
    );
  if (!allowedExtensions.has(extension(file.name)))
    return Response.json(
      { error: 'Erlaubt sind PDF, JPEG, PNG und WebP.' },
      { status: 415 },
    );
  if (file.size > maximumBytes)
    return Response.json(
      { error: 'Der Beleg darf höchstens 25 MB groß sein.' },
      { status: 413 },
    );
  const id = 'doc_' + crypto.randomUUID();
  const key = `business-documents/expenses/${expenseId}/${id}/${safeFilename(file.name)}`;
  await env.FILES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO business_documents
         (id, relation_type, relation_id, document_kind, title, object_key,
          filename, content_type, size_bytes, created_at, updated_at)
       VALUES (?, 'expense', ?, 'receipt', ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        expenseId,
        file.name,
        key,
        file.name,
        file.type || 'application/octet-stream',
        file.size,
        now,
        now,
      )
      .run();
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }
  return Response.json(
    {
      uploaded: true,
      document: {
        id,
        relationId: expenseId,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        url: '/api/inventory/expense-documents?id=' + encodeURIComponent(id),
      },
    },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const denied = await requireInventoryManager(request);
  if (denied) return denied;
  const body = (await request.json()) as { id?: string };
  if (!body.id)
    return Response.json({ error: 'Dokument-ID fehlt.' }, { status: 400 });
  const document = await findDocument(body.id);
  if (!document)
    return Response.json({ error: 'Beleg nicht gefunden.' }, { status: 404 });
  await env.DB.prepare('DELETE FROM business_documents WHERE id = ?')
    .bind(document.id)
    .run();
  await env.FILES.delete(document.objectKey);
  return Response.json({ deleted: true });
}
