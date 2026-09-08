import { env } from 'cloudflare:workers';

export async function POST(request: Request) {
  const body = await request.json() as { productId: string; locale: 'de' | 'en'; market: string; source: string; rows: Array<{ phrase: string; demand?: number | null; competition?: number | null; relevance: number; intent: number; evidenceUrl?: string }> };
  if (!body.productId || !body.locale || !body.rows?.length) return Response.json({ error: 'Produkt, Sprache und mindestens eine Phrase sind erforderlich.' }, { status: 400 });
  const runId = 'res_' + crypto.randomUUID(), instant = new Date().toISOString();
  const statements = [
    env.DB.prepare('INSERT INTO research_runs (id, product_id, language, market, source, fetched_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(runId, body.productId, body.locale, body.market || (body.locale === 'de' ? 'DE' : 'US'), body.source || 'Manuelle Eingabe', instant, 'imported', instant, instant),
    ...body.rows.map((row) => env.DB.prepare('INSERT INTO keyword_candidates (id, research_run_id, phrase, demand, competition, relevance, intent, selected, evidence_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('kw_' + crypto.randomUUID(), runId, row.phrase.trim(), row.demand ?? null, row.competition ?? null, row.relevance, row.intent, false, row.evidenceUrl || null)),
  ];
  await env.DB.batch(statements);
  return Response.json({ runId, imported: body.rows.length }, { status: 201 });
}
