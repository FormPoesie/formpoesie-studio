import {
  INVENTORY_SUPABASE_URL,
  inventoryHeaders,
  normalizeInventoryProduct,
  readCookie,
} from '@/lib/inventory-bridge';

export async function GET(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  if (!accessToken)
    return Response.json(
      { connected: false, error: 'Inventar ist nicht verbunden.' },
      { status: 401 },
    );
  const select =
    '*,filaments:product_filaments(*,material:materials(*)),variants:product_variants(*,material:materials(*))';
  const response = await fetch(
    INVENTORY_SUPABASE_URL +
      '/rest/v1/products?deleted_at=is.null&order=name.asc&select=' +
      encodeURIComponent(select),
    { headers: inventoryHeaders(accessToken) },
  );
  const result = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok)
    return Response.json(
      {
        connected: false,
        error: 'Inventardaten konnten nicht gelesen werden.',
      },
      { status: response.status },
    );
  const items = Array.isArray(result)
    ? result.map((row) =>
        normalizeInventoryProduct(row as Record<string, unknown>),
      )
    : [];
  return Response.json({ connected: true, count: items.length, items });
}
