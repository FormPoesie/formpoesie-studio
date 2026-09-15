import {
  canManageInventory,
  canAccessInventoryAdministration,
  getInventoryUser,
  getInventoryProfile,
  readCookie,
  sessionCookie,
} from '@/lib/inventory-bridge';
import { authenticateInventoryUser, deleteInventorySession } from '@/lib/cloudflare-auth';

const accessName = 'fp_inventory_access';
const refreshName = 'fp_inventory_refresh';

export async function GET(request: Request) {
  const currentUser = await getInventoryUser(request);
  if (currentUser)
    return getInventoryProfile(
      readCookie(request, accessName),
      currentUser.id,
    ).then((profile) =>
      Response.json({
        connected: true,
        email: currentUser.email || '',
        name: profile?.name || '',
        canManage: canManageInventory(currentUser, profile),
        canAdmin: canAccessInventoryAdministration(currentUser, profile),
      }),
    );

  return Response.json({ connected: false });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string };
  if (!body.email?.trim() || !body.password)
    return Response.json(
      { error: 'E-Mail-Adresse und Passwort fehlen.' },
      { status: 400 },
    );
  const local = await authenticateInventoryUser(body.email, body.password);
  if (local) {
    const response = Response.json({
      connected: true,
      email: local.user.email,
      name: local.user.name,
      canManage: canManageInventory(local.user, { id: local.user.id, name: local.user.name, role: local.user.role }),
      canAdmin: canAccessInventoryAdministration(local.user, { id: local.user.id, name: local.user.name, role: local.user.role }),
    });
    response.headers.append(
      'Set-Cookie',
      sessionCookie(request, accessName, local.token, 60 * 60 * 24 * 30),
    );
    return response;
  }
  return Response.json({ error: 'Anmeldung am Inventar ist fehlgeschlagen.' }, { status: 401 });
}

export async function DELETE(request: Request) {
  await deleteInventorySession(readCookie(request, accessName));
  const response = Response.json({ connected: false });
  response.headers.append(
    'Set-Cookie',
    sessionCookie(request, accessName, '', 0),
  );
  response.headers.append(
    'Set-Cookie',
    sessionCookie(request, refreshName, '', 0),
  );
  return response;
}
