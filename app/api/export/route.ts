import { env } from 'cloudflare:workers';
import { strToU8, zipSync } from 'fflate';
import { requireInventoryAdmin } from '@/lib/inventory-bridge';
import { validateListingContent } from '@/lib/listing-engine';

const textValue = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

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
  const variants = (
    await env.DB.prepare(
      'SELECT * FROM variants WHERE product_id = ? ORDER BY created_at',
    )
      .bind(productId)
      .all<Record<string, unknown>>()
  ).results;
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
  const pricings = (
    await env.DB.prepare(
      'SELECT * FROM pricing_scenarios WHERE product_id = ? ORDER BY created_at',
    )
      .bind(productId)
      .all<Record<string, unknown>>()
  ).results;
  const assets = (
    await env.DB.prepare(
      'SELECT id, filename, object_key, content_type, view FROM original_assets WHERE product_id = ? ORDER BY created_at',
    )
      .bind(productId)
      .all<Record<string, unknown>>()
  ).results;
  const research = (
    await env.DB.prepare(
      `SELECT kc.phrase, kc.demand, kc.competition, kc.relevance, kc.intent,
              kc.evidence_url, rr.language, rr.market, rr.source, rr.fetched_at
       FROM keyword_candidates kc
       JOIN research_runs rr ON rr.id = kc.research_run_id
       WHERE rr.product_id = ?
       ORDER BY rr.fetched_at DESC, kc.relevance + kc.intent DESC`,
    )
      .bind(productId)
      .all<Record<string, unknown>>()
  ).results;
  const listing = contents.map((rawRow) => {
    const row = rawRow as Record<string, unknown>;
    return {
      ...row,
      titles_json: JSON.parse(String(row.titles_json)) as string[],
      tags_json: JSON.parse(String(row.tags_json)) as string[],
    } as Record<string, unknown> & {
      titles_json: string[];
      tags_json: string[];
    };
  });
  const validationIssues = validateListingContent(
    listing.map((row) => ({
      locale: textValue(row.locale),
      titles: row.titles_json as string[],
      selectedTitle: Number(row.selected_title || 0),
      description: textValue(row.description),
      tags: row.tags_json as string[],
    })),
  );
  const manifest = {
    exportedAt: new Date().toISOString(),
    product,
    variants,
    listing,
    imagePlan: plan ? JSON.parse(plan.roles_json) : [],
    pricingByVariant: pricings,
    research,
    originals: assets.map(
      ({ object_key: _hidden, ...asset }: Record<string, unknown>) => asset,
    ),
    etsyTransfer: {
      shop: '3DFormPoesie',
      status: 'not_connected',
      note: 'Lokaler Entwurf. Keine Veröffentlichung und keine externen Änderungen.',
      validationIssues,
      readyForManualTransfer: Boolean(
        variants.length &&
        contents.length &&
        assets.length &&
        !validationIssues.some((issue) => issue.level === 'error'),
      ),
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
