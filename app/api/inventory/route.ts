import { env } from 'cloudflare:workers';
import {
  getInventoryUser,
  normalizeInventoryProduct,
} from '@/lib/inventory-bridge';

type Row = Record<string, unknown>;

const scalarText = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

async function snapshot(table: string) {
  const result = await env.DB.prepare(
    'SELECT rows_json FROM inventory_snapshots WHERE table_name = ?',
  )
    .bind(table)
    .first<{ rows_json: string }>();
  if (!result) return [] as Row[];
  try {
    const rows = JSON.parse(result.rows_json);
    return Array.isArray(rows) ? (rows as Row[]) : [];
  } catch {
    return [] as Row[];
  }
}

export async function GET(request: Request) {
  const user = await getInventoryUser(request);
  if (!user)
    return Response.json(
      { connected: false, error: 'Inventar ist nicht verbunden.' },
      { status: 401 },
    );
  const [products, designers, filaments, variants, materials] =
    await Promise.all([
      snapshot('products'),
      snapshot('designers'),
      snapshot('product_filaments'),
      snapshot('product_variants'),
      snapshot('materials'),
    ]);
  const material = (id: unknown) =>
    materials.find((row) => String(row.id) === String(id)) || null;
  const items = products
    .filter((row) => row.deleted_at == null)
    .sort((left, right) =>
      scalarText(left.name).localeCompare(scalarText(right.name), 'de'),
    )
    .map((row) =>
      normalizeInventoryProduct({
        ...row,
        designer:
          designers.find(
            (designer) => String(designer.id) === String(row.designer_id),
          ) || null,
        filaments: filaments
          .filter((item) => String(item.product_id) === String(row.id))
          .map((item) => ({
            ...item,
            material: material(item.material_id),
          })),
        variants: variants
          .filter((item) => String(item.product_id) === String(row.id))
          .map((item) => ({
            ...item,
            material: material(item.material_id),
          })),
      }),
    );
  return Response.json({ connected: true, count: items.length, items });
}
