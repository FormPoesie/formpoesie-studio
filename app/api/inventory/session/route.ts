import {
  createStudioSession,
  canManageInventory,
  getInventoryUser,
  getInventoryProfile,
  readCookie,
  sessionCookie,
} from '@/lib/inventory-bridge';
import { env } from 'cloudflare:workers';

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
  const secrets = env as unknown as Record<string, string | undefined>;
  const expectedEmail = (secrets.STUDIO_ADMIN_EMAIL || 'formpoesie@gmail.com')
    .trim()
    .toLocaleLowerCase('de');
  if (
    body.email.trim().toLocaleLowerCase('de') !== expectedEmail ||
    !secrets.STUDIO_ADMIN_PASSWORD ||
    body.password !== secrets.STUDIO_ADMIN_PASSWORD
  )
    return Response.json(
      { error: 'E-Mail-Adresse oder Passwort ist nicht korrekt.' },
      { status: 401 },
    );
  const accessToken = await createStudioSession(expectedEmail);
  if (!accessToken)
    return Response.json(
      {
        error: 'Die sichere Anmeldung ist noch nicht vollständig eingerichtet.',
      },
      { status: 503 },
    );
  const result = {
    access_token: accessToken,
    refresh_token: accessToken,
    expires_in: 60 * 60 * 24 * 30,
  };
  const user = { id: 'studio-owner', email: expectedEmail };
  const profile = await getInventoryProfile(accessToken, user.id);
  return addSessionCookies(
    Response.json({
      connected: true,
      email: expectedEmail,
      name: profile?.name || '',
      canManage: canManageInventory(user, profile),
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
