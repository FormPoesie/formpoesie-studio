import { env } from 'cloudflare:workers';

type NewsEntry = Record<string, unknown> & { id?: string; thema?: string };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(250, Math.max(1, Number(url.searchParams.get('limit')) || 100));
  const after = url.searchParams.get('after') || '';
  const category = url.searchParams.get('category') || '';
  const rows = await env.DB.prepare(
    `SELECT id, payload_json AS payloadJson, updated_at AS updatedAt
     FROM news_calendar_entries
     WHERE (? = '' OR event_date >= ?) AND (? = '' OR category = ?)
     ORDER BY event_date DESC, updated_at DESC LIMIT ?`,
  )
    .bind(after, after, category, category, limit)
    .all<{ id: string; payloadJson: string; updatedAt: string }>();
  const entries = (rows.results || []).flatMap((row) => {
    try {
      return [{ ...JSON.parse(row.payloadJson), id: row.id, updatedAt: row.updatedAt }];
    } catch {
      return [];
    }
  });
  return Response.json(
    { version: '1', count: entries.length, entries },
    { headers: { ...cors, 'Cache-Control': 'public, max-age=300' } },
  );
}

export async function POST(request: Request) {
  const secrets = env as unknown as Record<string, string | undefined>;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secrets.NEWS_API_KEY || token !== secrets.NEWS_API_KEY)
    return Response.json({ error: 'Nicht autorisiert.' }, { status: 401, headers: cors });
  const body = (await request.json().catch(() => ({}))) as { entry?: NewsEntry };
  const entry = body.entry;
  if (!entry?.thema)
    return Response.json({ error: 'Ein News-Eintrag mit Thema fehlt.' }, { status: 400, headers: cors });
  const id = String(entry.id || crypto.randomUUID());
  const now = new Date().toISOString();
  const text = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  await env.DB.prepare(
    `INSERT INTO news_calendar_entries
      (id, topic, category, organization, location, event_date, published_date,
       captured_at, source_name, source_url, summary, whats_new, relevance,
       confidence, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET topic=excluded.topic, category=excluded.category,
       payload_json=excluded.payload_json, updated_at=excluded.updated_at`,
  )
    .bind(
      id, text(entry.thema), text(entry.kategorie), text(entry.organisation) || null,
      text(entry.ort) || null, text(entry.ereignisDatum) || now.slice(0, 10),
      text(entry.veroeffentlichungsDatum) || null, text(entry.erfasstAm) || now,
      text(entry.quelleName) || null, text(entry.quelleUrl) || null,
      text(entry.zusammenfassung) || null, text(entry.wasIstNeu) || null,
      text(entry.relevanz) || null, text(entry.vertrauensniveau) || null,
      JSON.stringify({ ...entry, id }), now, now,
    )
    .run();
  return Response.json({ saved: true, id }, { status: 201, headers: cors });
}
