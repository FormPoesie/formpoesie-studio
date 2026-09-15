import {
  INVENTORY_SUPABASE_URL,
  getInventoryUser,
  inventoryHeaders,
  readCookie,
} from '@/lib/inventory-bridge';
import { inventoryUserForToken, resetInventoryUserPassword, updateInventoryAccount } from '@/lib/cloudflare-auth';

export async function PATCH(request: Request) {
  const accessToken = readCookie(request, 'fp_inventory_access');
  const user = await getInventoryUser(request);
  if (!accessToken || !user?.id)
    return Response.json({ error: 'Anmeldung erforderlich.' }, { status: 401 });
  const body = (await request.json()) as {
    name?: string; email?: string; currentPassword?: string; password?: string; targetUserId?: string;
  };
  if (await inventoryUserForToken(accessToken)) {
    const local = body.targetUserId
      ? await resetInventoryUserPassword(accessToken, body.targetUserId, body.password || '')
      : await updateInventoryAccount(accessToken, body);
    return Response.json(local, { status: 'status' in local ? local.status : 200 });
  }
  const result: { nameSaved?: boolean; emailRequested?: boolean } = {};

  if (typeof body.name === 'string' && body.name.trim()) {
    const response = await fetch(
      `${INVENTORY_SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`,
      {
        method: 'PATCH',
        headers: {
          ...inventoryHeaders(accessToken),
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ name: body.name.trim() }),
      },
    );
    if (!response.ok)
      return Response.json(
        { error: 'Name konnte nicht gespeichert werden.' },
        { status: 400 },
      );
    result.nameSaved = true;
  }

  if (
    typeof body.email === 'string' &&
    body.email.trim() &&
    body.email.trim() !== user.email
  ) {
    const response = await fetch(`${INVENTORY_SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: inventoryHeaders(accessToken),
      body: JSON.stringify({ email: body.email.trim() }),
    });
    const responseBody = (await response.json().catch(() => null)) as {
      message?: string;
      msg?: string;
    } | null;
    if (!response.ok)
      return Response.json(
        {
          error:
            responseBody?.message ||
            responseBody?.msg ||
            'E-Mail konnte nicht geändert werden.',
        },
        { status: 400 },
      );
    result.emailRequested = true;
  }
  return Response.json({ saved: true, ...result });
}
