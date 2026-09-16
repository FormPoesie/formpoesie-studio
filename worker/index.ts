import vinext from 'vinext/server/fetch-handler';
import { runMarketIntelligence } from '../lib/market-intelligence-runner';
import { processMarketAnalysisJob } from '../lib/market-analysis-jobs';

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  INVENTORY_SUPABASE_SERVICE_ROLE_KEY?: string;
  MARKET_SEARCH_ENDPOINT?: string;
  MARKET_SEARCH_BEARER_TOKEN?: string;
  SERPER_API_KEY?: string;
  NEWS_API_KEY?: string;
};

function berlinParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export default {
  fetch(request, env, context) {
    return vinext.fetch(request, env, context);
  },
  async scheduled(controller, env, context) {
    // The trigger runs hourly so daylight-saving time is handled in Berlin time.
    const parts = berlinParts(new Date(controller.scheduledTime));
    const jobs: Promise<unknown>[] = [];
    const queued = await env.DB.prepare(
      "SELECT id,product_id AS productId,product_version AS productVersion FROM market_analysis_jobs WHERE status='QUEUED' ORDER BY created_at LIMIT 3",
    ).all<{ id: string; productId: string; productVersion: number }>();
    for (const job of queued.results || [])
      jobs.push(processMarketAnalysisJob(env, job));
    if (parts.hour === '20') {
      jobs.push(
        vinext
          .fetch(
            new Request(
              'https://formpoesie-masterbrain.internal/api/designer-monitor?scheduled=1',
              { method: 'POST' },
            ),
            env,
            context,
          )
          .then(async (response: Response) => {
            if (response.ok) return;
            const result = (await response.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(
              result.error ||
                `Automatische Designer-Prüfung: Status ${response.status}`,
            );
          }),
      );
    }
    if (parts.weekday === 'Mon' && parts.hour === '06' && parts.minute === '00') {
      const lockKey = `market-weekly:${parts.year}-${parts.month}-${parts.day}`;
      const lock = await env.DB.prepare(
        `INSERT OR IGNORE INTO automation_run_locks (lock_key,created_at)
         VALUES (?,?)`,
      )
        .bind(lockKey, new Date(controller.scheduledTime).toISOString())
        .run();
      if ((lock.meta.changes || 0) > 0) jobs.push(runMarketIntelligence(env));
    }
    await Promise.all(jobs);
  },
} satisfies ExportedHandler<Bindings>;
