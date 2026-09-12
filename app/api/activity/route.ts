import { env } from 'cloudflare:workers';
import {
  getInventoryAccess,
  readCookie,
  requireInventoryAdmin,
} from '@/lib/inventory-bridge';
import { rebuildMonthlyProductHighlights } from '@/lib/monthly-product';

type Activity = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  sourceUrl: string | null;
  occurredAt: string;
  productId: string | null;
  calendarEntryId: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
};

function todayInBerlin() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function GET(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const accessToken = readCookie(request, 'fp_inventory_access');
  const access = await getInventoryAccess(request);
  if (accessToken && access.canManage) {
    await rebuildMonthlyProductHighlights(accessToken).catch(() => null);
  }
  const today = todayInBerlin();
  const [events, meta] = await Promise.all([
    env.DB.prepare(
      `SELECT id, kind, title, detail, source_url AS sourceUrl,
              occurred_at AS occurredAt,
              json_extract(payload_json, '$.productId') AS productId,
              json_extract(payload_json, '$.id') AS calendarEntryId,
              json_extract(payload_json, '$.bild.url') AS imageUrl,
              json_extract(payload_json, '$.bild.alt') AS imageAlt
       FROM activity_events
       WHERE substr(occurred_at, 1, 10) = ?
         AND (? = 1 OR kind != 'model-of-month')
       ORDER BY occurred_at DESC LIMIT 40`,
    )
      .bind(today, access.canManage ? 1 : 0)
      .all<Activity>(),
    env.DB.prepare(
      `SELECT key, value, updated_at AS updatedAt
       FROM news_calendar_meta WHERE key IN
       ('automation_status','automation_schedule','last_synced_at','last_result','last_new_count','last_today_count')`,
    ).all<{ key: string; value: string; updatedAt: string }>(),
  ]);
  return Response.json({
    events: events.results || [],
    automation: Object.fromEntries(
      (meta.results || []).map((item) => [item.key, item.value]),
    ),
  });
}
