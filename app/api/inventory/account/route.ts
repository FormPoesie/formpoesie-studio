import { getInventoryUser, readCookie } from '@/lib/inventory-bridge';
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
  return Response.json({ error: 'Cloudflare-Konto nicht gefunden.' }, { status: 404 });
}
