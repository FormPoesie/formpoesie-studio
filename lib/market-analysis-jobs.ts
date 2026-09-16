import { runMarketIntelligence, type MarketRunnerBindings } from './market-intelligence-runner';

export const MARKET_ANALYSIS_PROMPT_VERSION = 'market-intelligence-final-v1';

type JobRow = {
  id: string;
  productId: string;
  productVersion: number;
};

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function researchFieldsChanged(
  previous: Record<string, unknown> | null,
  submitted: Record<string, unknown>,
  fields: ReadonlySet<string>,
) {
  if (!previous) return fields.size > 0;
  return Object.entries(submitted).some(
    ([key, value]) => fields.has(key) && JSON.stringify(previous[key] ?? null) !== JSON.stringify(value ?? null),
  );
}

export async function enqueueMarketAnalysis(
  env: MarketRunnerBindings,
  input: { productId: string; reason: 'FINAL_TRANSITION' | 'PRODUCT_CHANGED'; fingerprint: string },
) {
  const current = await env.DB.prepare(
    `SELECT research_version AS researchVersion,research_fingerprint AS researchFingerprint
     FROM inventory_product_metadata WHERE product_id=?`,
  ).bind(input.productId).first<{ researchVersion?: number; researchFingerprint?: string | null }>();
  if (input.reason === 'PRODUCT_CHANGED' && current?.researchFingerprint === input.fingerprint)
    return null;
  const productVersion = Math.max(0, Number(current?.researchVersion) || 0) + 1;
  const idempotencyKey = `${input.productId}:${productVersion}:${MARKET_ANALYSIS_PROMPT_VERSION}`;
  const id = `market_job_${(await digest(idempotencyKey)).slice(0, 24)}`;
  const instant = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE inventory_product_metadata
       SET research_version=?,research_fingerprint=?,updated_at=? WHERE product_id=?`,
    ).bind(productVersion, input.fingerprint, instant, input.productId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO market_analysis_jobs
       (id,product_id,product_version,prompt_version,idempotency_key,trigger_reason,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,'QUEUED',?,?)`,
    ).bind(id, input.productId, productVersion, MARKET_ANALYSIS_PROMPT_VERSION, idempotencyKey, input.reason, instant, instant),
  ]);
  return { id, productId: input.productId, productVersion };
}

export async function processMarketAnalysisJob(
  env: MarketRunnerBindings,
  job: JobRow,
  inventoryAccessToken?: string,
) {
  const startedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE market_analysis_jobs SET status='RUNNING',started_at=?,updated_at=?
     WHERE id=? AND status='QUEUED'`,
  ).bind(startedAt, startedAt, job.id).run();
  try {
    const result = await runMarketIntelligence(env, {
      inventoryAccessToken,
      productId: job.productId,
    });
    const finishedAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE market_analysis_jobs SET status=?,run_id=?,result_json=?,finished_at=?,updated_at=? WHERE id=?`,
    ).bind(
      result.status === 'SUCCESS'
        ? result.pricingImpacts > 0
          ? 'COMPLETED_PRICE_SIGNAL'
          : 'COMPLETED_NO_CHANGE'
        : result.status === 'PARTIAL'
          ? 'LOW_CONFIDENCE'
          : 'INSUFFICIENT_DATA',
      result.runId,
      JSON.stringify(result),
      finishedAt,
      finishedAt,
      job.id,
    ).run();
    return result;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'Market-Analyse fehlgeschlagen.';
    await env.DB.prepare(
      `UPDATE market_analysis_jobs SET status='FAILED',error_json=?,finished_at=?,updated_at=? WHERE id=?`,
    ).bind(JSON.stringify([{ message }]), finishedAt, finishedAt, job.id).run();
    throw error;
  }
}
