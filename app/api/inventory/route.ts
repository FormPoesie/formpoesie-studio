import {
  normalizeInventoryProduct,
  readCookie,
} from '@/lib/inventory-bridge';
import { offlineQuery } from '@/lib/offline-inventory';

export async function GET(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  if (!accessToken)
    return Response.json(
      { connected: false, error: 'Inventar ist nicht verbunden.' },
      { status: 401 },
    );
  const result = offlineQuery(
    'products',
    'deleted_at=is.null&order=name.asc',
  );
  const items = Array.isArray(result)
    ? result.map((row) =>
        normalizeInventoryProduct(row as Record<string, unknown>),
      )
    : [];
  return Response.json({ connected: true, count: items.length, items });
}
