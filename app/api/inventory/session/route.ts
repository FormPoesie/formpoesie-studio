import {
  INVENTORY_SUPABASE_URL,
  canManageInventory,
  canAccessInventoryAdministration,
  getInventoryUser,
  getInventoryProfile,
  inventoryHeaders,
  readCookie,
  sessionCookie,
} from '@/lib/inventory-bridge';
import { authenticateInventoryUser, deleteInventorySession } from '@/lib/cloudflare-auth';

const accessName = 'fp_inventory_access';
const refreshName = 'fp_inventory_refresh';

function addSessionCookies(
  response: Response,
  request: Request,
  session: { access_token: string; refresh_token: string; expires_in?: number },
) {
  response.headers.append(
    'Set-Cookie',
    sessionCookie(
      request,
      accessName,
      session.access_token,
      Math.max(60, session.expires_in || 3600),
    ),
  );
  response.headers.append(
    'Set-Cookie',
    sessionCookie(
      request,
      refreshName,
      session.refresh_token,
      60 * 60 * 24 * 30,
    ),
  );
  return response;
}

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

  const refreshToken = readCookie(request, refreshName);
  if (!refreshToken) return Response.json({ connected: false });
  const refreshed = await fetch(
    INVENTORY_SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token',
    {
      method: 'POST',
      headers: inventoryHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );
  if (!refreshed.ok) return Response.json({ connected: false });
  const session = (await refreshed.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    user?: { email?: string; id?: string };
  };
  const profile = await getInventoryProfile(
    session.access_token,
    session.user?.id,
  );
  return addSessionCookies(
    Response.json({
      connected: true,
      email: session.user?.email || '',
      name: profile?.name || '',
      canManage: canManageInventory(session.user || null, profile),
      canAdmin: canAccessInventoryAdministration(session.user || null, profile),
    }),
    request,
    session,
  );
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
  const response = await fetch(
    INVENTORY_SUPABASE_URL + '/auth/v1/token?grant_type=password',
    {
      method: 'POST',
      headers: inventoryHeaders(),
      body: JSON.stringify({
        email: body.email.trim(),
        password: body.password,
      }),
    },
  );
  const result = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: { email?: string; id?: string };
    error_description?: string;
    msg?: string;
  };
  if (!response.ok || !result.access_token || !result.refresh_token)
    return Response.json(
      {
        error:
          result.error_description ||
          result.msg ||
          'Anmeldung am Inventar ist fehlgeschlagen.',
      },
      { status: 401 },
    );
  const profile = await getInventoryProfile(
    result.access_token,
    result.user?.id,
  );
  return addSessionCookies(
    Response.json({
      connected: true,
      email: result.user?.email || body.email,
      name: profile?.name || '',
      canManage: canManageInventory(result.user || null, profile),
      canAdmin: canAccessInventoryAdministration(result.user || null, profile),
    }),
    request,
    result as {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
    },
  );
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
