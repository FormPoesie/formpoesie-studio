export const INVENTORY_APP_URL = 'https://formpoesie.expo.app';
export const INVENTORY_SUPABASE_URL =
  'https://udxxqdycgfaordrrfibu.supabase.co';
export const INVENTORY_SUPABASE_KEY =
  'sb_publishable_yAw5Bg7jxpPa-ddCR3GIrA_Vya3lKsQ';

export type InventoryVariant = {
  id: number | string;
  name: string;
  sku: string;
  material: string;
  size: string;
  color: string;
  setSize: number;
  weightGrams: number | null;
  printHours: number | null;
  productionCost: number | null;
  currentPrice: number | null;
};

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
  category: string;
  imagePath: string;
  designOrigin: string;
  buyerWorld:
    | 'Kunst & Skulptur'
    | 'Dark & Gothic'
    | 'Botanical'
    | 'Functional Art';
  variants: InventoryVariant[];
  updatedAt: string;
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

export type InventoryReviewStatus = 'draft' | 'final' | 'customer_order';

export function inventoryReviewStatus(value: unknown): InventoryReviewStatus {
  const normalized = stringValue(value).trim().toLocaleLowerCase('de');
  if (normalized === 'final') return 'final';
  if (normalized === 'customer_order') return 'customer_order';
  return 'draft';
}

function rows(value: unknown) {
  return Array.isArray(value) ? (value as UnknownRow[]) : [];
}

function materialName(row: UnknownRow) {
  const material =
    row.material && typeof row.material === 'object'
      ? (row.material as UnknownRow)
      : {};
  return stringValue(material.name || material.label).trim();
}

export function buyerWorldFromCategory(
  category: unknown,
): InventoryItem['buyerWorld'] {
  const value = stringValue(category).toLocaleLowerCase('de');
  if (/halloween|goth|dunkel|horror|myth|drache|dämon|totenkopf/.test(value))
    return 'Dark & Gothic';
  if (/pflanz|botani|blume|garten|natur|tier/.test(value)) return 'Botanical';
  if (
    /funktion|halter|aufbewahr|organis|küche|bad|lampe|dose|schale/.test(value)
  )
    return 'Functional Art';
  return 'Kunst & Skulptur';
}

function designOriginFromProduct(product: UnknownRow) {
  const license = product.commercial_license;
  const designer =
    product.designer && typeof product.designer === 'object'
      ? stringValue((product.designer as UnknownRow).name).trim()
      : '';
  if (typeof license === 'string' && license.trim()) {
    const normalized = license.trim();
    if (/^(true|yes|ja)$/i.test(normalized))
      return designer ? `Lizenz von ${designer}` : 'Kommerzielle Lizenz';
    if (/^(false|no|nein)$/i.test(normalized))
      return designer
        ? `Entwurf von ${designer} · Lizenzstatus prüfen`
        : 'Eigenes Design';
    return designer ? `${designer} · ${normalized}` : normalized;
  }
  if (license === true)
    return designer ? `Lizenz von ${designer}` : 'Kommerzielle Lizenz';
  if (designer) return `Entwurf von ${designer} · Lizenzstatus prüfen`;
  return license === false ? 'Eigenes Design' : '';
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
  const normalizedVariants: InventoryVariant[] = variants.map(
    (variant, index) => {
      const variantFilaments = filaments.filter(
        (filament) =>
          stringValue(
            filament.product_variant_id || filament.productVariantId,
          ) === stringValue(variant.id),
      );
      const variantWeight =
        variantFilaments.reduce(
          (sum, item) =>
            sum +
            (numberValue(item.grams) || 0) +
            (numberValue(item.waste_grams) || 0),
          0,
        ) || numberValue(variant.grams);
      const variantMinutes =
        numberValue(variant.print_minutes) ||
        variantFilaments.reduce(
          (sum, item) => sum + (numberValue(item.print_minutes) || 0),
          0,
        ) ||
        null;
      const variantCost = numberValue(variant.production_cost_cents);
      const variantPrice = numberValue(variant.price_cents);
      return {
        id: stringValue(variant.id, `variant-${index + 1}`),
        name: stringValue(
          variant.name || variant.size,
          `Variante ${index + 1}`,
        ),
        sku: stringValue(variant.sku),
        material: materialName(variant) || material,
        size: stringValue(variant.size).trim(),
        color: stringValue(variant.appearance || variant.color).trim(),
        setSize: numberValue(variant.quantity) || 1,
        weightGrams: variantWeight,
        printHours: variantMinutes == null ? null : variantMinutes / 60,
        productionCost: variantCost == null ? null : variantCost / 100,
        currentPrice: variantPrice == null ? null : variantPrice / 100,
      };
    },
  );
  if (!normalizedVariants.length) {
    normalizedVariants.push({
      id: 'standard',
      name: size || 'Standard',
      sku: stringValue(product.sku),
      material,
      size,
      color: '',
      setSize: 1,
      weightGrams,
      printHours,
      productionCost,
      currentPrice: priceCents == null ? null : priceCents / 100,
    });
  }
  const category = stringValue(product.category, '3D-gedrucktes Objekt');
  return {
    id: stringValue(product.id),
    modelName: stringValue(product.name, 'Unbenannter Artikel'),
    productType: category,
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
    category,
    imagePath: stringValue(
      variants.find((variant) => stringValue(variant.image_url))?.image_url ||
        product.image_uri,
    ),
    designOrigin: designOriginFromProduct(product),
    buyerWorld: buyerWorldFromCategory(category),
    variants: normalizedVariants,
    updatedAt: stringValue(product.updated_at || product.created_at),
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
  const forwardedProtocol = (request.headers.get('x-forwarded-proto') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const secureRequest =
    forwardedProtocol === 'https' || /^https:\/\//i.test(request.url || '');
  const secure = secureRequest ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function requestUrl(request: Request) {
  try {
    return new URL(request.url);
  } catch {
    const forwardedProtocol = (request.headers.get('x-forwarded-proto') || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    const protocol = forwardedProtocol === 'https' ? 'https' : 'http';
    const host =
      request.headers.get('x-forwarded-host') ||
      request.headers.get('host') ||
      'formpoesie.local';
    const path = request.url?.startsWith('/')
      ? request.url
      : `/${request.url || ''}`;
    return new URL(path, `${protocol}://${host}`);
  }
}

export function inventoryHeaders(accessToken?: string) {
  return {
    apikey: INVENTORY_SUPABASE_KEY,
    Authorization: `Bearer ${accessToken || INVENTORY_SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

const studioAccessName = 'fp_inventory_access';

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

async function studioSignature(payload: string) {
  const secret = process.env.STUDIO_SESSION_SECRET;
  if (!secret) return '';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64Url(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)),
    ),
  );
}

export async function createStudioSession(email: string) {
  const payload = base64Url(
    new TextEncoder().encode(
      JSON.stringify({ email, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }),
    ),
  );
  return `${payload}.${await studioSignature(payload)}`;
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export async function getInventoryUser(request: Request) {
  const token = readCookie(request, studioAccessName);
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = await studioSignature(payload);
  if (!expected || signature !== expected) return null;
  try {
    const session = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payload)),
    ) as { email?: string; exp?: number };
    if (!session.email || !session.exp || session.exp <= Date.now())
      return null;
    return { id: 'studio-owner', email: session.email };
  } catch {
    return null;
  }
}

export type InventoryProfile = {
  id?: string;
  name?: string;
  role?: string;
};

export async function getInventoryProfile(
  accessToken: string,
  userId?: string,
) {
  if (userId === 'studio-owner')
    return { id: userId, name: 'FormPoesie', role: 'owner' };
  if (!accessToken || !userId) return null;
  const response = await fetch(
    `${INVENTORY_SUPABASE_URL}/rest/v1/profiles?select=id,name,role&id=eq.${encodeURIComponent(userId)}&limit=1`,
    { headers: inventoryHeaders(accessToken), cache: 'no-store' },
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as InventoryProfile[];
  return rows[0] || null;
}

export function canManageInventory(
  user: { email?: string; id?: string } | null,
  profile: InventoryProfile | null,
) {
  const role = (profile?.role || '').trim().toLocaleLowerCase('de');
  if (role)
    return ['inhaber', 'inhaber/in', 'admin', 'owner', 'verwaltung'].includes(
      role,
    );
  const identity = `${profile?.name || ''} ${user?.email || ''}`
    .trim()
    .toLocaleLowerCase('de');
  return /(^|[\s.@_-])(marlon|jasmin)([\s.@_-]|$)/.test(identity);
}

export async function getInventoryAccess(request: Request) {
  const user = await getInventoryUser(request);
  const accessToken = readCookie(request, 'fp_inventory_access');
  const profile = user ? await getInventoryProfile(accessToken, user.id) : null;
  return {
    user,
    profile,
    canManage: canManageInventory(user, profile),
  };
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

export async function requireInventoryManager(request: Request) {
  const access = await getInventoryAccess(request);
  if (!access.user)
    return Response.json(
      { error: 'FormPoesie-Anmeldung erforderlich.' },
      { status: 401 },
    );
  return access.canManage
    ? null
    : Response.json(
        {
          error:
            'Dieser Verwaltungsbereich ist nur für Jasmin und Marlon freigegeben.',
        },
        { status: 403 },
      );
}
