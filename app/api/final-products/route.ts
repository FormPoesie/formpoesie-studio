import { env } from 'cloudflare:workers';

type Row = Record<string, unknown>;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function snapshot(table: string) {
  const record = await env.DB.prepare(
    'SELECT rows_json FROM inventory_snapshots WHERE table_name = ?',
  )
    .bind(table)
    .first<{ rows_json: string }>();
  try {
    const parsed = JSON.parse(record?.rows_json || '[]');
    return Array.isArray(parsed) ? (parsed as Row[]) : [];
  } catch {
    return [];
  }
}

function publicImageUrl(origin: string, value: unknown) {
  const path = text(value).trim();
  if (!path.startsWith('/api/inventory/product-assets?id=')) return null;
  const id = new URL(path, origin).searchParams.get('id');
  return id
    ? new URL(`/api/final-products/image?id=${encodeURIComponent(id)}`, origin)
        .href
    : null;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secrets = env as unknown as Record<string, string | undefined>;
  const token = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '');
  const includeCosts = Boolean(
    secrets.PRODUCTS_API_KEY && token === secrets.PRODUCTS_API_KEY,
  );
  const limit = Math.min(
    250,
    Math.max(1, Number(url.searchParams.get('limit')) || 100),
  );
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const updatedAfter = url.searchParams.get('updatedAfter') || '';
  const [
    products,
    variants,
    filaments,
    families,
    designers,
    materials,
    brands,
    metadataResult,
    assetResult,
    channelPriceResult,
  ] = await Promise.all([
    snapshot('products'),
    snapshot('product_variants'),
    snapshot('product_filaments'),
    snapshot('product_families'),
    snapshot('designers'),
    snapshot('materials'),
    snapshot('brands'),
    env.DB.prepare(
      `SELECT product_id AS productId, finalized_at AS finalizedAt,
              updated_at AS updatedAt
       FROM inventory_product_metadata WHERE review_status = 'final'`,
    ).all<Row>(),
    env.DB.prepare(
      `SELECT id, product_id AS productId, filename, content_type AS contentType,
              size_bytes AS sizeBytes, is_primary AS isPrimary, updated_at AS updatedAt
       FROM inventory_product_assets WHERE asset_kind = 'image'
       ORDER BY is_primary DESC, created_at ASC`,
    ).all<Row>(),
    env.DB.prepare(
      `SELECT entity_kind AS entityKind, row_id AS rowId,
              direct_price_cents AS directPriceCents,
              etsy_price_cents AS etsyPriceCents,
              vinted_price_cents AS vintedPriceCents,
              ebay_price_cents AS ebayPriceCents,
              market_price_cents AS marketPriceCents
       FROM inventory_channel_prices`,
    ).all<Row>(),
  ]);
  const finalMetadata = new Map(
    (metadataResult.results || []).map((row) => [text(row.productId), row]),
  );
  const channelPrices = new Map(
    (channelPriceResult.results || []).map((row) => [
      `${text(row.entityKind)}:${text(row.rowId)}`,
      row,
    ]),
  );
  const materialById = new Map(materials.map((row) => [text(row.id), row]));
  const brandById = new Map(brands.map((row) => [text(row.id), row]));
  const familyById = new Map(families.map((row) => [text(row.id), row]));
  const designerById = new Map(designers.map((row) => [text(row.id), row]));
  const prices = (kind: string, id: unknown, fallback: unknown) => {
    const saved = channelPrices.get(`${kind}:${text(id)}`) || {};
    const standard = number(fallback);
    return {
      standardCents: standard,
      directCents: number(saved.directPriceCents) ?? standard,
      etsyCents: number(saved.etsyPriceCents) ?? standard,
      vintedCents: number(saved.vintedPriceCents) ?? standard,
      ebayCents: number(saved.ebayPriceCents) ?? standard,
      marketCents: number(saved.marketPriceCents) ?? standard,
      currency: 'EUR',
    };
  };
  const finalProducts = products
    .filter((product) => {
      const metadata = finalMetadata.get(text(product.id));
      if (!metadata || product.deleted_at != null) return false;
      const updated = text(metadata.updatedAt || product.updated_at);
      return !updatedAfter || updated > updatedAfter;
    })
    .sort((left, right) =>
      text(left.name).localeCompare(text(right.name), 'de'),
    );
  const page = finalProducts.slice(offset, offset + limit).map((product) => {
    const productId = text(product.id);
    const metadata = finalMetadata.get(productId) || {};
    const assets = (assetResult.results || [])
      .filter((asset) => text(asset.productId) === productId)
      .map((asset) => ({
        id: text(asset.id),
        url: new URL(
          `/api/final-products/image?id=${encodeURIComponent(text(asset.id))}`,
          url.origin,
        ).href,
        filename: text(asset.filename),
        contentType: text(asset.contentType),
        sizeBytes: number(asset.sizeBytes),
        primary: asset.isPrimary === 1 || asset.isPrimary === true,
        updatedAt: text(asset.updatedAt),
      }));
    const family = familyById.get(text(product.family_id));
    const designer = designerById.get(text(product.designer_id));
    const productVariants = variants
      .filter(
        (variant) =>
          text(variant.product_id || variant.productId) === productId &&
          variant.deleted_at == null,
      )
      .map((variant) => {
        const material = materialById.get(text(variant.material_id));
        const brand = material
          ? brandById.get(text(material.brand_id))
          : undefined;
        return {
          id: text(variant.id),
          name: text(variant.name),
          sku: text(variant.sku) || null,
          size: text(variant.size) || null,
          appearance: text(variant.appearance) || null,
          quantity: number(variant.quantity) ?? 1,
          prices: prices('product_variants', variant.id, variant.price_cents),
          imageUrl: publicImageUrl(url.origin, variant.image_url),
          material: material
            ? {
                id: text(material.id),
                name: text(material.name),
                variant: text(material.variant) || null,
                type: text(material.material_type) || null,
                brand: brand ? text(brand.name) : null,
              }
            : null,
          ...(includeCosts
            ? {
                costs: {
                  productionCostCents: number(variant.production_cost_cents),
                  extraCostCents: number(variant.extra_cost_cents) ?? 0,
                  filamentGrams: number(variant.grams),
                  wasteGrams: number(variant.waste_grams),
                  printMinutes: number(variant.print_minutes),
                },
              }
            : {}),
        };
      });
    const productFilaments = filaments
      .filter((item) => text(item.product_id) === productId)
      .map((item) => {
        const material = materialById.get(text(item.material_id));
        const brand = material
          ? brandById.get(text(material.brand_id))
          : undefined;
        return {
          id: text(item.id),
          variantId: text(item.product_variant_id) || null,
          part: text(item.part) || null,
          grams: number(item.grams),
          wasteGrams: number(item.waste_grams),
          printMinutes: number(item.print_minutes),
          printer: text(item.printer) || null,
          material: material
            ? {
                id: text(material.id),
                name: text(material.name),
                variant: text(material.variant) || null,
                brand: brand ? text(brand.name) : null,
                pricePerRollCents: number(material.price_per_roll_cents),
                spoolWeightGrams: number(material.spool_weight_grams),
              }
            : null,
        };
      });
    return {
      id: productId,
      name: text(product.name),
      sku: text(product.sku) || null,
      category: text(product.category) || null,
      description: text(product.description || product.note) || null,
      size: text(product.size) || null,
      dimensionsMm: {
        width: number(product.width_mm),
        height: number(product.height_mm),
        depth: number(product.depth_mm),
      },
      family: family
        ? { id: text(family.id), name: text(family.name) }
        : null,
      designer: designer
        ? { id: text(designer.id), name: text(designer.name) }
        : null,
      designOrigin: text(product.design_origin) || null,
      commercialLicense: product.commercial_license ?? null,
      prices: prices('products', product.id, product.default_price_cents),
      primaryImageUrl:
        assets.find((asset) => asset.primary)?.url ||
        assets[0]?.url ||
        publicImageUrl(url.origin, product.image_uri),
      images: assets,
      variants: productVariants,
      ...(includeCosts
        ? {
            costs: {
              productionCostCents: number(product.production_cost_cents),
              extraCostCents: number(product.extra_cost_cents) ?? 0,
              filamentGrams: number(product.filament_grams),
              printMinutes: number(product.print_minutes),
              printer: text(product.printer) || null,
              filaments: productFilaments,
            },
          }
        : {}),
      finalizedAt: text(metadata.finalizedAt) || null,
      updatedAt: text(metadata.updatedAt || product.updated_at),
    };
  });
  return Response.json(
    {
      version: '1',
      costsIncluded: includeCosts,
      generatedAt: new Date().toISOString(),
      total: finalProducts.length,
      count: page.length,
      offset,
      limit,
      hasMore: offset + page.length < finalProducts.length,
      products: page,
    },
    { headers: { ...cors, 'Cache-Control': 'public, max-age=300' } },
  );
}
