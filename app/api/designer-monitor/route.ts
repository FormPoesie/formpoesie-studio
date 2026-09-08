import { env } from 'cloudflare:workers';
import { requireInventoryManager } from '@/lib/inventory-bridge';
import type { AccountItem } from '@/app/api/accounts/route';

type Snapshot = {
  accountId: string;
  fingerprint: string;
  headline: string | null;
};

function allowedProfile(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'makerworld.com' ||
        url.hostname.endsWith('.makerworld.com') ||
        url.hostname === 'patreon.com' ||
        url.hostname.endsWith('.patreon.com'))
    );
  } catch {
    return false;
  }
}

function normalizeText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function pageSignal(html: string, platform: string) {
  const linkPattern =
    platform === 'Patreon'
      ? /href=["']([^"']*\/(?:posts|join)\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi
      : /href=["']([^"']*\/(?:models|model)\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const matches: Array<{ href: string; title: string }> = [];
  for (const match of html.matchAll(linkPattern)) {
    const href = match[1];
    const title = normalizeText(match[2]);
    if (!matches.some((item) => item.href === href))
      matches.push({ href, title });
    if (matches.length >= 50) break;
  }
  if (matches.length) {
    return {
      signal: matches
        .map((item) => item.href)
        .sort()
        .join('\n'),
      headline: matches.find((item) => item.title)?.title || matches[0].href,
    };
  }
  const title = normalizeText(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '',
  );
  return { signal: title, headline: title };
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function runMonitor() {
  const row = await env.DB.prepare(
    'SELECT scopes_json FROM integration_connections WHERE id = ?',
  )
    .bind('admin_accounts')
    .first<{ scopes_json: string }>();
  const items = row ? (JSON.parse(row.scopes_json) as AccountItem[]) : [];
  const targets = items.filter(
    (item) =>
      item.group === 'license-monitor' &&
      item.monitoringEnabled !== false &&
      Boolean(item.profileUrl) &&
      allowedProfile(item.profileUrl || ''),
  );
  const instant = new Date().toISOString();
  const results: Array<{
    id: string;
    status: 'success' | 'failed';
    changed: boolean;
    headline?: string;
    error?: string;
  }> = [];

  for (const target of targets) {
    try {
      const response = await fetch(target.profileUrl || '', {
        headers: {
          Accept: 'text/html',
          'User-Agent': 'FormPoesie-Masterbrain-Monitor/1.0',
        },
        redirect: 'manual',
      });
      if (!response.ok)
        throw new Error('Profil antwortet mit Status ' + response.status + '.');
      const html = await response.text();
      const page = pageSignal(html, target.note || 'MakerWorld');
      if (!page.signal)
        throw new Error('Keine Modellliste auf dem Profil erkannt.');
      const fingerprint = await hash(page.signal);
      const previous = await env.DB.prepare(
        `SELECT account_id AS accountId, fingerprint, headline
         FROM monitor_snapshots WHERE account_id = ?`,
      )
        .bind(target.id)
        .first<Snapshot>();
      const changed = Boolean(previous && previous.fingerprint !== fingerprint);
      await env.DB.prepare(
        `INSERT INTO monitor_snapshots
          (account_id, profile_url, fingerprint, headline, checked_at, changed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           profile_url=excluded.profile_url, fingerprint=excluded.fingerprint,
           headline=excluded.headline, checked_at=excluded.checked_at,
           changed_at=excluded.changed_at`,
      )
        .bind(
          target.id,
          target.profileUrl,
          fingerprint,
          page.headline || null,
          instant,
          changed ? instant : previous ? null : instant,
        )
        .run();
      if (changed) {
        await env.DB.prepare(
          `INSERT INTO activity_events
            (id, kind, title, detail, source_url, occurred_at, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            crypto.randomUUID(),
            'designer-model',
            `Neues Modell bei ${target.name}`,
            page.headline ||
              `${target.note || 'Designer'}-Profil wurde aktualisiert.`,
            target.profileUrl,
            instant,
            JSON.stringify({ accountId: target.id, fingerprint }),
          )
          .run();
      }
      target.lastCheckedAt = instant;
      target.lastStatus = 'success';
      target.lastHeadline = page.headline || '';
      results.push({
        id: target.id,
        status: 'success',
        changed,
        headline: page.headline,
      });
    } catch (error) {
      target.lastCheckedAt = instant;
      target.lastStatus = 'failed';
      results.push({
        id: target.id,
        status: 'failed',
        changed: false,
        error:
          error instanceof Error ? error.message : 'Prüfung fehlgeschlagen.',
      });
    }
  }

  if (row) {
    await env.DB.prepare(
      `UPDATE integration_connections SET scopes_json = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(JSON.stringify(items), instant, 'admin_accounts')
      .run();
  }
  return { checkedAt: instant, checked: targets.length, results };
}

export async function POST(request: Request) {
  const scheduled = new URL(request.url).searchParams.get('scheduled') === '1';
  if (!scheduled) {
    const denied = await requireInventoryManager(request);
    if (denied) return denied;
  }
  try {
    return Response.json(await runMonitor());
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Designer-Prüfung fehlgeschlagen.',
      },
      { status: 502 },
    );
  }
}
