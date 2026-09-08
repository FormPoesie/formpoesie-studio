export const INVENTORY_APP_URL = 'https://formpoesie.expo.app';
export const INVENTORY_SUPABASE_URL =
  'https://udxxqdycgfaordrrfibu.supabase.co';
export const INVENTORY_SUPABASE_KEY =
  'sb_publishable_yAw5Bg7jxpPa-ddCR3GIrA_Vya3lKsQ';

export type InventoryItem = {
  id: number | string;
  modelName: string;
  productType: string;
  sku: string;
  material: string;
  size: string;
  widthMm: number | null;
  heightMm: number | null;
  depthMm: number | null;
  weightGrams: number | null;
  printHours: number | null;
  productionCost: number | null;
  currentPrice: number | null;
  stockQuantity: number;
  complete: boolean;
};

type UnknownRow = Record<string, unknown>;

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallback;
}

function rows(value: unknown) {
  return Array.isArray(value) ? (value as UnknownRow[]) : [];
}

export function normalizeInventoryProduct(product: UnknownRow): InventoryItem {
  const variants = rows(product.variants);
  const filaments = rows(product.filaments);
  const firstVariant = variants[0] || {};
  const materialNames = filaments
    .map((filament) => {
      const material =
        filament.material && typeof filament.material === 'object'
          ? (filament.material as UnknownRow)
          : {};
      return stringValue(material.name || material.label).trim();
    })
    .filter(Boolean);
  const variantMaterial =
    firstVariant.material && typeof firstVariant.material === 'object'
      ? stringValue((firstVariant.material as UnknownRow).name).trim()
      : '';
  const gramsFromParts = filaments.reduce(
    (sum, item) =>
      sum +
      (numberValue(item.grams) || 0) +
      (numberValue(item.waste_grams) || 0),
    0,
  );
  const weightGrams =
    gramsFromParts ||
    numberValue(firstVariant.grams) ||
    numberValue(product.filament_grams);
  const printMinutes =
    numberValue(product.print_minutes) ||
    numberValue(firstVariant.print_minutes) ||
    filaments.reduce(
      (sum, item) => sum + (numberValue(item.print_minutes) || 0),
      0,
    ) ||
    null;
  const productionCostCents =
    numberValue(product.production_cost_cents) ||
    numberValue(firstVariant.production_cost_cents);
  const priceCents =
    numberValue(product.default_price_cents) ||
    numberValue(firstVariant.price_cents);
  const size = stringValue(firstVariant.size || product.size).trim();
  const material = [...new Set([...materialNames, variantMaterial])]
    .filter(Boolean)
    .join(', ');
  const productionCost =
    productionCostCents == null ? null : productionCostCents / 100;
  const printHours = printMinutes == null ? null : printMinutes / 60;
  return {
    id: stringValue(product.id),
    modelName: stringValue(product.name, 'Unbenannter Artikel'),
    productType: stringValue(product.category, '3D-gedrucktes Objekt'),
    sku: stringValue(product.sku),
    material,
    size,
    widthMm: numberValue(product.width_mm),
    heightMm: numberValue(product.height_mm),
    depthMm: numberValue(product.depth_mm),
    weightGrams,
    printHours,
    productionCost,
    currentPrice: priceCents == null ? null : priceCents / 100,
    stockQuantity: numberValue(product.stock_quantity) || 0,
    complete: Boolean(material && weightGrams && printHours && productionCost),
  };
}

export function readCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') || '';
  const part = cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(name + '='));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
}

export function sessionCookie(
  request: Request,
  name: string,
  value: string,
  maxAge: number,
) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function inventoryHeaders(accessToken?: string) {
  return {
    apikey: INVENTORY_SUPABASE_KEY,
    Authorization: `Bearer ${accessToken || INVENTORY_SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function getInventoryUser(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  if (!accessToken) return null;
  const response = await fetch(INVENTORY_SUPABASE_URL + '/auth/v1/user', {
    headers: inventoryHeaders(accessToken),
  });
  return response.ok
    ? ((await response.json()) as { email?: string; id?: string })
    : null;
}

export async function requireInventoryAdmin(request: Request) {
  const user = await getInventoryUser(request);
  return user
    ? null
    : Response.json(
        { error: 'FormPoesie-Adminanmeldung erforderlich.' },
        { status: 401 },
      );
}
