import { env } from 'cloudflare:workers';
import { readCookie, requireInventoryManager } from '@/lib/inventory-bridge';
import { runMarketIntelligence } from '@/lib/market-intelligence-runner';

type Row = Record<string, unknown>;

function parse(value: unknown, fallback: unknown) {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function hydrate(row: Row) {
  return {
    ...row,
    ...(row.errorJson ? { errors: parse(row.errorJson, []) } : {}),
    ...(row.auditJson ? { audit: parse(row.auditJson, {}) } : {}),
    ...(row.beforeJson ? { before: parse(row.beforeJson, null) } : {}),
    ...(row.afterJson ? { after: parse(row.afterJson, null) } : {}),
    ...(row.affectedProductIdsJson
      ? { affectedProductIds: parse(row.affectedProductIdsJson, []) }
      : {}),
    ...(row.affectedVariantIdsJson
      ? { affectedVariantIds: parse(row.affectedVariantIdsJson, []) }
      : {}),
    ...(row.sourcesJson ? { sources: parse(row.sourcesJson, []) } : {}),
    ...(row.explanationJson
      ? { explanations: parse(row.explanationJson, []) }
      : {}),
  };
}

export async function GET(request: Request) {
  const denied = await requireInventoryManager(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const productId = url.searchParams.get('productId');
  const clusterId = url.searchParams.get('clusterId');
  try {
    const [run, counts, clusters, changes, impacts] = await Promise.all([
      env.DB.prepare(
        `SELECT id,run_kind AS runKind,status,started_at AS startedAt,
                finished_at AS finishedAt,cluster_count AS clusterCount,
                query_count AS queryCount,found_count AS foundCount,
                rejected_count AS rejectedCount,comparable_count AS comparableCount,
                snapshot_count AS snapshotCount,change_count AS changeCount,
                pricing_impact_count AS pricingImpactCount,error_json AS errorJson,
                audit_json AS auditJson
         FROM market_research_runs ORDER BY started_at DESC LIMIT 1`,
      ).first<Row>(),
      env.DB.prepare(
        `SELECT
           (SELECT COUNT(*) FROM market_clusters WHERE status='NEW') AS newSegments,
           (SELECT COUNT(*) FROM market_clusters WHERE last_valid_snapshot_id IS NULL) AS lowDataClusters,
           (SELECT COUNT(*) FROM market_snapshots WHERE trend_state='CONFIRMED_TREND') AS confirmedTrends,
           (SELECT COUNT(*) FROM market_snapshots WHERE trend_state='REJECTED_TREND') AS rejectedTrends,
           (SELECT COUNT(*) FROM pricing_impacts WHERE status='REVIEW_REQUIRED') AS pricingUpdates`,
      ).first<Row>(),
      env.DB.prepare(
        `SELECT c.id,c.label,c.dimension,c.level,c.status,
                c.research_frequency AS researchFrequency,
                c.research_priority AS researchPriority,
                c.last_researched_at AS lastResearchedAt,
                s.confidence,s.sample_size AS sampleSize,s.effective_sample_size AS effectiveSampleSize,
                s.median_cents AS medianCents,s.demand_score AS demandScore,
                s.competition_score AS competitionScore,s.adjusted_trend AS trendScore,
                s.trend_state AS trendState
         FROM market_clusters c
         LEFT JOIN market_snapshots s ON s.id=c.last_valid_snapshot_id
         ${productId ? 'JOIN market_cluster_products cp ON cp.cluster_id=c.id WHERE cp.product_id=?' : clusterId ? 'WHERE c.id=?' : ''}
         ORDER BY c.research_priority DESC,c.label COLLATE NOCASE LIMIT 100`,
      )
        .bind(...(productId ? [productId] : clusterId ? [clusterId] : []))
        .all<Row>(),
      env.DB.prepare(
        `SELECT id,cluster_id AS clusterId,previous_snapshot_id AS previousSnapshotId,
                current_snapshot_id AS currentSnapshotId,change_type AS changeType,
                confidence,before_json AS beforeJson,after_json AS afterJson,
                affected_product_ids_json AS affectedProductIdsJson,
                affected_variant_ids_json AS affectedVariantIdsJson,sources_json AS sourcesJson,
                explanation_json AS explanationJson,detected_at AS detectedAt
         FROM market_changes
         ${productId ? 'WHERE EXISTS (SELECT 1 FROM json_each(affected_product_ids_json) WHERE value=?)' : clusterId ? 'WHERE cluster_id=?' : "WHERE change_type IN ('RELEVANT_CHANGE','MAJOR_CHANGE')"}
         ORDER BY detected_at DESC LIMIT 50`,
      )
        .bind(...(productId ? [productId] : clusterId ? [clusterId] : []))
        .all<Row>(),
      env.DB.prepare(
        `SELECT id,market_change_id AS marketChangeId,product_id AS productId,
                variant_id AS variantId,channel,
                previous_recommendation_cents AS previousRecommendationCents,
                new_recommendation_cents AS newRecommendationCents,
                absolute_difference_cents AS absoluteDifferenceCents,
                percentage_difference AS percentageDifference,status,created_at AS createdAt
         FROM pricing_impacts ${productId ? 'WHERE product_id=?' : ''}
         ORDER BY created_at DESC LIMIT 100`,
      )
        .bind(...(productId ? [productId] : []))
        .all<Row>(),
    ]);
    return Response.json({
      lastRun: run ? hydrate(run) : null,
      counts: counts || {},
      clusters: clusters.results || [],
      changes: (changes.results || []).map(hydrate),
      pricingImpacts: impacts.results || [],
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Market Watch konnte nicht geladen werden.',
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireInventoryManager(request);
  if (denied) return denied;
  const accessToken = readCookie(request, 'fp_inventory_access');
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      changeId?: string;
      maxClusters?: number;
      productId?: string;
    };
    if (body.action === 'ignore-change') {
      if (!body.changeId)
        return Response.json(
          { error: 'Marktänderung fehlt.' },
          { status: 400 },
        );
      await env.DB.prepare(
        "UPDATE pricing_impacts SET status='IGNORED' WHERE market_change_id=?",
      )
        .bind(body.changeId)
        .run();
      return Response.json({ ignored: true, changeId: body.changeId });
    }
    const result = await runMarketIntelligence(env, {
      inventoryAccessToken: accessToken,
      maxClusters:
        typeof body.maxClusters === 'number' ? body.maxClusters : undefined,
      productId:
        typeof body.productId === 'string' && body.productId.trim()
          ? body.productId.trim()
          : undefined,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Market-Intelligence-Lauf fehlgeschlagen.',
      },
      { status: 502 },
    );
  }
}
