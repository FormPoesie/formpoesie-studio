import { env } from 'cloudflare:workers';
import { requireInventoryAdmin } from '@/lib/inventory-bridge';

export type AccountItem = {
  id: string;
  group: 'subscription' | 'social' | 'license-monitor';
  name: string;
  url?: string;
  username?: string;
  email?: string;
  expiresAt?: string;
  ongoing?: boolean;
  profileUrl?: string;
  note?: string;
  licensed?: boolean;
  licenseExpiresAt?: string;
  monthlyPrice?: string;
  monitoringEnabled?: boolean;
  lastCheckedAt?: string;
  lastStatus?: string;
  lastHeadline?: string;
};

const defaults: AccountItem[] = [
  {
    id: 'higgsfield',
    group: 'subscription',
    name: 'Higgsfield AI',
    url: 'https://higgsfield.ai/',
    expiresAt: '2026-09-23',
  },
  {
    id: 'claude',
    group: 'subscription',
    name: 'Claude',
    url: 'https://claude.ai/',
    expiresAt: '2026-09-13',
  },
  {
    id: 'chatgpt',
    group: 'subscription',
    name: 'ChatGPT',
    url: 'https://chatgpt.com/',
    ongoing: true,
  },
  {
    id: 'instagram',
    group: 'social',
    name: 'Instagram',
    url: 'https://www.instagram.com/form.poesie/',
    username: 'form.poesie',
  },
  {
    id: 'tiktok',
    group: 'social',
    name: 'TikTok',
    url: 'https://www.tiktok.com/',
    email: 'formpoesie@gmail.com',
  },
  {
    id: 'pinterest',
    group: 'social',
    name: 'Pinterest',
    url: 'https://www.pinterest.de/3DFormPoesie/',
    username: '3DFormPoesie',
    email: 'formpoesie@gmail.com',
  },
  {
    id: 'paypal',
    group: 'social',
    name: 'PayPal',
    url: 'https://www.paypal.com/',
    email: 'formpoesie1@gmail.com',
  },
];

function safeItems(value: unknown): AccountItem[] {
  if (!Array.isArray(value)) return defaults;
  return value.filter((item): item is AccountItem =>
    Boolean(
      item &&
      typeof item === 'object' &&
      'id' in item &&
      'name' in item &&
      'group' in item,
    ),
  );
}

export async function GET(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const row = await env.DB.prepare(
    'SELECT scopes_json FROM integration_connections WHERE id = ?',
  )
    .bind('admin_accounts')
    .first<{ scopes_json: string }>();
  if (!row) return Response.json({ items: defaults, saved: false });
  try {
    return Response.json({
      items: safeItems(JSON.parse(row.scopes_json)),
      saved: true,
    });
  } catch {
    return Response.json({ items: defaults, saved: false });
  }
}

export async function POST(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const body = (await request.json()) as { items?: AccountItem[] };
  const items = safeItems(body.items).map((item) => ({
    ...item,
    // Passwords and tokens never belong in this general-purpose store.
    password: undefined,
    token: undefined,
  }));
  const instant = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO integration_connections
      (id, provider, shop_id, status, scopes_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       scopes_json = excluded.scopes_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      'admin_accounts',
      'admin_accounts',
      null,
      'configured_without_secrets',
      JSON.stringify(items),
      instant,
      instant,
    )
    .run();
  return Response.json({ items, saved: true });
}
