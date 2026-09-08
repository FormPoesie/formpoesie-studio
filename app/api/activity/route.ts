import { env } from 'cloudflare:workers';
import { requireInventoryAdmin } from '@/lib/inventory-bridge';

type Activity = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  sourceUrl: string | null;
  occurredAt: string;
};

export async function GET(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const [events, meta] = await Promise.all([
    env.DB.prepare(
      `SELECT id, kind, title, detail, source_url AS sourceUrl,
              occurred_at AS occurredAt
       FROM activity_events
       WHERE kind != 'calendar-news'
          OR json_extract(payload_json, '$.erfasstAm') = date('now')
       ORDER BY occurred_at DESC LIMIT 40`,
    ).all<Activity>(),
    env.DB.prepare(
      `SELECT key, value, updated_at AS updatedAt
       FROM news_calendar_meta WHERE key IN
       ('automation_status','automation_schedule','last_synced_at','last_result','last_new_count')`,
    ).all<{ key: string; value: string; updatedAt: string }>(),
  ]);
  return Response.json({
    events: events.results || [],
    automation: Object.fromEntries(
      (meta.results || []).map((item) => [item.key, item.value]),
    ),
  });
}
