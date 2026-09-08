import {
  INVENTORY_SUPABASE_URL,
  getInventoryUser,
  inventoryHeaders,
  readCookie,
} from '@/lib/inventory-bridge';

type JsonRecord = Record<string, unknown>;

const entityFields: Record<string, Set<string>> = {
  products: new Set([
    'name',
    'family_id',
    'designer_id',
    'size',
    'category',
    'image_uri',
    'model_url',
    'commercial_license',
    'print_files',
    'printer',
    'print_minutes',
    'production_cost_cents',
    'filament_grams',
    'stock_quantity',
    'base_stock_quantity',
    'default_price_cents',
    'extra_cost_cents',
    'default_accessories',
    'note',
    'archived_at',
  ]),
  product_variants: new Set([
    'product_id',
    'weight_class_group',
    'name',
    'material_id',
    'grams',
    'waste_grams',
    'size',
    'appearance',
    'quantity',
    'discount_percent',
    'defect_note',
    'production_cost_cents',
    'accessories',
    'extra_cost_cents',
    'image_url',
    'price_cents',
    'printer',
    'print_minutes',
    'position',
  ]),
  product_filaments: new Set([
    'product_id',
    'product_variant_id',
    'material_id',
    'grams',
    'waste_grams',
    'part',
    'printer',
    'print_minutes',
    'stock_quantity',
    'printed_together',
    'position',
  ]),
  product_components: new Set([
    'parent_product_id',
    'parent_variant_id',
    'component_product_id',
    'component_variant_id',
    'quantity',
    'inventory_tracking_mode',
    'color_requirement',
    'slot',
    'consumed_at',
  ]),
  product_accessories: new Set([
    'product_id',
    'product_variant_id',
    'accessory_product_id',
    'accessory_variant_id',
  ]),
  market_demands: new Set([
    'market_id',
    'product_id',
    'product_variant_id',
    'quantity',
    'note',
  ]),
  materials: new Set([
    'name',
    'brand_id',
    'with_spool',
    'price_per_roll_cents',
    'spool_weight_grams',
    'variant',
    'material_type',
    'storage_location_id',
    'quantity',
    'unit',
    'status',
    'note',
  ]),
  markets: new Set(['name', 'location', 'date', 'end_date', 'status']),
  online_sales: new Set([
    'printer',
    'print_deadline',
    'shipping_method',
    'shipping_deadline',
    'shipping_recipient',
    'shipping_label_uri',
    'is_printed',
    'is_shipped',
    'note',
  ]),
  other_expenses: new Set([
    'article_name',
    'vendor',
    'invoice_date',
    'quantity',
    'price_cents',
    'is_monthly',
    'end_date',
    'note',
  ]),
};

const rpcNames = new Set([
  'bestand_buchen',
  'bestand_zurueck_buchen',
  'bestand_auf_markt_buchen',
  'markt_buchen',
  'markt_zurueck_buchen',
  'marktpreis_setzen',
  'verkauf_buchen',
  'versand_buchen',
  'versand_zuruecknehmen',
  'zusammenbauen',
  'verkaufs_bauteile_buchen',
]);

const entitiesWithUpdatedBy = new Set([
  'products',
  'materials',
  'online_sales',
  'other_expenses',
]);

const entitiesWithCreatedBy = new Set([
  'products',
  'materials',
  'online_sales',
  'other_expenses',
  'product_components',
  'product_accessories',
  'market_demands',
]);

const trashableEntities = new Set([
  'products',
  'materials',
  'markets',
  'other_expenses',
]);

function toCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCamel);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, item]) => [
      key.replace(/_([a-z0-9])/g, (_, character: string) =>
        character.toUpperCase(),
      ),
      toCamel(item),
    ]),
  );
}

function toSnake(name: string) {
  return name.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function safeValues(entity: string, values: JsonRecord) {
  const allowed = entityFields[entity];
  if (!allowed) return null;
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [toSnake(key), value] as const)
      .filter(([key, value]) => allowed.has(key) && value !== undefined),
  );
}

async function inventoryFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
) {
  const headers = new Headers(inventoryHeaders(accessToken));
  headers.set('Prefer', 'return=representation');
  if (init?.headers) {
    for (const [key, value] of new Headers(init.headers))
      headers.set(key, value);
  }
  const response = await fetch(INVENTORY_SUPABASE_URL + '/rest/v1/' + path, {
    ...init,
    headers,
  });
  const result = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = result as { message?: string; details?: string } | null;
    throw new Error(
      error?.message ||
        error?.details ||
        'Inventardaten konnten nicht gelesen werden.',
    );
  }
  return toCamel(result);
}

async function query(accessToken: string, table: string, params: string) {
  return inventoryFetch(accessToken, `${table}?${params}`);
}

async function loadArea(accessToken: string, area: string, request: Request) {
  if (area === 'products') {
    const [products, families, designers, components, accessories, materials] =
      await Promise.all([
        query(
          accessToken,
          'products',
          'select=' +
            encodeURIComponent(
              '*,filaments:product_filaments(*,material:materials(*,brand:brands(*))),variants:product_variants(*,material:materials(*,brand:brands(*)))',
            ) +
            '&deleted_at=is.null&order=name.asc',
        ),
        query(
          accessToken,
          'product_families',
          'select=*&deleted_at=is.null&order=name.asc',
        ),
        query(
          accessToken,
          'designers',
          'select=*&deleted_at=is.null&order=name.asc',
        ),
        query(accessToken, 'product_components', 'select=*&order=id.asc'),
        query(
          accessToken,
          'product_accessories',
          'select=*&order=id.asc',
        ).catch(() => []),
        query(
          accessToken,
          'materials',
          'select=' +
            encodeURIComponent('*,brand:brands(*)') +
            '&deleted_at=is.null&order=name.asc',
        ),
      ]);
    return {
      products,
      families,
      designers,
      components,
      accessories,
      materials,
    };
  }
  if (area === 'materials') {
    const [materials, brands, storageLocations] = await Promise.all([
      query(
        accessToken,
        'materials',
        'select=' +
          encodeURIComponent(
            '*,brand:brands(*),storageLocation:storage_locations(*),locations:material_locations(*,storageLocation:storage_locations(*))',
          ) +
          '&deleted_at=is.null&order=name.asc',
      ),
      query(
        accessToken,
        'brands',
        'select=*&deleted_at=is.null&order=name.asc',
      ),
      query(
        accessToken,
        'storage_locations',
        'select=*&deleted_at=is.null&order=name.asc',
      ),
    ]);
    return { materials, brands, storageLocations };
  }
  if (area === 'markets') {
    const [markets, demands, articles, sales, expenses] = await Promise.all([
      query(
        accessToken,
        'markets',
        'select=*&deleted_at=is.null&order=date.desc',
      ),
      query(
        accessToken,
        'market_demands',
        'select=*&deleted_at=is.null&order=id.desc',
      ),
      query(
        accessToken,
        'articles',
        'select=' +
          encodeURIComponent('*,variants:article_variants(*)') +
          '&deleted_at=is.null&order=id.desc',
      ),
      query(
        accessToken,
        'sales',
        'select=' +
          encodeURIComponent('*,items:sale_items(*)') +
          '&deleted_at=is.null&order=date.desc',
      ),
      query(
        accessToken,
        'expenses',
        'select=*&deleted_at=is.null&order=created_at.desc',
      ),
    ]);
    return { markets, demands, articles, sales, expenses };
  }
  if (area === 'online') {
    const onlineSales = await query(
      accessToken,
      'online_sales',
      'select=' +
        encodeURIComponent(
          '*,filaments:online_sale_filaments(*),product:products(category)',
        ) +
        '&deleted_at=is.null&order=date.desc',
    );
    return { onlineSales };
  }
  if (area === 'sales') {
    const [sales, markets, onlineSales] = await Promise.all([
      query(
        accessToken,
        'sales',
        'select=' +
          encodeURIComponent(
            '*,items:sale_items(*,articleVariant:article_variants(*,article:articles(*)))',
          ) +
          '&deleted_at=is.null&order=date.desc',
      ),
      query(accessToken, 'markets', 'select=id,name,location,date,end_date'),
      query(
        accessToken,
        'online_sales',
        'select=*&deleted_at=is.null&order=date.desc',
      ),
    ]);
    return { sales, markets, onlineSales };
  }
  if (area === 'months') {
    const [sales, expenses, onlineSales, otherExpenses, markets] =
      await Promise.all([
        query(
          accessToken,
          'sales',
          'select=' +
            encodeURIComponent('*,items:sale_items(*)') +
            '&deleted_at=is.null&order=date.desc',
        ),
        query(
          accessToken,
          'expenses',
          'select=*&deleted_at=is.null&order=date.desc',
        ),
        query(
          accessToken,
          'online_sales',
          'select=*&deleted_at=is.null&order=date.desc',
        ),
        query(
          accessToken,
          'other_expenses',
          'select=*&deleted_at=is.null&order=invoice_date.desc',
        ),
        query(accessToken, 'markets', 'select=id,name,date,end_date'),
      ]);
    return { sales, expenses, onlineSales, otherExpenses, markets };
  }
  if (area === 'trash') {
    const [products, materials, markets, otherExpenses] = await Promise.all([
      query(accessToken, 'products', 'select=*&deleted_at=not.is.null'),
      query(accessToken, 'materials', 'select=*&deleted_at=not.is.null'),
      query(accessToken, 'markets', 'select=*&deleted_at=not.is.null'),
      query(accessToken, 'other_expenses', 'select=*&deleted_at=not.is.null'),
    ]);
    return { products, materials, markets, otherExpenses };
  }
  if (area === 'account') {
    const user = await getInventoryUser(request);
    const profiles = user?.id
      ? await query(
          accessToken,
          'profiles',
          `select=id,name,role&id=eq.${encodeURIComponent(user.id)}`,
        )
      : [];
    return { user, profile: Array.isArray(profiles) ? profiles[0] : null };
  }
  throw new Error('Unbekannter Inventarbereich.');
}

export async function GET(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  if (!accessToken)
    return Response.json(
      { error: 'FormPoesie-Anmeldung erforderlich.' },
      { status: 401 },
    );
  const area = new URL(request.url).searchParams.get('area') || 'products';
  try {
    return Response.json(await loadArea(accessToken, area, request));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Inventardaten konnten nicht gelesen werden.',
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  const user = await getInventoryUser(request);
  if (!accessToken || !user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const body = (await request.json()) as {
    entity?: string;
    values?: JsonRecord;
    rpc?: string;
    args?: JsonRecord;
  };
  try {
    if (body.rpc) {
      if (!rpcNames.has(body.rpc))
        return Response.json(
          { error: 'Aktion ist nicht freigegeben.' },
          { status: 400 },
        );
      const args = {
        ...body.args,
        ...(body.rpc === 'verkauf_buchen'
          ? { p_created_by: user.id || null }
          : {}),
      };
      const result = await inventoryFetch(accessToken, `rpc/${body.rpc}`, {
        method: 'POST',
        body: JSON.stringify(args),
      });
      return Response.json({ saved: true, result });
    }
    if (!body.entity || !body.values)
      return Response.json({ error: 'Datensatz fehlt.' }, { status: 400 });
    const values = safeValues(body.entity, body.values);
    if (!values || !Object.keys(values).length)
      return Response.json(
        { error: 'Keine gültigen Felder.' },
        { status: 400 },
      );
    const createValues = {
      ...values,
      ...(entitiesWithCreatedBy.has(body.entity)
        ? { created_by: user.id || null }
        : {}),
      ...(entitiesWithUpdatedBy.has(body.entity)
        ? { updated_by: user.id || null }
        : {}),
    };
    const result = await inventoryFetch(accessToken, body.entity, {
      method: 'POST',
      body: JSON.stringify(createValues),
    });
    return Response.json({ saved: true, result }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Speichern fehlgeschlagen.',
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  const user = await getInventoryUser(request);
  if (!accessToken || !user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const body = (await request.json()) as {
    entity?: string;
    id?: number | string;
    values?: JsonRecord;
  };
  if (!body.entity || body.id == null || !body.values)
    return Response.json({ error: 'Datensatz fehlt.' }, { status: 400 });
  const values = safeValues(body.entity, body.values);
  if (!values || !Object.keys(values).length)
    return Response.json({ error: 'Keine gültigen Felder.' }, { status: 400 });
  try {
    const updateValues = entitiesWithUpdatedBy.has(body.entity)
      ? { ...values, updated_by: user.id || null }
      : values;
    const result = await inventoryFetch(
      accessToken,
      `${body.entity}?id=eq.${encodeURIComponent(String(body.id))}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updateValues),
      },
    );
    return Response.json({ saved: true, result });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Speichern fehlgeschlagen.',
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  const user = await getInventoryUser(request);
  if (!accessToken || !user)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const body = (await request.json()) as {
    entity?: string;
    id?: number | string;
    restore?: boolean;
  };
  if (!body.entity || body.id == null || !trashableEntities.has(body.entity))
    return Response.json({ error: 'Datensatz fehlt.' }, { status: 400 });
  try {
    const result = await inventoryFetch(
      accessToken,
      `${body.entity}?id=eq.${encodeURIComponent(String(body.id))}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          deleted_at: body.restore ? null : new Date().toISOString(),
          ...(entitiesWithUpdatedBy.has(body.entity)
            ? { updated_by: user.id || null }
            : {}),
        }),
      },
    );
    return Response.json({ saved: true, result });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Aktion fehlgeschlagen.',
      },
      { status: 400 },
    );
  }
}
