import { env } from 'cloudflare:workers';
import { requireInventoryAdmin } from '@/lib/inventory-bridge';

const CALENDAR_DATA_URL =
  'https://formpoesie.github.io/formpoesie-themen-kalender/data.json';

type CalendarEntry = Record<string, unknown> & {
  id?: string;
  thema?: string;
  kategorie?: string;
  ereignisDatum?: string;
};

function berlinDate(value: Date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function berlinHour(value: Date = new Date()) {
  return Number(
    new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(value),
  );
}

type CalendarArchive = {
  meta?: Record<string, unknown>;
  eintraege?: CalendarEntry[];
};

type CalendarRow = { id: string; payloadJson: string };
type MetaRow = { key: string; value: string; updatedAt: string };

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function entryId(entry: CalendarEntry) {
  return text(entry.id || entry.storyId) || crypto.randomUUID();
}

async function saveMeta(key: string, value: string, instant: string) {
  await env.DB.prepare(
    `INSERT INTO news_calendar_meta (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(key, value, instant)
    .run();
}

async function syncCalendar() {
  const response = await fetch(CALENDAR_DATA_URL, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok)
    throw new Error('Die Kalenderquelle ist gerade nicht erreichbar.');
  const archive = (await response.json()) as CalendarArchive;
  if (!Array.isArray(archive.eintraege))
    throw new Error('Die Kalenderquelle hat ein unbekanntes Format.');

  const existing = await env.DB.prepare(
    'SELECT id, payload_json AS payloadJson FROM news_calendar_entries',
  ).all<{ id: string; payloadJson: string }>();
  const existingIds = new Set((existing.results || []).map((item) => item.id));
  const manuallyEditedIds = new Set(
    (existing.results || [])
      .filter((item) => {
        try {
          return Boolean(
            (JSON.parse(item.payloadJson) as Record<string, unknown>)
              .masterbrainEditedAt,
          );
        } catch {
          return false;
        }
      })
      .map((item) => item.id),
  );
  const instant = new Date().toISOString();
  const today = berlinDate();
  const todayCount = archive.eintraege.filter(
    (entry) => text(entry.erfasstAm).slice(0, 10) === today,
  ).length;
  const newEntries: CalendarEntry[] = [];
  const statements = archive.eintraege.map((entry) => {
    const id = entryId(entry);
    if (!existingIds.has(id)) newEntries.push({ ...entry, id });
    if (manuallyEditedIds.has(id)) return env.DB.prepare('SELECT 1');
    return env.DB.prepare(
      `INSERT INTO news_calendar_entries
        (id, topic, category, organization, location, event_date,
         published_date, captured_at, source_name, source_url, summary,
         whats_new, relevance, confidence, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         topic=excluded.topic, category=excluded.category,
         organization=excluded.organization, location=excluded.location,
         event_date=excluded.event_date, published_date=excluded.published_date,
         captured_at=excluded.captured_at, source_name=excluded.source_name,
         source_url=excluded.source_url, summary=excluded.summary,
         whats_new=excluded.whats_new, relevance=excluded.relevance,
         confidence=excluded.confidence, payload_json=excluded.payload_json,
         updated_at=excluded.updated_at`,
    ).bind(
      id,
      text(entry.thema),
      text(entry.kategorie),
      text(entry.organisation) || null,
      text(entry.ort) || null,
      text(entry.ereignisDatum),
      text(entry.veroeffentlichungsDatum) || null,
      text(entry.erfasstAm) || null,
      text(entry.quelleName) || null,
      text(entry.quelleUrl) || null,
      text(entry.zusammenfassung) || null,
      text(entry.wasIstNeu) || null,
      text(entry.relevanz || entry.endnutzerRelevanz) || null,
      text(entry.vertrauensniveau) || null,
      JSON.stringify({ ...entry, id }),
      instant,
      instant,
    );
  });

  for (let index = 0; index < statements.length; index += 75)
    await env.DB.batch(statements.slice(index, index + 75));

  const activity = newEntries.map((entry) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO activity_events
        (id, kind, title, detail, source_url, occurred_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      'news-' + entryId(entry),
      'calendar-news',
      text(entry.thema),
      [text(entry.kategorie), text(entry.organisation)]
        .filter(Boolean)
        .join(' · ') || null,
      text(entry.quelleUrl) || null,
      instant,
      JSON.stringify(entry),
    ),
  );
  for (let index = 0; index < activity.length; index += 75)
    await env.DB.batch(activity.slice(index, index + 75));

  await Promise.all([
    saveMeta('source_meta', JSON.stringify(archive.meta || {}), instant),
    saveMeta('last_synced_at', instant, instant),
    saveMeta('last_result', 'success', instant),
    saveMeta('last_new_count', String(newEntries.length), instant),
    saveMeta('last_today_count', String(todayCount), instant),
    saveMeta('automation_status', 'ACTIVE', instant),
    saveMeta('automation_schedule', 'Täglich ab 20:00 Uhr', instant),
  ]);
  return {
    imported: archive.eintraege.length,
    added: newEntries.length,
    todayCount,
  };
}

async function loadCalendar() {
  const [entryRows, metaRows] = await Promise.all([
    env.DB.prepare(
      `SELECT id, payload_json AS payloadJson
       FROM news_calendar_entries ORDER BY event_date ASC, topic ASC`,
    ).all<CalendarRow>(),
    env.DB.prepare(
      `SELECT key, value, updated_at AS updatedAt FROM news_calendar_meta`,
    ).all<MetaRow>(),
  ]);
  const metaMap = Object.fromEntries(
    (metaRows.results || []).map((row) => [row.key, row.value]),
  );
  let sourceMeta: Record<string, unknown> = {};
  try {
    sourceMeta = JSON.parse(metaMap.source_meta || '{}') as Record<
      string,
      unknown
    >;
  } catch {
    sourceMeta = {};
  }
  return {
    meta: {
      ...sourceMeta,
      masterbrainSync: {
        status: metaMap.automation_status || 'ACTIVE',
        schedule: metaMap.automation_schedule || 'Täglich ab 20:00 Uhr',
        lastSyncedAt: metaMap.last_synced_at || '',
        lastResult: metaMap.last_result || 'pending',
        importedCount: Number(metaMap.last_new_count || 0),
        todayCount: Number(metaMap.last_today_count || 0),
      },
    },
    eintraege: (entryRows.results || []).flatMap((row) => {
      try {
        return [JSON.parse(row.payloadJson) as CalendarEntry];
      } catch {
        return [];
      }
    }),
  };
}

export async function GET(request: Request) {
  const forceSync = new URL(request.url).searchParams.get('sync') === '1';
  try {
    const [count, lastSync] = await Promise.all([
      env.DB.prepare(
        'SELECT COUNT(*) AS count FROM news_calendar_entries',
      ).first<{ count: number }>(),
      env.DB.prepare(
        `SELECT value FROM news_calendar_meta WHERE key = 'last_synced_at'`,
      ).first<{ value: string }>(),
    ]);
    const dueAfterEight =
      berlinHour() >= 20 &&
      (!lastSync?.value || berlinDate(new Date(lastSync.value)) !== berlinDate());
    let syncResult: {
      imported: number;
      added: number;
      todayCount: number;
    } | null = null;
    if (forceSync || dueAfterEight || !Number(count?.count || 0))
      syncResult = await syncCalendar();
    return Response.json(
      { ...(await loadCalendar()), syncResult },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const instant = new Date().toISOString();
    await saveMeta('last_result', 'failed', instant).catch(() => undefined);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Der News-Kalender ist gerade nicht erreichbar.',
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const body = (await request.json()) as { entry?: CalendarEntry };
  if (!body.entry?.thema || !body.entry.kategorie || !body.entry.ereignisDatum)
    return Response.json(
      { error: 'Thema, Kategorie und Ereignisdatum sind erforderlich.' },
      { status: 400 },
    );
  const instant = new Date().toISOString();
  const entry: CalendarEntry = {
    ...body.entry,
    id: entryId(body.entry),
    masterbrainEditedAt: instant,
  };
  await env.DB.prepare(
    `INSERT INTO news_calendar_entries
      (id, topic, category, organization, location, event_date,
       published_date, captured_at, source_name, source_url, summary,
       whats_new, relevance, confidence, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET topic=excluded.topic,
       category=excluded.category, organization=excluded.organization,
       location=excluded.location, event_date=excluded.event_date,
       published_date=excluded.published_date, captured_at=excluded.captured_at,
       source_name=excluded.source_name, source_url=excluded.source_url,
       summary=excluded.summary, whats_new=excluded.whats_new,
       relevance=excluded.relevance, confidence=excluded.confidence,
       payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
  )
    .bind(
      entry.id,
      text(entry.thema),
      text(entry.kategorie),
      text(entry.organisation) || null,
      text(entry.ort) || null,
      text(entry.ereignisDatum),
      text(entry.veroeffentlichungsDatum) || null,
      text(entry.erfasstAm) || null,
      text(entry.quelleName) || null,
      text(entry.quelleUrl) || null,
      text(entry.zusammenfassung) || null,
      text(entry.wasIstNeu) || null,
      text(entry.relevanz || entry.endnutzerRelevanz) || null,
      text(entry.vertrauensniveau) || null,
      JSON.stringify(entry),
      instant,
      instant,
    )
    .run();
  return Response.json({ saved: true, entry });
}
