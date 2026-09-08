import { env } from 'cloudflare:workers';
import { requireInventoryManager } from '@/lib/inventory-bridge';

const defaultVoice =
  'Ruhig, geerdet, minimalistisch, hochwertig und künstlerisch. Kurze, verständliche Sätze. Einladen statt drängen.';
const defaultRules = [
  'Keine Verkaufsschreie, falsche Dringlichkeit oder Superlative.',
  'Material, Designherkunft und Eigenschaften nur auf bestätigter Grundlage.',
  'Produkt und Käuferabsicht stehen vor dem Herstellungsverfahren.',
  'Für Räume, die nach dir aussehen.',
];
const defaultPalette = [
  '#1a1a18',
  '#f5f0e8',
  '#e8e0d4',
  '#c8b89a',
  '#4a5c58',
  '#b5895a',
];

export async function GET(request: Request) {
  const denied = await requireInventoryManager(request);
  if (denied) return denied;
  const connections = (
    await env.DB.prepare(
      'SELECT * FROM integration_connections ORDER BY provider',
    ).all()
  ).results;
  const brand = await env.DB.prepare(
    'SELECT * FROM brand_profiles WHERE id = ?',
  )
    .bind('brand_formpoesie')
    .first<Record<string, unknown>>();
  return Response.json({
    connections,
    brand: brand
      ? {
          ...brand,
          rules: JSON.parse(String(brand.rules_json)),
          palette: JSON.parse(String(brand.palette_json)),
        }
      : {
          id: 'brand_formpoesie',
          name: 'FormPoesie',
          voice: defaultVoice,
          rules: defaultRules,
          palette: defaultPalette,
          saved: false,
        },
    confirmed: {
      etsy: {
        shopName: '3DFormPoesie',
        shopUrl: 'https://www.etsy.com/de/shop/3DFormPoesie',
        publicSnapshot: '85 Verkäufe · 28 Bewertungen · 28 Artikel',
        checkedAt: '2026-09-08',
      },
      inventory: {
        url: 'https://formpoesie.expo.app',
        status: 'login_required',
        importFallback: ['CSV', 'JSON'],
      },
    },
  });
}

export async function POST(request: Request) {
  const denied = await requireInventoryManager(request);
  if (denied) return denied;
  const body = (await request.json()) as {
    voice?: string;
    rules?: string[];
    palette?: string[];
    reset?: boolean;
  };
  const voice = body.reset ? defaultVoice : body.voice?.trim() || defaultVoice;
  const rules = body.reset
    ? defaultRules
    : body.rules?.map((rule) => rule.trim()).filter(Boolean) || defaultRules;
  const palette = body.reset
    ? defaultPalette
    : Array.isArray(body.palette) &&
        body.palette.length === defaultPalette.length &&
        body.palette.every((color) => /^#[0-9a-f]{6}$/i.test(color))
      ? body.palette
      : defaultPalette;
  const instant = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO brand_profiles (id, name, voice, palette_json, rules_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET voice = excluded.voice, palette_json = excluded.palette_json, rules_json = excluded.rules_json, updated_at = excluded.updated_at',
    ).bind(
      'brand_formpoesie',
      'FormPoesie',
      voice,
      JSON.stringify(palette),
      JSON.stringify(rules),
      instant,
      instant,
    ),
    env.DB.prepare(
      'INSERT INTO integration_connections (id, provider, shop_id, status, scopes_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET shop_id = excluded.shop_id, updated_at = excluded.updated_at',
    ).bind(
      'int_etsy',
      'etsy',
      '3DFormPoesie',
      'shop_confirmed_api_disconnected',
      '[]',
      instant,
      instant,
    ),
    env.DB.prepare(
      'INSERT INTO integration_connections (id, provider, shop_id, status, scopes_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at',
    ).bind(
      'int_inventory',
      'inventory_web',
      null,
      'login_required_import_available',
      '[]',
      instant,
      instant,
    ),
  ]);
  return Response.json({ saved: true, voice, rules, palette });
}
