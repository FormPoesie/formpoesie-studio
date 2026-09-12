/* oxlint-disable typescript/no-base-to-string, typescript/restrict-template-expressions */
import { env } from 'cloudflare:workers';
import {
  INVENTORY_SUPABASE_URL,
  inventoryHeaders,
  normalizeInventoryProduct,
  readCookie,
  requireInventoryAdmin,
  getInventoryUser,
} from '@/lib/inventory-bridge';
import {
  calculateAutomaticEtsyPrice,
  type CentralPriceView,
} from '@/lib/central-pricing';
import { DEFAULT_PRICING_CONFIG } from '@/lib/pricing-config';
import {
  DEPENDENCIES,
  ETSY_STATES,
  HOLIDAYS,
  classifyHoliday,
  generateCartSummary,
  generateDescription,
  generateKeywords,
  generateTitles,
  snapshotProduct,
  suggestImagePlan,
  type EtsyState,
  type ProductSnapshot,
} from '@/lib/etsy-workflow';

const now = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
function parse<T>(value: unknown, fallback: T): T {
  try {
    return typeof value === 'string' ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
function cents(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}
async function inventoryProduct(request: Request, productId: string) {
  const token = readCookie(request, 'fp_inventory_access');
  const select =
    '*,designer:designers(*),filaments:product_filaments(*,material:materials(*)),variants:product_variants(*,material:materials(*))';
  const response = await fetch(
    `${INVENTORY_SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&deleted_at=is.null&limit=1&select=${encodeURIComponent(select)}`,
    { headers: inventoryHeaders(token), cache: 'no-store' },
  );
  if (!response.ok) throw new Error('INVALID_VARIANT_DATA');
  const rows = (await response.json()) as Record<string, unknown>[];
  return rows[0] ? normalizeInventoryProduct(rows[0]) : null;
}

async function ensureSlots(workflowId: string, product: ProductSnapshot) {
  const found = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM etsy_listing_image_slots WHERE workflow_id=?',
  )
    .bind(workflowId)
    .first<{ count: number }>();
  if (Number(found?.count) > 0) return;
  const stamp = now();
  const statements = suggestImagePlan(product).map((slot, index) =>
    env.DB.prepare(
      'INSERT INTO etsy_listing_image_slots (id,workflow_id,position,title,perspective,instruction,image_format,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).bind(
      makeId('slot'),
      workflowId,
      index + 1,
      slot.title,
      slot.perspective,
      slot.instruction,
      slot.format,
      'DRAFT',
      stamp,
      stamp,
    ),
  );
  if (statements.length) await env.DB.batch(statements);
}

function recommendationView(
  row: Record<string, unknown>,
  variantId: string,
): CentralPriceView {
  const result = parse<Record<string, unknown>>(row.result_json, {}),
    diagnostics = (
      result.diagnostics && typeof result.diagnostics === 'object'
        ? result.diagnostics
        : {}
    ) as Record<string, unknown>,
    discount = (
      result.discountSafety && typeof result.discountSafety === 'object'
        ? result.discountSafety
        : {}
    ) as Record<string, unknown>,
    fifteen = (
      discount.fifteenPercent && typeof discount.fifteenPercent === 'object'
        ? discount.fifteenPercent
        : {}
    ) as Record<string, unknown>;
  return {
    variantId,
    cogsCents: cents(row.cogs_cents),
    activePriceCents: cents(row.active_price_snapshot_cents),
    recommendedPriceCents: cents(row.recommended_price_cents),
    floorPriceCents:
      typeof result.floorPrice === 'number'
        ? Math.round(result.floorPrice * 100)
        : null,
    marketAnchorCents:
      typeof result.marketPrice === 'number'
        ? Math.round(result.marketPrice * 100)
        : null,
    discountState: ['GREEN', 'YELLOW', 'RED'].includes(String(fifteen.state))
      ? (fifteen.state as CentralPriceView['discountState'])
      : null,
    status: String(row.status || 'CURRENT'),
    confidence: String(result.confidence || 'medium'),
    reason:
      diagnostics.priceDriver === 'market'
        ? 'Marktanker bestimmt die Empfehlung'
        : 'Etsy-Floor sichert Kosten und Mindestbeitrag',
    recommendationId: String(row.id),
    createdAt: String(row.created_at || ''),
  };
}

async function hydrate(workflowId: string) {
  const workflow = await env.DB.prepare(
    'SELECT * FROM etsy_workflows WHERE id=?',
  )
    .bind(workflowId)
    .first<Record<string, unknown>>();
  if (!workflow) return null;
  const product = parse<ProductSnapshot>(
    workflow.product_snapshot_json,
    {} as ProductSnapshot,
  );
  await ensureSlots(workflowId, product);
  const [
    steps,
    images,
    versions,
    prices,
    slots,
    slotVersions,
    recommendations,
    impacts,
  ] = await Promise.all([
    env.DB.prepare(
      'SELECT * FROM etsy_workflow_steps WHERE workflow_id=? ORDER BY created_at',
    )
      .bind(workflowId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      'SELECT * FROM etsy_workflow_images WHERE workflow_id=? ORDER BY position',
    )
      .bind(workflowId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      'SELECT v.* FROM etsy_workflow_image_versions v JOIN etsy_workflow_images i ON i.id=v.image_id WHERE i.workflow_id=? ORDER BY v.created_at',
    )
      .bind(workflowId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      'SELECT * FROM etsy_workflow_variant_prices WHERE workflow_id=?',
    )
      .bind(workflowId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      'SELECT * FROM etsy_listing_image_slots WHERE workflow_id=? ORDER BY position',
    )
      .bind(workflowId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      'SELECT v.* FROM etsy_listing_image_slot_versions v JOIN etsy_listing_image_slots s ON s.id=v.slot_id WHERE s.workflow_id=? ORDER BY v.created_at',
    )
      .bind(workflowId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT * FROM pricing_recommendations WHERE inventory_product_id=? AND channel='etsy' ORDER BY created_at DESC",
    )
      .bind(String(workflow.inventory_product_id))
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT * FROM pricing_impacts WHERE product_id=? AND channel='etsy' AND status='REVIEW_REQUIRED' ORDER BY created_at DESC",
    )
      .bind(String(workflow.inventory_product_id))
      .all<Record<string, unknown>>(),
  ]);
  const imageVersions = new Map<string, Record<string, unknown>[]>();
  for (const version of versions.results || []) {
    const key = String(version.image_id);
    imageVersions.set(key, [...(imageVersions.get(key) || []), version]);
  }
  const versionsBySlot = new Map<string, Record<string, unknown>[]>();
  for (const version of slotVersions.results || []) {
    const key = String(version.slot_id);
    versionsBySlot.set(key, [...(versionsBySlot.get(key) || []), version]);
  }
  const latestByVariant = new Map<string, Record<string, unknown>>();
  for (const row of recommendations.results || []) {
    const key = String(row.inventory_variant_id || '');
    if (key && !latestByVariant.has(key)) latestByVariant.set(key, row);
  }
  const pricing = Object.fromEntries(
    product.variants.map((variant) => {
      const stored = latestByVariant.get(variant.id);
      const automatic = calculateAutomaticEtsyPrice(product, variant);
      return [
        variant.id,
        stored
          ? recommendationView(stored, variant.id)
          : automatic?.view || {
              variantId: variant.id,
              cogsCents: null,
              activePriceCents: null,
              recommendedPriceCents: null,
              floorPriceCents: null,
              marketAnchorCents: null,
              discountState: null,
              status: 'MISSING_COGS',
              confidence: 'low',
              reason: 'COGS fehlen',
            },
      ];
    }),
  );
  return {
    workflow: {
      id: workflow.id,
      productId: workflow.inventory_product_id,
      product,
      currentState: workflow.current_state,
      status: workflow.status,
      revision: workflow.revision,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
      completedAt: workflow.completed_at,
    },
    steps: Object.fromEntries(
      (steps.results || []).map((step) => [
        String(step.state),
        {
          status: step.status,
          result: parse(step.result_json, {}),
          userEdits: parse(step.user_edits_json, {}),
          activeVersion: step.active_version,
          approvedAt: step.approved_at,
          updatedAt: step.updated_at,
        },
      ]),
    ),
    images: (images.results || []).map((image) => ({
      id: image.id,
      filename: image.original_filename,
      contentType: image.original_content_type,
      referenceKind: image.reference_kind || 'PRODUCT',
      status: image.status,
      position: image.position,
      activeVersionId: image.active_version_id,
      originalUrl: `/api/etsy-workflow/images?id=${image.id}&kind=original`,
      versions: (imageVersions.get(String(image.id)) || []).map((version) => ({
        id: version.id,
        version: version.version,
        prompt: version.generation_prompt,
        instruction: version.user_instruction,
        status: version.status,
        errorCode: version.error_code,
        approved: Boolean(version.approved),
        url: version.object_key
          ? `/api/etsy-workflow/images?id=${version.id}&kind=version`
          : null,
      })),
    })),
    imageSlots: (slots.results || []).map((slot) => ({
      id: slot.id,
      position: slot.position,
      title: slot.title,
      perspective: slot.perspective,
      instruction: slot.instruction,
      format: slot.image_format,
      status: slot.status,
      activeVersionId: slot.active_version_id,
      approvedAt: slot.approved_at,
      versions: (versionsBySlot.get(String(slot.id)) || []).map((version) => ({
        id: version.id,
        version: version.version,
        status: version.status,
        taskPrompt: version.task_prompt,
        url: version.object_key
          ? `/api/etsy-workflow/images?id=${version.id}&kind=slot-version`
          : null,
      })),
    })),
    prices: Object.fromEntries(
      (prices.results || []).map((price) => [
        String(price.inventory_variant_id),
        price.etsy_price_cents,
      ]),
    ),
    pricing,
    marketUpdates: (impacts.results || []).map((row) => ({
      id: row.id,
      variantId: row.variant_id,
      previousRecommendationCents: row.previous_recommendation_cents,
      newRecommendationCents: row.new_recommendation_cents,
      percentageDifference: row.percentage_difference,
      status: row.status,
      createdAt: row.created_at,
    })),
    holidays: HOLIDAYS,
  };
}

type Hydrated = NonNullable<Awaited<ReturnType<typeof hydrate>>>;
async function validRevision(id: string, revision: number) {
  const row = await env.DB.prepare(
    'SELECT revision FROM etsy_workflows WHERE id=?',
  )
    .bind(id)
    .first<{ revision: number }>();
  return row?.revision === revision;
}
async function bump(id: string, state?: EtsyState) {
  await env.DB.prepare(
    'UPDATE etsy_workflows SET revision=revision+1,current_state=COALESCE(?,current_state),updated_at=? WHERE id=?',
  )
    .bind(state || null, now(), id)
    .run();
}
async function invalidate(
  id: string,
  state: EtsyState,
  status = 'NEEDS_REVIEW',
) {
  for (const dependent of DEPENDENCIES[state] || [])
    await env.DB.prepare(
      "UPDATE etsy_workflow_steps SET status=CASE WHEN status='APPROVED' THEN ? ELSE status END,updated_at=? WHERE workflow_id=? AND state=?",
    )
      .bind(status, now(), id, dependent)
      .run();
}
function next(state: EtsyState): EtsyState {
  const order: EtsyState[] = [
    'IMAGE_UPLOAD',
    'IMAGE_REVIEW',
    'KEYWORD_RESEARCH',
    'IMAGE_ORDER',
    'TITLE',
    'CART_SUMMARY',
    'VARIANT_PRICING',
    'DESCRIPTION',
    'ALT_TEXT',
    'HOLIDAY',
    'FINAL_REVIEW',
    'COMPLETED',
  ];
  return order[Math.min(order.indexOf(state) + 1, order.length - 1)];
}
async function marketTerms(productId: string) {
  try {
    const rows = await env.DB.prepare(
      `SELECT q.query FROM market_research_queries q JOIN market_cluster_products p ON p.cluster_id=q.cluster_id WHERE p.product_id=? AND q.status='ACTIVE' ORDER BY q.yield_score DESC,q.updated_at DESC LIMIT 12`,
    )
      .bind(productId)
      .all<{ query: string }>();
    return (rows.results || []).map((row) => row.query).filter(Boolean);
  } catch {
    return [] as string[];
  }
}

function review(data: Hydrated) {
  const issues: Array<{ type: string; state: EtsyState; message: string }> = [],
    product = data.workflow.product;
  const productRefs = data.images.filter(
      (image) => image.referenceKind === 'PRODUCT',
    ),
    approved = data.imageSlots.filter((slot) => slot.status === 'APPROVED');
  if (!productRefs.length)
    issues.push({
      type: 'PRODUCT_REFERENCE_MISSING',
      state: 'IMAGE_UPLOAD',
      message: 'Mindestens eine echte Produktreferenz fehlt.',
    });
  if (approved.length < Math.min(5, data.imageSlots.length))
    issues.push({
      type: 'IMAGE_COUNT',
      state: 'IMAGE_REVIEW',
      message: `Mindestens ${Math.min(5, data.imageSlots.length)} einzelne Etsy-Bilder müssen freigegeben sein.`,
    });
  for (const slot of data.imageSlots.filter(
    (slot) => slot.status !== 'APPROVED' && slot.status !== 'REJECTED',
  ))
    issues.push({
      type: 'IMAGE_NOT_REVIEWED',
      state: 'IMAGE_REVIEW',
      message: `„${slot.title}“ ist noch nicht freigegeben oder verworfen.`,
    });
  for (const slot of approved) {
    const version = slot.versions.find(
      (item) => item.id === slot.activeVersionId,
    );
    if (!String(version?.taskPrompt || '').includes('Keine Collage'))
      issues.push({
        type: 'IMAGE_GUARD_MISSING',
        state: 'IMAGE_REVIEW',
        message: `Die Einzelbild-Regeln für „${slot.title}“ sind nicht nachweisbar.`,
      });
  }
  const keywords = data.steps.KEYWORD_RESEARCH?.result as
    | {
        primary_keyword?: string;
        tags?: string[];
        candidates?: Array<{ score: number }>;
      }
    | undefined;
  if (!keywords?.primary_keyword || keywords.tags?.length !== 13)
    issues.push({
      type: 'KEYWORD_COUNT',
      state: 'KEYWORD_RESEARCH',
      message: 'Hauptkeyword und exakt 13 Tags fehlen.',
    });
  else if (
    (keywords.candidates || []).filter((candidate) => candidate.score >= 60)
      .length < 10
  )
    issues.push({
      type: 'KEYWORD_SPECIFICITY',
      state: 'KEYWORD_RESEARCH',
      message: 'Die Tags sind noch nicht ausreichend spezifisch und kaufnah.',
    });
  for (const variant of product.variants) {
    const accepted = Number(data.prices[variant.id]),
      price = data.pricing[variant.id];
    if (!Number.isInteger(accepted) || accepted <= 0)
      issues.push({
        type: 'VARIANT_PRICE_MISSING',
        state: 'VARIANT_PRICING',
        message: `Für „${variant.name}“ fehlt ein bestätigter Etsy-Preis.`,
      });
    else if (price.floorPriceCents && accepted < price.floorPriceCents)
      issues.push({
        type: 'PRICE_BELOW_FLOOR',
        state: 'VARIANT_PRICING',
        message: `„${variant.name}“ liegt unter dem Etsy-Floor.`,
      });
    if (String(price.status).startsWith('STALE'))
      issues.push({
        type: 'PRICE_STALE',
        state: 'VARIANT_PRICING',
        message: `Die Preisempfehlung für „${variant.name}“ ist veraltet.`,
      });
  }
  const title = data.steps.TITLE?.result as
    | { selected_title?: string }
    | undefined;
  if (
    title?.selected_title &&
    keywords?.primary_keyword &&
    !title.selected_title
      .toLocaleLowerCase('de')
      .includes(keywords.primary_keyword.toLocaleLowerCase('de'))
  )
    issues.push({
      type: 'TITLE_KEYWORD',
      state: 'TITLE',
      message: 'Das Hauptkeyword fehlt im bestätigten Titel.',
    });
  for (const state of [
    'TITLE',
    'CART_SUMMARY',
    'DESCRIPTION',
    'ALT_TEXT',
    'HOLIDAY',
  ] as EtsyState[])
    if (data.steps[state]?.status !== 'APPROVED')
      issues.push({
        type: 'STEP_NOT_APPROVED',
        state,
        message: `${state} ist noch nicht bestätigt.`,
      });
  const alt =
    (
      data.steps.ALT_TEXT?.result as
        | { items?: Array<{ image_id: string }> }
        | undefined
    )?.items || [];
  for (const slot of approved)
    if (!alt.some((item) => item.image_id === slot.id))
      issues.push({
        type: 'ALT_TEXT_MISSING',
        state: 'ALT_TEXT',
        message: `Alt-Text für ${slot.title} fehlt.`,
      });
  return { status: issues.length ? 'NEEDS_FIX' : 'READY_FOR_ETSY', issues };
}

async function generated(state: EtsyState, data: Hydrated) {
  const product = data.workflow.product,
    primary =
      (
        data.steps.KEYWORD_RESEARCH?.result as
          | { primary_keyword?: string }
          | undefined
      )?.primary_keyword || `${product.productType} ${product.name}`;
  if (state === 'KEYWORD_RESEARCH')
    return generateKeywords(
      product,
      await marketTerms(String(data.workflow.productId)),
    );
  if (state === 'IMAGE_ORDER')
    return {
      image_ids: data.imageSlots
        .filter((slot) => slot.status === 'APPROVED')
        .map((slot) => slot.id),
    };
  if (state === 'TITLE') return generateTitles(product, primary);
  if (state === 'CART_SUMMARY') return generateCartSummary(product);
  if (state === 'DESCRIPTION')
    return generateDescription(
      product,
      primary,
      data.prices as Record<string, number | null>,
    );
  if (state === 'ALT_TEXT')
    return {
      items: data.imageSlots
        .filter((slot) => slot.status === 'APPROVED')
        .map((slot) => ({
          image_id: slot.id,
          alt_text_de: `${product.productType} ${product.name}, ${String(slot.title).toLocaleLowerCase('de')}, in ruhiger Produktinszenierung.`,
          alt_text_en: `${product.name} ${product.productType.toLowerCase()}, ${String(slot.title).toLocaleLowerCase('en')}, in a calm product setting.`,
        })),
    };
  if (state === 'HOLIDAY') return classifyHoliday(product);
  if (state === 'FINAL_REVIEW') return review(data);
  return {};
}

export async function GET(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const url = new URL(request.url),
    workflowId = url.searchParams.get('workflowId');
  if (workflowId) {
    const value = await hydrate(workflowId);
    return value
      ? Response.json(value)
      : Response.json({ error: 'Workflow nicht gefunden.' }, { status: 404 });
  }
  const rows = await env.DB.prepare(
    'SELECT id,inventory_product_id,product_snapshot_json,current_state,status,revision,created_at,updated_at,completed_at FROM etsy_workflows ORDER BY updated_at DESC',
  ).all<Record<string, unknown>>();
  return Response.json(
    (rows.results || []).map((row) => ({
      id: row.id,
      productId: row.inventory_product_id,
      product: parse(row.product_snapshot_json, {}),
      currentState: row.current_state,
      status: row.status,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    })),
  );
}

export async function POST(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === 'start') {
      const productId = String(body.productId || '');
      if (!productId)
        return Response.json({ error: 'Artikel fehlt.' }, { status: 400 });
      const existing = await env.DB.prepare(
        'SELECT id FROM etsy_workflows WHERE inventory_product_id=? AND completed_at IS NULL ORDER BY updated_at DESC LIMIT 1',
      )
        .bind(productId)
        .first<{ id: string }>();
      const item = await inventoryProduct(request, productId);
      if (!item)
        return Response.json(
          { error: 'Inventarartikel nicht gefunden.' },
          { status: 404 },
        );
      if (existing) {
        const current = await env.DB.prepare(
          'SELECT product_snapshot_json FROM etsy_workflows WHERE id=?',
        )
          .bind(existing.id)
          .first<{ product_snapshot_json: string }>();
        const product = snapshotProduct(item);
        const previous = parse<ProductSnapshot>(
          current?.product_snapshot_json,
          {} as ProductSnapshot,
        );
        if (previous.inventoryUpdatedAt !== product.inventoryUpdatedAt) {
          const stamp = now();
          await env.DB.batch([
            env.DB.prepare(
              'UPDATE etsy_workflows SET product_snapshot_json=?,revision=revision+1,updated_at=? WHERE id=?',
            ).bind(JSON.stringify(product), stamp, existing.id),
            env.DB.prepare(
              "UPDATE etsy_workflow_steps SET status=CASE WHEN status='APPROVED' THEN 'NEEDS_REVIEW' ELSE status END,updated_at=? WHERE workflow_id=? AND state IN ('IMAGE_UPLOAD','KEYWORD_RESEARCH','TITLE','VARIANT_PRICING','DESCRIPTION','ALT_TEXT')",
            ).bind(stamp, existing.id),
          ]);
        }
        return Response.json(await hydrate(existing.id));
      }
      const workflowId = makeId('etsy'),
        stamp = now(),
        user = await getInventoryUser(request),
        product = snapshotProduct(item);
      await env.DB.prepare(
        'INSERT INTO etsy_workflows (id,inventory_product_id,product_snapshot_json,current_state,status,revision,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      )
        .bind(
          workflowId,
          productId,
          JSON.stringify(product),
          'IMAGE_UPLOAD',
          'IN_PROGRESS',
          1,
          user?.id || null,
          stamp,
          stamp,
        )
        .run();
      await env.DB.batch(
        ETSY_STATES.map((state) =>
          env.DB.prepare(
            'INSERT INTO etsy_workflow_steps (id,workflow_id,state,status,result_json,user_edits_json,approved_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
          ).bind(
            makeId('step'),
            workflowId,
            state,
            state === 'PRODUCT_LOADED'
              ? 'APPROVED'
              : state === 'IMAGE_UPLOAD'
                ? 'IN_PROGRESS'
                : 'NOT_STARTED',
            '{}',
            '{}',
            state === 'PRODUCT_LOADED' ? stamp : null,
            stamp,
            stamp,
          ),
        ),
      );
      await ensureSlots(workflowId, product);
      return Response.json(await hydrate(workflowId), { status: 201 });
    }
    const workflowId = String(body.workflowId || ''),
      revision = Number(body.revision);
    if (!workflowId || !(await validRevision(workflowId, revision)))
      return Response.json(
        { error: 'WORKFLOW_STATE_CONFLICT' },
        { status: 409 },
      );
    const data = await hydrate(workflowId);
    if (!data)
      return Response.json(
        { error: 'Workflow nicht gefunden.' },
        { status: 404 },
      );
    if (body.action === 'generate' || body.action === 'stage') {
      const state = String(body.state) as EtsyState,
        allowed: EtsyState[] = [
          'KEYWORD_RESEARCH',
          'IMAGE_ORDER',
          'TITLE',
          'CART_SUMMARY',
          'DESCRIPTION',
          'ALT_TEXT',
          'HOLIDAY',
          'FINAL_REVIEW',
        ];
      if (!allowed.includes(state))
        return Response.json(
          { error: 'Dieser Schritt kann nicht übernommen werden.' },
          { status: 400 },
        );
      const result =
        body.action === 'stage' &&
        body.result &&
        typeof body.result === 'object'
          ? body.result
          : await generated(state, data);
      if (
        state === 'KEYWORD_RESEARCH' &&
        (!Array.isArray((result as { tags?: unknown[] }).tags) ||
          (result as { tags: unknown[] }).tags.length !== 13)
      )
        return Response.json(
          { error: 'Das Chat-Ergebnis muss exakt 13 Tags enthalten.' },
          { status: 400 },
        );
      const latest = await env.DB.prepare(
          'SELECT MAX(version) AS version FROM etsy_workflow_versions WHERE workflow_id=? AND state=?',
        )
          .bind(workflowId, state)
          .first<{ version: number | null }>(),
        version = (latest?.version || 0) + 1,
        stamp = now();
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO etsy_workflow_versions (id,workflow_id,state,version,result_json,source_revision,approved,created_at) VALUES (?,?,?,?,?,?,?,?)',
        ).bind(
          makeId('ver'),
          workflowId,
          state,
          version,
          JSON.stringify(result),
          revision,
          0,
          stamp,
        ),
        env.DB.prepare(
          "UPDATE etsy_workflow_steps SET status='READY_FOR_REVIEW',result_json=?,active_version=?,approved_at=NULL,updated_at=? WHERE workflow_id=? AND state=?",
        ).bind(JSON.stringify(result), version, stamp, workflowId, state),
      ]);
      await bump(workflowId, state);
      return Response.json(await hydrate(workflowId));
    }
    if (body.action === 'recalculate-prices') {
      const stamp = now(),
        statements = [];
      for (const variant of data.workflow.product.variants) {
        const previous = await env.DB.prepare(
          "SELECT input_json FROM pricing_recommendations WHERE inventory_product_id=? AND inventory_variant_id=? AND channel='etsy' ORDER BY created_at DESC LIMIT 1",
        )
          .bind(data.workflow.productId, variant.id)
          .first<{ input_json: string }>();
        const calculated = calculateAutomaticEtsyPrice(
          data.workflow.product,
          variant,
          DEFAULT_PRICING_CONFIG,
          parse(previous?.input_json, null),
        );
        if (!calculated) continue;
        const id = crypto.randomUUID();
        statements.push(
          env.DB.prepare(
            "UPDATE pricing_recommendations SET status='STALE_RECALCULATED' WHERE inventory_product_id=? AND inventory_variant_id=? AND channel='etsy' AND status IN ('CURRENT','MARKET_UPDATED_REVIEW')",
          ).bind(data.workflow.productId, variant.id),
        );
        statements.push(
          env.DB.prepare(
            `INSERT INTO pricing_recommendations (id,inventory_product_id,inventory_variant_id,channel,recommendation_kind,config_version,cogs_cents,active_price_snapshot_cents,recommended_price_cents,input_json,result_json,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'CURRENT',?)`,
          ).bind(
            id,
            data.workflow.productId,
            variant.id,
            'etsy',
            'physical',
            calculated.input.config?.version || DEFAULT_PRICING_CONFIG.version,
            calculated.view.cogsCents,
            calculated.view.activePriceCents,
            calculated.view.recommendedPriceCents,
            JSON.stringify(calculated.input),
            JSON.stringify(calculated.result),
            stamp,
          ),
        );
      }
      if (statements.length) await env.DB.batch(statements);
      await env.DB.prepare(
        "UPDATE etsy_workflow_steps SET status='READY_FOR_REVIEW',updated_at=? WHERE workflow_id=? AND state='VARIANT_PRICING'",
      )
        .bind(stamp, workflowId)
        .run();
      await bump(workflowId, 'VARIANT_PRICING');
      return Response.json(await hydrate(workflowId));
    }
    if (body.action === 'accept-prices') {
      const overrides = (
          body.prices && typeof body.prices === 'object' ? body.prices : {}
        ) as Record<string, unknown>,
        stamp = now(),
        accepted: Record<string, number> = {};
      for (const variant of data.workflow.product.variants) {
        const recommendation = data.pricing[variant.id],
          value = cents(
            overrides[variant.id] ?? recommendation.recommendedPriceCents,
          );
        if (value == null || value <= 0)
          return Response.json(
            { error: `Für „${variant.name}“ fehlt eine Preisempfehlung.` },
            { status: 400 },
          );
        if (
          recommendation.floorPriceCents &&
          value < recommendation.floorPriceCents
        )
          return Response.json(
            {
              error: `Der Preis für „${variant.name}“ liegt unter dem Etsy-Floor.`,
            },
            { status: 400 },
          );
        accepted[variant.id] = value;
        await env.DB.prepare(
          'INSERT INTO etsy_workflow_variant_prices (workflow_id,inventory_variant_id,etsy_price_cents,updated_at) VALUES (?,?,?,?) ON CONFLICT(workflow_id,inventory_variant_id) DO UPDATE SET etsy_price_cents=excluded.etsy_price_cents,updated_at=excluded.updated_at',
        )
          .bind(workflowId, variant.id, value, stamp)
          .run();
        await env.DB.prepare(
          "UPDATE pricing_impacts SET status='ACCEPTED' WHERE product_id=? AND channel='etsy' AND status='REVIEW_REQUIRED'",
        )
          .bind(data.workflow.productId)
          .run();
      }
      await env.DB.prepare(
        "UPDATE etsy_workflow_steps SET status='APPROVED',result_json=?,approved_at=?,updated_at=? WHERE workflow_id=? AND state='VARIANT_PRICING'",
      )
        .bind(
          JSON.stringify({
            prices: accepted,
            source: 'CENTRAL_PRICING_ENGINE',
            confirmed_at: stamp,
          }),
          stamp,
          stamp,
          workflowId,
        )
        .run();
      await invalidate(workflowId, 'VARIANT_PRICING');
      await bump(workflowId, 'DESCRIPTION');
      return Response.json(await hydrate(workflowId));
    }
    if (body.action === 'ignore-market-update') {
      await env.DB.prepare(
        "UPDATE pricing_impacts SET status='IGNORED' WHERE product_id=? AND channel='etsy' AND status='REVIEW_REQUIRED'",
      )
        .bind(data.workflow.productId)
        .run();
      await bump(workflowId, 'VARIANT_PRICING');
      return Response.json(await hydrate(workflowId));
    }
    if (body.action === 'update-plan') {
      const slots = Array.isArray(body.slots)
        ? (body.slots as Array<Record<string, unknown>>)
        : [];
      for (const slot of slots) {
        await env.DB.prepare(
          'UPDATE etsy_listing_image_slots SET title=?,perspective=?,instruction=?,image_format=?,updated_at=? WHERE id=? AND workflow_id=?',
        )
          .bind(
            String(slot.title || ''),
            String(slot.perspective || ''),
            String(slot.instruction || ''),
            String(slot.format || '4:5'),
            now(),
            String(slot.id || ''),
            workflowId,
          )
          .run();
      }
      await invalidate(workflowId, 'IMAGE_UPLOAD');
      await bump(workflowId, 'IMAGE_UPLOAD');
      return Response.json(await hydrate(workflowId));
    }
    if (body.action === 'approve') {
      const state = String(body.state) as EtsyState;
      let result = body.result || data.steps[state]?.result || {};
      if (state === 'IMAGE_UPLOAD') {
        if (!data.images.some((image) => image.referenceKind === 'PRODUCT'))
          return Response.json(
            { error: 'Bitte mindestens eine Produktreferenz hinzufügen.' },
            { status: 400 },
          );
        result = {
          product_reference_ids: data.images
            .filter((image) => image.referenceKind === 'PRODUCT')
            .map((image) => image.id),
          background_reference_id:
            data.images.find((image) => image.referenceKind === 'BACKGROUND')
              ?.id || null,
          slot_ids: data.imageSlots.map((slot) => slot.id),
        };
      }
      if (
        state === 'IMAGE_REVIEW' &&
        data.imageSlots.some(
          (slot) => !['APPROVED', 'REJECTED'].includes(String(slot.status)),
        )
      )
        return Response.json(
          { error: 'Bitte jeden Bildslot freigeben oder verwerfen.' },
          { status: 400 },
        );
      const stamp = now();
      await env.DB.prepare(
        "UPDATE etsy_workflow_steps SET status='APPROVED',result_json=?,user_edits_json=?,approved_at=?,updated_at=? WHERE workflow_id=? AND state=?",
      )
        .bind(
          JSON.stringify(result),
          JSON.stringify(body.result || {}),
          stamp,
          stamp,
          workflowId,
          state,
        )
        .run();
      await env.DB.prepare(
        'UPDATE etsy_workflow_versions SET approved=CASE WHEN version=(SELECT active_version FROM etsy_workflow_steps WHERE workflow_id=? AND state=?) THEN 1 ELSE 0 END WHERE workflow_id=? AND state=?',
      )
        .bind(workflowId, state, workflowId, state)
        .run();
      await invalidate(workflowId, state);
      await bump(workflowId, next(state));
      return Response.json(await hydrate(workflowId));
    }
    if (body.action === 'complete') {
      const result = review(data);
      if (result.status !== 'READY_FOR_ETSY')
        return Response.json(
          { ...result, error: 'NEEDS_FIX' },
          { status: 400 },
        );
      const stamp = now();
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE etsy_workflows SET status='READY_FOR_ETSY',current_state='COMPLETED',completed_at=?,revision=revision+1,updated_at=? WHERE id=?",
        ).bind(stamp, stamp, workflowId),
        env.DB.prepare(
          "UPDATE etsy_workflow_steps SET status='APPROVED',approved_at=?,updated_at=? WHERE workflow_id=? AND state IN ('FINAL_REVIEW','COMPLETED')",
        ).bind(stamp, stamp, workflowId),
      ]);
      return Response.json(await hydrate(workflowId));
    }
    return Response.json({ error: 'Unbekannte Aktion.' }, { status: 400 });
  } catch (error) {
    console.error('etsy workflow failed', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'SAVE_FAILED' },
      { status: 500 },
    );
  }
}
