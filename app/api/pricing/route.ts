import { env } from 'cloudflare:workers';
import { requireInventoryManager, getInventoryUser } from '@/lib/inventory-bridge';
import { DEFAULT_PRICING_CONFIG } from '@/lib/pricing-config';
import {
  calculateBWarePrice,
  calculateDigitalRecommendation,
  calculatePhysicalRecommendation,
  type BWareInput,
  type DigitalPricingInput,
  type PhysicalPricingInput,
} from '@/lib/pricing-engine';

type JsonRecord = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseJson(value: unknown) {
  if (typeof value !== 'string') return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

function hydrateRows(rows: unknown[]) {
  return rows.map((value) => {
    const row = value as JsonRecord;
    return {
      ...row,
      ...(row.valueJson ? { value: parseJson(row.valueJson) } : {}),
      ...(row.licenseJson ? { license: parseJson(row.licenseJson) } : {}),
      ...(row.inputJson ? { input: parseJson(row.inputJson) } : {}),
      ...(row.resultJson ? { result: parseJson(row.resultJson) } : {}),
    };
  });
}

async function loadPricingData(productId?: string) {
  const filter = productId ? ' WHERE inventory_product_id = ?' : '';
  const bind = <T extends { bind: (...values: unknown[]) => T }>(statement: T) =>
    productId ? statement.bind(productId) : statement;
  const [profiles, assets, recommendations, bWare, outcomes, analysisJobs] = await Promise.all([
    bind(
      env.DB.prepare(
        `SELECT inventory_product_id AS inventoryProductId, asset_id AS assetId,
                product_kind AS productKind, market_category AS marketCategory,
                tier, shape_type AS shapeType, season, demand, competition,
                length_cm AS lengthCm, width_cm AS widthCm, height_cm AS heightCm,
                value_json AS valueJson, license_json AS licenseJson,
                updated_at AS updatedAt
         FROM pricing_product_profiles${filter}
         ORDER BY updated_at DESC`,
      ),
    ).all(),
    env.DB.prepare(
      `SELECT id, name, category, era, topic_cluster AS topicCluster,
              awareness, demand, competition, updated_at AS updatedAt
       FROM pricing_assets ORDER BY name COLLATE NOCASE`,
    ).all(),
    bind(
      env.DB.prepare(
        `SELECT id, inventory_product_id AS inventoryProductId,
                inventory_variant_id AS inventoryVariantId, channel,
                recommendation_kind AS recommendationKind,
                config_version AS configVersion, cogs_cents AS cogsCents,
                active_price_snapshot_cents AS activePriceSnapshotCents,
                recommended_price_cents AS recommendedPriceCents,
                input_json AS inputJson, result_json AS resultJson,
                status, market_change_id AS marketChangeId, created_at AS createdAt
         FROM pricing_recommendations${filter}
         ORDER BY created_at DESC LIMIT 100`,
      ),
    ).all(),
    bind(
      env.DB.prepare(
        `SELECT id, inventory_product_id AS inventoryProductId,
                inventory_variant_id AS inventoryVariantId, channel,
                affected_area AS affectedArea, input_json AS inputJson,
                result_json AS resultJson, created_at AS createdAt
         FROM b_ware_evaluations${filter}
         ORDER BY created_at DESC LIMIT 100`,
      ),
    ).all(),
    env.DB.prepare(
      `SELECT id, market_id AS marketId, expected_sales AS expectedSales,
              actual_sales AS actualSales, actual_revenue_cents AS actualRevenueCents,
              stand_fee_cents AS standFeeCents, travel_cost_cents AS travelCostCents,
              additional_cost_cents AS additionalCostCents,
              updated_at AS updatedAt
       FROM market_pricing_outcomes ORDER BY updated_at DESC`,
    ).all(),
    productId
      ? env.DB.prepare(
        `SELECT id,product_id AS productId,status,trigger_reason AS triggerReason,
                run_id AS runId,result_json AS resultJson,error_json AS errorJson,
                created_at AS createdAt,finished_at AS finishedAt
         FROM market_analysis_jobs WHERE product_id=?
         ORDER BY created_at DESC LIMIT 20`,
      ).bind(productId).all()
      : env.DB.prepare(
        `SELECT id,product_id AS productId,status,trigger_reason AS triggerReason,
                run_id AS runId,result_json AS resultJson,error_json AS errorJson,
                created_at AS createdAt,finished_at AS finishedAt
         FROM market_analysis_jobs ORDER BY created_at DESC LIMIT 20`,
      ).all(),
  ]);
  return {
    config: DEFAULT_PRICING_CONFIG,
    profiles: hydrateRows(profiles.results || []),
    assets: hydrateRows(assets.results || []),
    recommendations: hydrateRows(recommendations.results || []),
    bWareEvaluations: hydrateRows(bWare.results || []),
    marketOutcomes: hydrateRows(outcomes.results || []),
    marketAnalysisJobs: hydrateRows(analysisJobs.results || []),
  };
}

export async function GET(request: Request) {
  const denied = await requireInventoryManager(request);
  if (denied) return denied;
  try {
    const productId = new URL(request.url).searchParams.get('productId') || undefined;
    return Response.json(await loadPricingData(productId));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Pricing-Daten konnten nicht geladen werden.' },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireInventoryManager(request);
  if (denied) return denied;
  const user = await getInventoryUser(request);
  const body = (await request.json()) as JsonRecord;
  const action = text(body.action);
  const now = new Date().toISOString();
  try {
    if (action === 'save-profile') {
      const productId = text(body.productId);
      const profile = (body.profile || {}) as JsonRecord;
      if (!productId) return Response.json({ error: 'Artikel fehlt.' }, { status: 400 });
      await env.DB.prepare(
        `INSERT INTO pricing_product_profiles
          (inventory_product_id, asset_id, product_kind, market_category, tier,
           shape_type, season, demand, competition, length_cm, width_cm, height_cm, value_json,
           license_json, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(inventory_product_id) DO UPDATE SET
           asset_id=excluded.asset_id, product_kind=excluded.product_kind,
           market_category=excluded.market_category, tier=excluded.tier,
           shape_type=excluded.shape_type, season=excluded.season,
           demand=excluded.demand, competition=excluded.competition,
           length_cm=excluded.length_cm, width_cm=excluded.width_cm,
           height_cm=excluded.height_cm, value_json=excluded.value_json,
           license_json=excluded.license_json, updated_by=excluded.updated_by,
           updated_at=excluded.updated_at`,
      )
        .bind(
          productId,
          text(profile.assetId) || null,
          text(profile.productKind) || 'physical',
          text(profile.marketCategory) || null,
          text(profile.tier) || 'standard',
          text(profile.shapeType) || null,
          text(profile.season) || null,
          text(profile.demand) || 'unknown',
          text(profile.competition) || 'unknown',
          finite(profile.lengthCm),
          finite(profile.widthCm),
          finite(profile.heightCm),
          JSON.stringify(profile.value || {}),
          JSON.stringify(profile.license || {}),
          user?.id || null,
          now,
          now,
        )
        .run();
      return Response.json({ saved: true, ...(await loadPricingData(productId)) });
    }

    if (action === 'save-asset') {
      const asset = (body.asset || {}) as JsonRecord;
      const id = text(asset.id) || crypto.randomUUID();
      const name = text(asset.name).trim();
      if (!name) return Response.json({ error: 'Asset-Name fehlt.' }, { status: 400 });
      await env.DB.prepare(
        `INSERT INTO pricing_assets
          (id, name, category, era, topic_cluster, awareness, demand,
           competition, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name,
           category=excluded.category, era=excluded.era,
           topic_cluster=excluded.topic_cluster, awareness=excluded.awareness,
           demand=excluded.demand, competition=excluded.competition,
           updated_at=excluded.updated_at`,
      )
        .bind(
          id,
          name,
          text(asset.category) || null,
          text(asset.era) || null,
          text(asset.topicCluster) || null,
          text(asset.awareness) || null,
          text(asset.demand) || null,
          text(asset.competition) || null,
          now,
          now,
        )
        .run();
      return Response.json({ saved: true, id });
    }

    if (action === 'recommend-physical' || action === 'recommend-digital') {
      const productId = text(body.productId);
      const variantId = text(body.variantId) || null;
      if (!productId) return Response.json({ error: 'Artikel fehlt.' }, { status: 400 });
      const input = (body.input || {}) as PhysicalPricingInput | DigitalPricingInput;
      const result =
        action === 'recommend-physical'
          ? calculatePhysicalRecommendation(input as PhysicalPricingInput)
          : calculateDigitalRecommendation(input as DigitalPricingInput);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO pricing_recommendations
          (id, inventory_product_id, inventory_variant_id, channel,
           recommendation_kind, config_version, cogs_cents,
           active_price_snapshot_cents, recommended_price_cents,
           input_json, result_json, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          productId,
          variantId,
          text(input.channel),
          action === 'recommend-physical' ? 'physical' : 'digital',
          DEFAULT_PRICING_CONFIG.version,
          'cogs' in input && typeof input.cogs === 'number' ? Math.round(input.cogs * 100) : null,
          typeof body.activePrice === 'number' ? Math.round(body.activePrice * 100) : null,
          typeof result.recommendedPrice === 'number' ? Math.round(result.recommendedPrice * 100) : null,
          JSON.stringify(input),
          JSON.stringify(result),
          user?.id || null,
          now,
        )
        .run();
      return Response.json({ saved: true, id, result }, { status: 201 });
    }

    if (action === 'evaluate-bware') {
      const productId = text(body.productId);
      const variantId = text(body.variantId) || null;
      const affectedArea = text(body.affectedArea) || null;
      const input = body.input as BWareInput;
      if (!productId || !input) return Response.json({ error: 'B-Ware-Daten fehlen.' }, { status: 400 });
      const result = calculateBWarePrice(input);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO b_ware_evaluations
          (id, inventory_product_id, inventory_variant_id, channel,
           affected_area, input_json, result_json, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          productId,
          variantId,
          input.channel,
          affectedArea,
          JSON.stringify(input),
          JSON.stringify(result),
          user?.id || null,
          now,
        )
        .run();
      return Response.json({ saved: true, id, result }, { status: 201 });
    }

    if (action === 'save-market-outcome') {
      const outcome = (body.outcome || {}) as JsonRecord;
      const marketId = text(outcome.marketId);
      const expectedSales = finite(outcome.expectedSales);
      if (!marketId || expectedSales == null || expectedSales <= 0)
        return Response.json({ error: 'Markt und erwartete Verkäufe fehlen.' }, { status: 400 });
      const id = text(outcome.id) || crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO market_pricing_outcomes
          (id, market_id, expected_sales, actual_sales, actual_revenue_cents,
           stand_fee_cents, travel_cost_cents, additional_cost_cents,
           created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET expected_sales=excluded.expected_sales,
           actual_sales=excluded.actual_sales,
           actual_revenue_cents=excluded.actual_revenue_cents,
           stand_fee_cents=excluded.stand_fee_cents,
           travel_cost_cents=excluded.travel_cost_cents,
           additional_cost_cents=excluded.additional_cost_cents,
           updated_at=excluded.updated_at`,
      )
        .bind(
          id,
          marketId,
          Math.round(expectedSales),
          finite(outcome.actualSales) == null ? null : Math.round(Number(outcome.actualSales)),
          finite(outcome.actualRevenue) == null ? null : Math.round(Number(outcome.actualRevenue) * 100),
          Math.round(Number(outcome.standFee || 0) * 100),
          Math.round(Number(outcome.travelCost || 0) * 100),
          Math.round(Number(outcome.additionalCosts || 0) * 100),
          user?.id || null,
          now,
          now,
        )
        .run();
      return Response.json({ saved: true, id });
    }

    return Response.json({ error: 'Unbekannte Pricing-Aktion.' }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Pricing-Aktion fehlgeschlagen.' },
      { status: 400 },
    );
  }
}
