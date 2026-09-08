import { env } from 'cloudflare:workers';
import {
  calculatePricing,
  createImagePlan,
  createLocaleContent,
  imageMetadata,
  validateProduct,
  type ProductInput,
} from '@/lib/listing-engine';
import { requireInventoryAdmin } from '@/lib/inventory-bridge';

const json = (value: unknown, status = 200) => Response.json(value, { status });
const now = () => new Date().toISOString();
const makeId = (prefix: string) => prefix + '_' + crypto.randomUUID();

async function hydrate(productId: string) {
  const product = await env.DB.prepare('SELECT * FROM products WHERE id = ?')
    .bind(productId)
    .first<Record<string, unknown>>();
  if (!product) return null;
  const variantRows = await env.DB.prepare(
    'SELECT * FROM variants WHERE product_id = ? ORDER BY created_at',
  )
    .bind(productId)
    .all<Record<string, unknown>>();
  const variants = variantRows.results || [];
  const variant = variants[0] || null;
  /* Keep the singular fields for older screens while returning every variant. */
  const legacyVariant = await env.DB.prepare(
    'SELECT * FROM variants WHERE product_id = ? ORDER BY created_at LIMIT 1',
  )
    .bind(productId)
    .first<Record<string, unknown>>();
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
    'SELECT * FROM image_plans WHERE product_id = ? ORDER BY updated_at DESC LIMIT 1',
  )
    .bind(productId)
    .first<Record<string, unknown>>();
  const pricingRows = await env.DB.prepare(
    'SELECT * FROM pricing_scenarios WHERE product_id = ? ORDER BY created_at',
  )
    .bind(productId)
    .all<Record<string, unknown>>();
  const pricings = pricingRows.results || [];
  const pricing = pricings[0] || null;
  const legacyPricing = await env.DB.prepare(
    'SELECT * FROM pricing_scenarios WHERE product_id = ? ORDER BY updated_at DESC LIMIT 1',
  )
    .bind(productId)
    .first<Record<string, unknown>>();
  const assets = (
    await env.DB.prepare(
      'SELECT * FROM original_assets WHERE product_id = ? ORDER BY created_at',
    )
      .bind(productId)
      .all()
  ).results;
  const research = (
    await env.DB.prepare(
      'SELECT kc.*, rr.language, rr.market, rr.source, rr.fetched_at FROM keyword_candidates kc JOIN research_runs rr ON rr.id = kc.research_run_id WHERE rr.product_id = ? ORDER BY kc.relevance + kc.intent DESC',
    )
      .bind(productId)
      .all()
  ).results;
  const issues: Array<{ level: string; area: string; text: string }> = [];
  if (!product.material)
    issues.push({
      level: 'error',
      area: 'Fakten',
      text: 'Material ist noch nicht bestätigt.',
    });
  if (!product.width_mm || !product.height_mm || !product.depth_mm)
    issues.push({
      level: 'error',
      area: 'Fakten',
      text: 'Maße mit allen drei Achsen fehlen.',
    });
  if (!product.design_origin)
    issues.push({
      level: 'warning',
      area: 'Etsy',
      text: 'Designherkunft und Etsy-Zulässigkeit sind ungeklärt.',
    });
  if (!legacyVariant?.weight_grams || !legacyVariant?.print_hours)
    issues.push({
      level: 'error',
      area: 'Preis',
      text: 'Materialverbrauch oder Druckzeit fehlt.',
    });
  return {
    product,
    variant: legacyVariant || variant,
    variants,
    draft,
    contents,
    plan,
    pricing: legacyPricing || pricing,
    pricings,
    assets,
    research,
    issues,
  };
}

export async function GET(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const productId = url.searchParams.get('id');
  if (productId) {
    const result = await hydrate(productId);
    return result
      ? json(result)
      : json({ error: 'Produkt nicht gefunden.' }, 404);
  }
  const rows = (
    await env.DB.prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM original_assets a WHERE a.product_id = p.id) AS asset_count
       FROM products p
       WHERE ${url.searchParams.get('view') === 'trash' ? "p.status = 'trash'" : "p.status != 'trash'"}
       ORDER BY p.updated_at DESC`,
    ).all()
  ).results;
  return json(rows);
}

export async function POST(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const input = (await request.json()) as ProductInput;
  if (!input.modelName?.trim() || !input.productType?.trim())
    return json({ error: 'Modellname und Produktart sind erforderlich.' }, 400);
  const productId = makeId('prd'),
    draftId = makeId('lst');
  const instant = now();
  const variantInputs = input.variants?.length
    ? input.variants
    : [input.variant];
  const preparedVariants = variantInputs.map((variant) => ({
    input: variant,
    id: makeId('var'),
  }));
  const content = [
    createLocaleContent(input, 'de'),
    createLocaleContent(input, 'en'),
  ];
  const plan = imageMetadata(input, createImagePlan(input, 0));
  const pricing = calculatePricing(input);
  const statements = [
    env.DB.prepare(
      'INSERT INTO products (id, model_name, product_type, sku, buyer_world, material, material_status, width_mm, height_mm, depth_mm, dimensions_status, design_origin, etsy_eligibility, status, facts_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      productId,
      input.modelName.trim(),
      input.productType.trim(),
      input.sku || null,
      input.buyerWorld,
      input.material || null,
      input.material ? 'confirmed' : 'open',
      input.widthMm || null,
      input.heightMm || null,
      input.depthMm || null,
      input.widthMm && input.heightMm && input.depthMm ? 'confirmed' : 'open',
      input.designOrigin || null,
      input.designOrigin ? 'review_required' : 'open',
      'draft',
      JSON.stringify({
        kind: input.kind,
        costs: input.costs,
        shop: '3DFormPoesie',
        inventorySourceId: input.inventorySourceId || null,
      }),
      instant,
      instant,
    ),
    ...preparedVariants.map(({ input: variant, id }) =>
      env.DB.prepare(
        'INSERT INTO variants (id, product_id, name, sku, color, material, set_size, weight_grams, print_hours, active_minutes, failure_rate, confirmed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        id,
        productId,
        variant.name,
        variant.sku || input.sku || null,
        variant.color || null,
        variant.material || input.material || null,
        variant.setSize || 1,
        variant.weightGrams || null,
        variant.printHours || null,
        variant.activeMinutes || null,
        variant.failureRate || 0.08,
        true,
        instant,
        instant,
      ),
    ),
    env.DB.prepare(
      'INSERT INTO listing_drafts (id, product_id, state, mode, category, locked_json, transfer_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      draftId,
      productId,
      'local',
      'autopilot',
      input.productType,
      '[]',
      'not_connected',
      instant,
      instant,
    ),
    ...content.map((item) =>
      env.DB.prepare(
        'INSERT INTO locale_contents (id, draft_id, locale, titles_json, selected_title, description, tags_json, locked_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        makeId('loc'),
        draftId,
        item.locale,
        JSON.stringify(item.titles),
        item.selectedTitle,
        item.description,
        JSON.stringify(item.tags),
        '[]',
        instant,
        instant,
      ),
    ),
    env.DB.prepare(
      'INSERT INTO image_plans (id, product_id, kind, roles_json, locked_roles_json, stale, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      makeId('imgp'),
      productId,
      input.kind,
      JSON.stringify(plan),
      '[]',
      false,
      instant,
      instant,
    ),
    ...preparedVariants.map(({ input: variant, id }) => {
      const variantPricing = calculatePricing({
        ...input,
        variant,
        costs: {
          ...input.costs,
          recordedProductionCost:
            variant.recordedProductionCost ??
            input.costs.recordedProductionCost,
        },
      });
      return env.DB.prepare(
        'INSERT INTO pricing_scenarios (id, product_id, variant_id, direct_price, etsy_price, floor_price, result_without_ads, result_with_ads, confidence, assumptions_json, breakdown_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        makeId('prc'),
        productId,
        id,
        variantPricing.directPrice,
        variantPricing.etsyPrice,
        variantPricing.floorPrice,
        variantPricing.resultWithoutAds,
        variantPricing.resultWithAds,
        variantPricing.confidence,
        JSON.stringify(variantPricing.assumptions),
        JSON.stringify(variantPricing.breakdown),
        instant,
        instant,
      );
    }),
    env.DB.prepare(
      'INSERT INTO change_history (id, entity_type, entity_id, action, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(
      makeId('chg'),
      'product',
      productId,
      'created',
      JSON.stringify({ modelName: input.modelName }),
      instant,
    ),
  ];
  await env.DB.batch(statements);
  return json(
    {
      id: productId,
      variantId: preparedVariants[0].id,
      variantIds: preparedVariants.map((variant) => variant.id),
      variantCount: preparedVariants.length,
      draftId,
      content,
      plan,
      pricing,
      facts: {
        material: input.material || '',
        widthMm: input.widthMm || null,
        heightMm: input.heightMm || null,
        depthMm: input.depthMm || null,
        designOrigin: input.designOrigin || '',
      },
      issues: validateProduct(input, content),
    },
    201,
  );
}

export async function PUT(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const body = (await request.json()) as {
    id: string;
    locale?: string;
    description?: string;
    titles?: string[];
    tags?: string[];
    selectedTitle?: number;
    locked?: string[];
    facts?: {
      material?: string;
      widthMm?: number | null;
      heightMm?: number | null;
      depthMm?: number | null;
      designOrigin?: string;
    };
    action?: 'restore';
  };
  if (!body.id) return json({ error: 'ID fehlt.' }, 400);
  if (body.action === 'restore') {
    await env.DB.prepare(
      "UPDATE products SET status = 'draft', updated_at = ? WHERE id = ?",
    )
      .bind(now(), body.id)
      .run();
    return json(await hydrate(body.id));
  }
  if (body.facts) {
    const facts = body.facts;
    const material = facts.material?.trim() || null;
    const designOrigin = facts.designOrigin?.trim() || null;
    await env.DB.prepare(
      'UPDATE products SET material = ?, material_status = ?, width_mm = ?, height_mm = ?, depth_mm = ?, dimensions_status = ?, design_origin = ?, etsy_eligibility = ?, updated_at = ? WHERE id = ?',
    )
      .bind(
        material,
        material ? 'confirmed' : 'open',
        facts.widthMm || null,
        facts.heightMm || null,
        facts.depthMm || null,
        facts.widthMm && facts.heightMm && facts.depthMm ? 'confirmed' : 'open',
        designOrigin,
        designOrigin ? 'review_required' : 'open',
        now(),
        body.id,
      )
      .run();
  }
  if (body.locale) {
    const draft = await env.DB.prepare(
      'SELECT id FROM listing_drafts WHERE product_id = ? ORDER BY updated_at DESC LIMIT 1',
    )
      .bind(body.id)
      .first<{ id: string }>();
    if (!draft) return json({ error: 'Entwurf fehlt.' }, 404);
    await env.DB.prepare(
      'UPDATE locale_contents SET titles_json = COALESCE(?, titles_json), description = COALESCE(?, description), tags_json = COALESCE(?, tags_json), selected_title = COALESCE(?, selected_title), locked_json = COALESCE(?, locked_json), updated_at = ? WHERE draft_id = ? AND locale = ?',
    )
      .bind(
        body.titles ? JSON.stringify(body.titles) : null,
        body.description ?? null,
        body.tags ? JSON.stringify(body.tags) : null,
        body.selectedTitle ?? null,
        body.locked ? JSON.stringify(body.locked) : null,
        now(),
        draft.id,
        body.locale,
      )
      .run();
  }
  return json(await hydrate(body.id));
}

export async function DELETE(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const productId = new URL(request.url).searchParams.get('id');
  if (!productId) return json({ error: 'ID fehlt.' }, 400);
  await env.DB.prepare(
    "UPDATE products SET status = 'trash', updated_at = ? WHERE id = ?",
  )
    .bind(now(), productId)
    .run();
  await env.DB.prepare(
    'INSERT INTO change_history (id, entity_type, entity_id, action, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(makeId('chg'), 'product', productId, 'moved_to_trash', '{}', now())
    .run();
  return json({ trashed: productId });
}
