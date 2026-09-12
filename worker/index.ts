import vinext from 'vinext/server/fetch-handler';
import { runMarketIntelligence } from '../lib/market-intelligence-runner';

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  INVENTORY_SUPABASE_SERVICE_ROLE_KEY?: string;
  MARKET_SEARCH_ENDPOINT?: string;
  MARKET_SEARCH_BEARER_TOKEN?: string;
};

function berlinParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    hour: '2-digit',
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
    if (parts.weekday === 'Mon' && parts.hour === '06')
      jobs.push(runMarketIntelligence(env));
    await Promise.all(jobs);
  },
} satisfies ExportedHandler<Bindings>;
