/* oxlint-disable typescript/no-base-to-string, typescript/restrict-template-expressions */
import { env } from 'cloudflare:workers';
import { requireInventoryAdmin } from '@/lib/inventory-bridge';
import {
  buildImageChatTask,
  imageSlotTransition,
  type ProductSnapshot,
} from '@/lib/etsy-workflow';

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
const now = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
function parse<T>(value: unknown, fallback: T): T {
  try {
    return typeof value === 'string' ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
async function workflowRow(workflowId: string) {
  return env.DB.prepare('SELECT * FROM etsy_workflows WHERE id=?')
    .bind(workflowId)
    .first<Record<string, unknown>>();
}
async function slotRow(slotId: string) {
  return env.DB.prepare(
    'SELECT s.*,w.product_snapshot_json,w.revision FROM etsy_listing_image_slots s JOIN etsy_workflows w ON w.id=s.workflow_id WHERE s.id=?',
  )
    .bind(slotId)
    .first<Record<string, unknown>>();
}

export async function GET(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const url = new URL(request.url),
    objectId = url.searchParams.get('id'),
    kind = url.searchParams.get('kind');
  if (!objectId) return Response.json({ error: 'ID fehlt.' }, { status: 400 });
  let row: { object_key: string | null; content_type?: string | null } | null =
    null;
  if (kind === 'slot-version')
    row = await env.DB.prepare(
      'SELECT object_key,content_type FROM etsy_listing_image_slot_versions WHERE id=?',
    )
      .bind(objectId)
      .first();
  else if (kind === 'version')
    row = await env.DB.prepare(
      'SELECT object_key FROM etsy_workflow_image_versions WHERE id=?',
    )
      .bind(objectId)
      .first();
  else
    row = await env.DB.prepare(
      'SELECT original_object_key AS object_key,original_content_type AS content_type FROM etsy_workflow_images WHERE id=?',
    )
      .bind(objectId)
      .first();
  if (!row?.object_key)
    return Response.json({ error: 'Bild nicht gefunden.' }, { status: 404 });
  const object = await env.FILES.get(row.object_key);
  if (!object)
    return Response.json({ error: 'Bilddatei fehlt.' }, { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type':
        object.httpMetadata?.contentType || row.content_type || 'image/png',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function POST(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  try {
    const content = request.headers.get('content-type') || '';
    if (content.includes('multipart/form-data')) {
      const form = await request.formData(),
        file = form.get('file'),
        workflowId = String(form.get('workflowId') || ''),
        slotId = String(form.get('slotId') || form.get('imageId') || ''),
        kind = String(form.get('kind') || 'product-reference');
      if (
        !(file instanceof File) ||
        !allowed.has(file.type) ||
        file.size > 20 * 1024 * 1024
      )
        return Response.json({ error: 'UPLOAD_FAILED' }, { status: 400 });
      const workflow = await workflowRow(workflowId);
      if (!workflow)
        return Response.json({ error: 'Workflow fehlt.' }, { status: 404 });
      const stamp = now(),
        safe =
          file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120) || 'upload';
      if (kind === 'slot-result' || kind === 'generated') {
        const slot = await slotRow(slotId);
        if (!slot || String(slot.workflow_id) !== workflowId)
          return Response.json({ error: 'Bildslot fehlt.' }, { status: 404 });
        let version = await env.DB.prepare(
          "SELECT * FROM etsy_listing_image_slot_versions WHERE slot_id=? AND status='GENERATED' ORDER BY version DESC LIMIT 1",
        )
          .bind(slotId)
          .first<Record<string, unknown>>();
        if (!version) {
          const latest = await env.DB.prepare(
            'SELECT MAX(version) AS version FROM etsy_listing_image_slot_versions WHERE slot_id=?',
          )
            .bind(slotId)
            .first<{ version: number | null }>();
          version = {
            id: makeId('slotv'),
            version: (latest?.version || 0) + 1,
            task_prompt: 'Extern erzeugtes einzelnes Produktbild',
          };
          await env.DB.prepare(
            "INSERT INTO etsy_listing_image_slot_versions (id,slot_id,version,task_prompt,status,created_at) VALUES (?,?,?,?,'GENERATED',?)",
          )
            .bind(
              version.id,
              slotId,
              version.version,
              version.task_prompt,
              stamp,
            )
            .run();
        }
        const key = `etsy/results/${workflowId}/${slotId}/${version.id}-${safe}`;
        await env.FILES.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: file.type },
        });
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE etsy_listing_image_slot_versions SET object_key=?,content_type=?,status='IMPORTED' WHERE id=?",
          ).bind(key, file.type, version.id),
          env.DB.prepare(
            'UPDATE etsy_listing_image_slots SET status=?,active_version_id=?,approved_at=NULL,updated_at=? WHERE id=?',
          ).bind(imageSlotTransition('import'), version.id, stamp, slotId),
          env.DB.prepare(
            "UPDATE etsy_workflow_steps SET status='IN_PROGRESS',updated_at=? WHERE workflow_id=? AND state='IMAGE_REVIEW'",
          ).bind(stamp, workflowId),
          env.DB.prepare(
            "UPDATE etsy_workflows SET revision=revision+1,current_state='IMAGE_REVIEW',updated_at=? WHERE id=?",
          ).bind(stamp, workflowId),
        ]);
        return Response.json(
          { ok: true, slotId, versionId: version.id },
          { status: 201 },
        );
      }
      const referenceKind =
        kind === 'background-reference' ? 'BACKGROUND' : 'PRODUCT';
      if (referenceKind === 'BACKGROUND') {
        const existing = await env.DB.prepare(
          "SELECT id FROM etsy_workflow_images WHERE workflow_id=? AND reference_kind='BACKGROUND'",
        )
          .bind(workflowId)
          .first<{ id: string }>();
        const id = existing?.id || makeId('wimg'),
          key = `etsy/references/${workflowId}/${id}/${safe}`;
        await env.FILES.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: file.type },
        });
        if (existing)
          await env.DB.prepare(
            "UPDATE etsy_workflow_images SET original_object_key=?,original_filename=?,original_content_type=?,status='UPLOADED',updated_at=? WHERE id=?",
          )
            .bind(key, file.name, file.type, stamp, id)
            .run();
        else {
          const max = await env.DB.prepare(
            'SELECT MAX(position) AS position FROM etsy_workflow_images WHERE workflow_id=?',
          )
            .bind(workflowId)
            .first<{ position: number | null }>();
          await env.DB.prepare(
            'INSERT INTO etsy_workflow_images (id,workflow_id,original_object_key,original_filename,original_content_type,reference_kind,status,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          )
            .bind(
              id,
              workflowId,
              key,
              file.name,
              file.type,
              'BACKGROUND',
              'UPLOADED',
              (max?.position || 0) + 1,
              stamp,
              stamp,
            )
            .run();
        }
        await env.DB.prepare(
          'UPDATE etsy_workflows SET revision=revision+1,updated_at=? WHERE id=?',
        )
          .bind(stamp, workflowId)
          .run();
        return Response.json({ id, referenceKind }, { status: 201 });
      }
      const max = await env.DB.prepare(
          'SELECT MAX(position) AS position FROM etsy_workflow_images WHERE workflow_id=?',
        )
          .bind(workflowId)
          .first<{ position: number | null }>(),
        id = makeId('wimg'),
        key = `etsy/references/${workflowId}/${id}/${safe}`;
      await env.FILES.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
      });
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO etsy_workflow_images (id,workflow_id,original_object_key,original_filename,original_content_type,reference_kind,status,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ).bind(
          id,
          workflowId,
          key,
          file.name,
          file.type,
          'PRODUCT',
          'UPLOADED',
          (max?.position || 0) + 1,
          stamp,
          stamp,
        ),
        env.DB.prepare(
          "UPDATE etsy_workflow_steps SET status='IN_PROGRESS',updated_at=? WHERE workflow_id=? AND state='IMAGE_UPLOAD'",
        ).bind(stamp, workflowId),
        env.DB.prepare(
          'UPDATE etsy_workflows SET revision=revision+1,updated_at=? WHERE id=?',
        ).bind(stamp, workflowId),
      ]);
      return Response.json({ id, referenceKind: 'PRODUCT' }, { status: 201 });
    }
    const body = (await request.json()) as Record<string, unknown>,
      slotId = String(body.slotId || ''),
      action = String(body.action || ''),
      slot = await slotRow(slotId);
    if (!slot)
      return Response.json({ error: 'Bildslot fehlt.' }, { status: 404 });
    if (Number(body.revision) !== Number(slot.revision))
      return Response.json(
        { error: 'WORKFLOW_STATE_CONFLICT' },
        { status: 409 },
      );
    const workflowId = String(slot.workflow_id),
      stamp = now();
    if (action === 'create-task') {
      const refs = await env.DB.prepare(
          'SELECT id,original_filename,reference_kind FROM etsy_workflow_images WHERE workflow_id=? ORDER BY position',
        )
          .bind(workflowId)
          .all<Record<string, unknown>>(),
        productRefs = (refs.results || [])
          .filter(
            (ref) => String(ref.reference_kind || 'PRODUCT') === 'PRODUCT',
          )
          .map((ref) => ({
            id: String(ref.id),
            filename: String(ref.original_filename),
            url: `${new URL(request.url).origin}/api/etsy-workflow/images?id=${encodeURIComponent(String(ref.id))}&kind=original`,
          })),
        backgroundRow = (refs.results || []).find(
          (ref) => String(ref.reference_kind) === 'BACKGROUND',
        );
      if (!productRefs.length)
        return Response.json(
          { error: 'Mindestens eine Produktreferenz ist erforderlich.' },
          { status: 400 },
        );
      const prompt = buildImageChatTask({
        product: parse<ProductSnapshot>(
          slot.product_snapshot_json,
          {} as ProductSnapshot,
        ),
        slot: {
          id: slotId,
          title: String(slot.title),
          perspective: String(slot.perspective),
          instruction: String(slot.instruction),
          format: String(slot.image_format),
        },
        productReferences: productRefs,
        backgroundReference: backgroundRow
          ? {
              id: String(backgroundRow.id),
              filename: String(backgroundRow.original_filename),
              url: `${new URL(request.url).origin}/api/etsy-workflow/images?id=${encodeURIComponent(String(backgroundRow.id))}&kind=original`,
            }
          : null,
        userInstruction: String(body.instruction || ''),
      });
      const latest = await env.DB.prepare(
          'SELECT MAX(version) AS version FROM etsy_listing_image_slot_versions WHERE slot_id=?',
        )
          .bind(slotId)
          .first<{ version: number | null }>(),
        versionId = makeId('slotv');
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO etsy_listing_image_slot_versions (id,slot_id,version,task_prompt,status,created_at) VALUES (?,?,?,?,'GENERATED',?)",
        ).bind(versionId, slotId, (latest?.version || 0) + 1, prompt, stamp),
        env.DB.prepare(
          'UPDATE etsy_listing_image_slots SET status=?,active_version_id=?,approved_at=NULL,updated_at=? WHERE id=?',
        ).bind(imageSlotTransition('create-task'), versionId, stamp, slotId),
        env.DB.prepare(
          'UPDATE etsy_workflows SET revision=revision+1,updated_at=? WHERE id=?',
        ).bind(stamp, workflowId),
      ]);
      return Response.json({ ok: true, prompt, slotId, versionId });
    }
    if (action === 'approve') {
      const versionId = String(body.versionId || slot.active_version_id || ''),
        version = await env.DB.prepare(
          "SELECT id FROM etsy_listing_image_slot_versions WHERE id=? AND slot_id=? AND status='IMPORTED'",
        )
          .bind(versionId, slotId)
          .first();
      if (!version)
        return Response.json(
          { error: 'Importiere zuerst ein einzelnes Ergebnisbild.' },
          { status: 400 },
        );
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE etsy_listing_image_slot_versions SET status=CASE WHEN id=? THEN 'APPROVED' WHEN status='APPROVED' THEN 'IMPORTED' ELSE status END WHERE slot_id=?",
        ).bind(versionId, slotId),
        env.DB.prepare(
          'UPDATE etsy_listing_image_slots SET status=?,active_version_id=?,approved_at=?,updated_at=? WHERE id=?',
        ).bind(imageSlotTransition('approve'), versionId, stamp, stamp, slotId),
        env.DB.prepare(
          'UPDATE etsy_workflows SET revision=revision+1,updated_at=? WHERE id=?',
        ).bind(stamp, workflowId),
      ]);
      return Response.json({ ok: true });
    }
    if (action === 'reject') {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE etsy_listing_image_slot_versions SET status=CASE WHEN id=? THEN 'REJECTED' ELSE status END WHERE slot_id=?",
        ).bind(String(slot.active_version_id || ''), slotId),
        env.DB.prepare(
          'UPDATE etsy_listing_image_slots SET status=?,approved_at=NULL,updated_at=? WHERE id=?',
        ).bind(imageSlotTransition('reject'), stamp, slotId),
        env.DB.prepare(
          'UPDATE etsy_workflows SET revision=revision+1,updated_at=? WHERE id=?',
        ).bind(stamp, workflowId),
      ]);
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'Unbekannte Bildaktion.' }, { status: 400 });
  } catch (error) {
    console.error('etsy image workflow failed', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'IMAGE_SAVE_FAILED' },
      { status: 500 },
    );
  }
}
